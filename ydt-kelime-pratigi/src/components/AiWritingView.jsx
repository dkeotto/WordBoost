import React, { useMemo, useRef, useState } from "react";

const TYPES = [
  { id: "essay", label: "Essay" },
  { id: "blog", label: "Blog post" },
  { id: "caption", label: "Social caption" },
  { id: "product", label: "Product description" },
  { id: "email", label: "Email" },
];

const TONES = [
  { id: "casual", label: "Casual" },
  { id: "professional", label: "Professional" },
  { id: "genz", label: "Gen Z / modern" },
];

const LENGTHS = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long" },
];

function blurTextForFreeUser(text) {
  const s = String(text || "");
  if (s.length <= 160) return s;
  const head = s.slice(0, 140);
  const tail = s.slice(140);
  return `${head}\n\n[Premium önizleme dışı]\n${tail}`;
}

export default function AiWritingView({ user, onGoPremium }) {
  const token = user?.token || "";
  const isPremium = Boolean(user?.isPremium || (user?.premiumUntil && new Date(user.premiumUntil).getTime() > Date.now()));

  const [type, setType] = useState("blog");
  const [tone, setTone] = useState("casual");
  const [length, setLength] = useState("medium");
  const [language, setLanguage] = useState("tr");
  const [audience, setAudience] = useState("");
  const [context, setContext] = useState("");
  const [inputText, setInputText] = useState("");

  const [output, setOutput] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [err, setErr] = useState("");
  const [usage, setUsage] = useState(null);
  const [usedToday, setUsedToday] = useState(null);
  const [limitPerDay, setLimitPerDay] = useState(null);
  const abortRef = useRef(null);

  const canUse = Boolean(token);

  const visibleOutput = useMemo(() => {
    if (!output) return "";
    if (isPremium) return output;
    // Free kullanıcıda “preview” hissi için kısmi blur yaklaşımı
    return blurTextForFreeUser(output);
  }, [output, isPremium]);

  const streamSse = async ({ path, body, onText, onDone }) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data?.error || `AI stream error (${res.status})`;
      const err = new Error(msg);
      err.payload = data;
      throw err;
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Streaming desteklenmiyor");

    const decoder = new TextDecoder();
    let buf = "";
    let currentEvent = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const part of parts) {
        const lines = part.split("\n").map((l) => l.trimEnd());
        let dataLine = "";
        for (const ln of lines) {
          if (ln.startsWith("event:")) currentEvent = ln.slice(6).trim();
          if (ln.startsWith("data:")) dataLine += ln.slice(5).trim();
        }
        if (!dataLine) continue;
        let payload = null;
        try {
          payload = JSON.parse(dataLine);
        } catch {
          payload = { text: dataLine };
        }
        if (currentEvent === "text") onText?.(payload?.text || "");
        if (currentEvent === "done") onDone?.(payload);
        if (currentEvent === "error") throw new Error(payload?.error || "AI error");
      }
    }
  };

  const callWrite = async () => {
    if (!canUse) {
      setErr("AI Mode için giriş gerekli.");
      return;
    }
    setIsBusy(true);
    setErr("");
    try {
      setOutput("");
      await streamSse({
        path: "/api/ai/write/stream",
        body: { type, tone, length, language, audience, context, inputText },
        onText: (t) => setOutput((prev) => prev + t),
        onDone: (d) => {
          setUsage(d?.usage || null);
          setUsedToday(d?.usedToday ?? null);
          setLimitPerDay(d?.limitPerDay ?? null);
        },
      });
    } catch (e) {
      if (e?.payload?.error === "free_limit_reached") {
        setLimitPerDay(e.payload.limitPerDay ?? 3);
        setUsedToday(e.payload.usedToday ?? null);
      }
      setErr(e.message || "AI hata");
    } finally {
      setIsBusy(false);
    }
  };

  const callRewrite = async (mode) => {
    if (!canUse) {
      setErr("AI Mode için giriş gerekli.");
      return;
    }
    const base = output || inputText;
    if (!base.trim()) {
      setErr("Önce bir metin üret veya giriş alanına metin yaz.");
      return;
    }
    setIsBusy(true);
    setErr("");
    try {
      setOutput("");
      await streamSse({
        path: "/api/ai/rewrite/stream",
        body: { mode, tone, language, inputText: base },
        onText: (t) => setOutput((prev) => prev + t),
        onDone: (d) => {
          setUsage(d?.usage || null);
          setUsedToday(d?.usedToday ?? null);
          setLimitPerDay(d?.limitPerDay ?? null);
        },
      });
    } catch (e) {
      setErr(e.message || "AI hata");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="ai-writing">
      <div className="ai-header">
        <h2>AI Writing Mode</h2>
        <p className="ai-sub">
          {isPremium ? (
            <strong>Premium aktif</strong>
          ) : (
            <strong>Ücretsiz mod</strong>
          )}{" "}
          {limitPerDay != null && (
            <span className="ai-chip">
              Günlük limit: {usedToday ?? "?"}/{limitPerDay}
            </span>
          )}
        </p>
      </div>

      {!isPremium && err === "free_limit_reached" && (
        <div className="ai-paywall">
          Ücretsiz limit doldu. Premium ile sınırsız kullanabilirsin.
        </div>
      )}

      {err && <div className="ai-error">{err}</div>}

      <div className="ai-grid">
        <div className="ai-card">
          <h3>İstek</h3>
          <div className="ai-row">
            <label>
              Type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tone
              <select value={tone} onChange={(e) => setTone(e.target.value)}>
                {TONES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Length
              <select value={length} onChange={(e) => setLength(e.target.value)}>
                {LENGTHS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Language
              <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="tr / en / de ..." />
            </label>
          </div>

          <div className="ai-row">
            <label>
              Target audience (optional)
              <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Örn: YDT öğrencileri" />
            </label>
            <label>
              Context (optional)
              <input value={context} onChange={(e) => setContext(e.target.value)} placeholder="Örn: motivasyon, çalışma planı" />
            </label>
          </div>

          <label>
            Prompt / content
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ne yazmasını istiyorsun? İçeriği/kriterleri yaz."
              rows={8}
            />
          </label>

          <div className="ai-actions">
            {!isPremium && typeof onGoPremium === "function" && (
              <button className="ai-secondary" type="button" onClick={onGoPremium} disabled={isBusy}>
                Premium’a geç
              </button>
            )}
            <button type="button" onClick={callWrite} disabled={isBusy}>
              {isBusy ? "Üretiliyor…" : "Generate"}
            </button>
          </div>
        </div>

        <div className="ai-card">
          <h3>Çıktı</h3>
          <div className={`ai-output ${!isPremium ? "ai-output-blur" : ""}`}>
            <pre>{visibleOutput || "—"}</pre>
          </div>

          <div className="ai-rewrite-row">
            <button type="button" onClick={() => callRewrite("humanize")} disabled={isBusy}>
              Rewrite like a human
            </button>
            <button type="button" onClick={() => callRewrite("clarity")} disabled={isBusy}>
              Improve clarity
            </button>
            <button type="button" onClick={() => callRewrite("shorten")} disabled={isBusy}>
              Shorten
            </button>
            <button type="button" onClick={() => callRewrite("expand")} disabled={isBusy}>
              Expand
            </button>
            <button type="button" onClick={() => callRewrite("tone")} disabled={isBusy}>
              Change tone
            </button>
          </div>

          {usage && (
            <p className="ai-small">
              Usage: {typeof usage === "object" ? JSON.stringify(usage) : String(usage)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

