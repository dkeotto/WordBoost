import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { apiUrl } from "../utils/apiUrl";

const TYPES = [
  { id: "blog", label: "Blog yazısı" },
  { id: "essay", label: "Essay" },
  { id: "email", label: "E-posta" },
  { id: "caption", label: "Sosyal medya" },
  { id: "product", label: "Ürün açıklaması" },
  { id: "summary", label: "Özet" },
  { id: "ydt_practice", label: "YDT — paragraf pratiği" },
  { id: "dialogue", label: "Diyalog" },
  { id: "vocab_story", label: "Kelime / hikâye" },
];

const TONES = [
  { id: "casual", label: "Samimi" },
  { id: "professional", label: "Profesyonel" },
  { id: "genz", label: "Gen Z / modern" },
];

const LENGTHS = [
  { id: "short", label: "Kısa" },
  { id: "medium", label: "Orta" },
  { id: "long", label: "Uzun" },
];

const LANGUAGES = [
  { value: "tr", label: "Türkçe" },
  { value: "en", label: "İngilizce" },
  { value: "de", label: "Almanca" },
  { value: "fr", label: "Fransızca" },
  { value: "mixed", label: "Karışık (TR + EN)" },
];

const REWRITE_MODES = [
  { id: "humanize", label: "İnsani dil" },
  { id: "clarity", label: "Netleştir" },
  { id: "shorten", label: "Kısalt" },
  { id: "expand", label: "Genişlet" },
  { id: "tone", label: "Tonu değiştir" },
];

function formatUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const inT = usage.input_tokens ?? usage.prompt_tokens;
  const outT = usage.output_tokens ?? usage.completion_tokens;
  if (inT != null && outT != null) {
    return `Toplam ${inT + outT} token (girdi ${inT}, çıktı ${outT})`;
  }
  return null;
}

function humanizeAiErrorMessage(raw, payload) {
  const code = payload?.code;
  if (code === "groq_auth_invalid" || code === "groq_rate_limit") {
    return String(payload?.error || raw || "Groq API hatası");
  }
  const s = String(raw || "");
  if (s.includes("not_found_error") && s.toLowerCase().includes("model")) {
    return `${s} — Model bulunamadı. Railway’de ANTHROPIC_MODEL (tarihli ID) veya GROQ_MODEL kontrol et; GROQ kullanıyorsan Groq dokümantasyonundaki model adını kullan. Stream 404 ise Vercel’de VITE_SOCKET_URL / VITE_BACKEND_URL = Railway kökü.`;
  }
  if (/\(404\)/.test(s) || (/\b404\b/.test(s) && !s.includes("not_found_error"))) {
    return `${s} — Üretimde stream bazen Vercel proxy’de 404 döner. VITE_SOCKET_URL veya VITE_BACKEND_URL = Railway kökü; frontend’i yeniden derle.`;
  }
  if (
    s.includes('"authentication_error"') ||
    s.includes("Invalid authentication credentials") ||
    /^401\s+\{/.test(s.trim())
  ) {
    return "Anthropic anahtarı geçersiz olabilir. console.anthropic.com → Railway ANTHROPIC_API_KEY. Groq kullanıyorsan GROQ_API_KEY kontrol et.";
  }
  if (
    s.includes("credit balance is too low") ||
    s.includes("purchase credits") ||
    (s.includes("Plans & Billing") && s.includes("Anthropic API"))
  ) {
    return "Anthropic bakiyesi yetersiz. console.anthropic.com → Plans & Billing.";
  }
  return s;
}

function blurTextForFreeUser(text) {
  const s = String(text || "");
  if (s.length <= 160) return s;
  const head = s.slice(0, 140);
  const tail = s.slice(140);
  return `${head}\n\n[Premium önizleme dışı]\n${tail}`;
}

export default function AiWritingView({ user, onGoPremium }) {
  const token = user?.token || "";
  const isPremium = Boolean(
    user?.isPremium ||
      (user?.premiumUntil && new Date(user.premiumUntil).getTime() > Date.now()) ||
      user?.entitlements?.aiPlus === true
  );

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
  const [copyFlash, setCopyFlash] = useState(false);

  const abortRef = useRef(null);
  const outputScrollRef = useRef(null);

  const canUse = Boolean(token);
  const inputLen = inputText.length;

  const visibleOutput = useMemo(() => {
    if (!output) return "";
    if (isPremium) return output;
    return blurTextForFreeUser(output);
  }, [output, isPremium]);

  useEffect(() => {
    const el = outputScrollRef.current;
    if (!el || !isBusy) return;
    el.scrollTop = el.scrollHeight;
  }, [output, isBusy]);

  const stopGeneration = () => {
    try {
      abortRef.current?.abort();
    } catch {
      /* ignore */
    }
    setIsBusy(false);
  };

  const streamSse = async ({ path, body, onText, onDone }) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const url = path.startsWith("http") ? path : apiUrl(path);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      let data = {};
      try {
        data = errText ? JSON.parse(errText) : {};
      } catch {
        data = { error: errText.replace(/<[^>]*>/g, " ").trim().slice(0, 200) || `HTTP ${res.status}` };
      }
      const raw =
        typeof data?.error === "string"
          ? data.error
          : data?.error != null
            ? JSON.stringify(data.error)
            : `AI stream error (${res.status})`;
      const msg = humanizeAiErrorMessage(raw, data);
      const errObj = new Error(msg);
      errObj.payload = data;
      errObj.status = res.status;
      throw errObj;
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Tarayıcı streaming desteklemiyor.");

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
        if (currentEvent === "error") {
          throw new Error(humanizeAiErrorMessage(payload?.error || "AI error", payload));
        }
      }
    }
  };

  const handleStreamError = (e) => {
    if (e?.name === "AbortError") {
      setErr("");
      return;
    }
    const p = e?.payload;
    if (p?.error === "free_limit_reached" || e?.status === 402) {
      setLimitPerDay(p?.limitPerDay ?? 3);
      if (p?.usedToday != null) setUsedToday(p.usedToday);
      setErr(
        `Günlük ücretsiz AI limitin doldu (${p?.limitPerDay ?? 3} istek/gün). Premium veya AI+ ile sınırsız kullanabilirsin.`
      );
      return;
    }
    setErr(humanizeAiErrorMessage(e.message, p) || "Bir hata oluştu.");
  };

  const callWrite = async () => {
    if (!canUse) {
      setErr("AI Mod için giriş yapmalısın.");
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
      handleStreamError(e);
    } finally {
      setIsBusy(false);
    }
  };

  const callRewrite = async (mode) => {
    if (!canUse) {
      setErr("AI Mod için giriş yapmalısın.");
      return;
    }
    const base = output || inputText;
    if (!base.trim()) {
      setErr("Önce metin üret veya sol taraftaki kutuya yazı yaz.");
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
      handleStreamError(e);
    } finally {
      setIsBusy(false);
    }
  };

  const copyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopyFlash(true);
      setTimeout(() => setCopyFlash(false), 2000);
    } catch {
      setErr("Panoya kopyalanamadı (tarayıcı izni).");
    }
  };

  const sendOutputToInput = () => {
    if (!output) return;
    setInputText(output);
    setErr("");
  };

  const usageLine = formatUsage(usage);

  return (
    <div className="ai-writing">
      <div className="ai-header">
        <h2>AI Yazım Modu</h2>
        <p className="ai-sub">
          {isPremium ? (
            <span className="ai-badge ai-badge--pro">Premium</span>
          ) : (
            <span className="ai-badge ai-badge--free">Ücretsiz</span>
          )}
          {limitPerDay != null && (
            <span className="ai-chip" title="Ücretsiz kullanımda günlük istek sayısı">
              Bugün: {usedToday ?? "—"} / {limitPerDay}
            </span>
          )}
          <span className="ai-hint-inline">Metin akışla gelir; istediğinde &quot;Durdur&quot; ile kes.</span>
        </p>
      </div>

      {err && (
        <div className="ai-error" role="alert">
          {err}
        </div>
      )}

      <div className="ai-grid">
        <div className="ai-card">
          <h3>İstek</h3>
          <div className="ai-row ai-row--4">
            <label>
              Tür
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ton
              <select value={tone} onChange={(e) => setTone(e.target.value)}>
                {TONES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Uzunluk
              <select value={length} onChange={(e) => setLength(e.target.value)}>
                {LENGTHS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Dil
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ai-row">
            <label>
              Hedef kitle (isteğe bağlı)
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Örn: YDT öğrencileri"
              />
            </label>
            <label>
              Bağlam (isteğe bağlı)
              <input
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Örn: motivasyon, sınav haftası"
              />
            </label>
          </div>

          <label>
            Ne yazılsın? / ham metin
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Konuyu, anahtar kelimeleri veya düzenlenmesini istediğin metni yaz."
              rows={9}
              className="ai-textarea-main"
            />
            <span className="ai-char-count">{inputLen} karakter</span>
          </label>

          <div className="ai-actions">
            {isBusy && (
              <button type="button" className="ai-btn-stop" onClick={stopGeneration}>
                Durdur
              </button>
            )}
            {!isPremium && typeof onGoPremium === "function" && (
              <button className="ai-secondary" type="button" onClick={onGoPremium} disabled={isBusy}>
                Premium / AI+
              </button>
            )}
            <button type="button" className="ai-btn-primary" onClick={callWrite} disabled={isBusy}>
              {isBusy ? "Yazılıyor…" : "Üret"}
            </button>
          </div>
        </div>

        <div className="ai-card ai-card--output">
          <div className="ai-output-head">
            <h3>Çıktı</h3>
            <div className="ai-output-toolbar">
              <button type="button" className="ai-tool-btn" onClick={copyOutput} disabled={!output || isBusy}>
                {copyFlash ? "Kopyalandı" : "Kopyala"}
              </button>
              <button type="button" className="ai-tool-btn" onClick={sendOutputToInput} disabled={!output || isBusy}>
                Sola al (düzenle)
              </button>
              <button
                type="button"
                className="ai-tool-btn"
                onClick={() => setOutput("")}
                disabled={!output || isBusy}
              >
                Temizle
              </button>
            </div>
          </div>

          <div
            ref={outputScrollRef}
            className={`ai-output ${!isPremium ? "ai-output-blur" : ""} ${isBusy && !output ? "ai-output--loading" : ""}`}
          >
            {isBusy && !output ? (
              <div className="ai-stream-placeholder">
                <span className="ai-stream-dots" aria-hidden />
                <span>Metin geliyor…</span>
              </div>
            ) : visibleOutput ? (
              <div className="ai-output-inner">
                <ReactMarkdown
                  className="ai-output-prose"
                  components={{
                    a: ({ node, ...props }) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" />
                    ),
                  }}
                >
                  {visibleOutput}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="ai-output-empty">Henüz çıktı yok. Soldan isteğini yazıp Üret’e bas.</p>
            )}
          </div>

          <p className="ai-rewrite-title">Hızlı düzenleme</p>
          <div className="ai-rewrite-row">
            {REWRITE_MODES.map((m) => (
              <button key={m.id} type="button" onClick={() => callRewrite(m.id)} disabled={isBusy}>
                {m.label}
              </button>
            ))}
          </div>

          {usageLine && <p className="ai-small">{usageLine}</p>}
        </div>
      </div>
    </div>
  );
}
