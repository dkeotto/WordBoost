import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { apiUrl } from "../utils/apiUrl";
import { readResponseJson } from "../utils/httpJson";
import { hasUnlimitedAiClient } from "../utils/premiumDisplay";

const CHAT_STARTERS = [
  {
    label: "Konuşma pratiği",
    text: "10 dakikalık günlük İngilizce konuşma pratiği yapalım. Seviyemi B1–B2 tahmin ediyorum; sen bir senaryo başlat, ben cevaplayayım, hatalarımı düzelt.",
  },
  {
    label: "YDT yazılı hazırlık",
    text: "YDT İngilizce yazılı sınavına hazırlanıyorum. Akademik paragraf yazmam için bugün bir konu öner, çıtayı yükselt ve cümle cümle geri bildirim ver.",
  },
  {
    label: "Gramer netleştir",
    text: "Present perfect ile simple past arasındaki farkı gerçek hayat örnekleriyle anlat; sonra 5 kısa test sorusu sor, cevaplarımı yorumla.",
  },
  {
    label: "E-posta / iş İngilizcesi",
    text: "Profesyonel bir e-posta yazmam lazım (kibar ama net). Türkçe taslağımı paylaşacağım; önce İngilizce versiyonu üret, sonra neden böyle yazdığını kısaca açıkla.",
  },
];

function humanizeAiErrorMessage(raw, payload) {
  const code = payload?.code;
  if (code === "groq_auth_invalid" || code === "groq_rate_limit") {
    return String(payload?.error || raw || "Groq API hatası");
  }
  if (payload?.error === "ai_chat_premium_required" || code === "ai_chat_premium_required") {
    return String(payload?.message || "AI Sohbet için Premium veya AI+ gerekir.");
  }
  return String(raw || "Bir hata oluştu.");
}

export default function AiChatView({ user, onGoPremium, onGoWriting }) {
  const token = user?.token || "";
  const canChat = hasUnlimitedAiClient(user);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [thinkingVisible, setThinkingVisible] = useState(false);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const listRef = useRef(null);
  const thinkingTimerRef = useRef(null);

  const loadHistory = useCallback(async () => {
    if (!token || !canChat) return;
    setLoadingHistory(true);
    try {
      const r = await fetch(apiUrl("/api/ai/chat"), { headers: { Authorization: token } });
      const d = await readResponseJson(r);
      if (!r.ok) {
        const msg = d?.message || d?.error || `HTTP ${r.status}`;
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
      setMessages(Array.isArray(d.messages) ? d.messages : []);
      setErr("");
    } catch (e) {
      setErr(e?.message || "Geçmiş yüklenemedi");
    } finally {
      setLoadingHistory(false);
    }
  }, [token, canChat]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, busy]);

  useEffect(() => {
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    if (busy && !streamingText) {
      thinkingTimerRef.current = setTimeout(() => setThinkingVisible(true), 380);
    } else {
      setThinkingVisible(false);
    }
    return () => {
      if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
    };
  }, [busy, streamingText]);

  const stopGeneration = () => {
    try {
      abortRef.current?.abort();
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  const streamSse = async ({ body, onText, onDone }) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch(apiUrl("/api/ai/chat/stream"), {
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

  const send = async () => {
    const t = input.trim();
    if (!t || !token || !canChat || busy) return;
    setInput("");
    setErr("");
    setStreamingText("");
    setBusy(true);
    const optimistic = [
      ...messages,
      { id: `tmp-${Date.now()}`, role: "user", content: t, createdAt: new Date().toISOString() },
    ];
    setMessages(optimistic);
    try {
      await streamSse({
        body: { message: t },
        onText: (chunk) => setStreamingText((prev) => prev + chunk),
        onDone: () => {
          setStreamingText("");
        },
      });
      await loadHistory();
    } catch (e) {
      if (e?.name === "AbortError") {
        await loadHistory();
        return;
      }
      setErr(humanizeAiErrorMessage(e.message, e.payload));
      await loadHistory();
    } finally {
      setBusy(false);
      setStreamingText("");
    }
  };

  const clearChat = async () => {
    if (!token || !canChat) return;
    if (!window.confirm("Tüm sohbet ve hatırlanan özet silinsin mi?")) return;
    setErr("");
    try {
      const r = await fetch(apiUrl("/api/ai/chat"), { method: "DELETE", headers: { Authorization: token } });
      const d = await readResponseJson(r);
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setMessages([]);
    } catch (e) {
      setErr(e?.message || "Sohbet temizlenemedi");
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const applyStarter = (text) => {
    setInput(text);
  };

  return (
    <div className="ai-chat">
      <div className="ai-header">
        <h2>WordBoost AI · Sohbet</h2>
        <p className="ai-chat-tagline">
          Koç seviyesinde geri bildirim, hafızalı bağlam ve uzun, düşünülmüş yanıtlar — tek amaç: seni gerçekten ilerletmek.
        </p>
        <p className="ai-sub">
          {canChat ? (
            <span className="ai-badge ai-badge--pro">Pro sohbet</span>
          ) : (
            <span className="ai-badge ai-badge--free">Kilitli</span>
          )}
          <span className="ai-hint-inline">
            Premium veya AI+ ile açılır. Konuşmaların özetlenir; asistan sana göre kalır.
          </span>
        </p>
        <div className="ai-chat-mode-switch">
          {typeof onGoWriting === "function" ? (
            <button type="button" className="ai-chat-link-btn" onClick={onGoWriting}>
              ✍️ AI Yazım moduna geç
            </button>
          ) : null}
        </div>
      </div>

      {!token && (
        <div className="ai-error" role="alert">
          Sohbet için giriş yapmalısın.
        </div>
      )}

      {token && !canChat && (
        <div className="ai-chat-upsell">
          <p>AI Sohbet yalnızca <strong>Premium</strong> veya <strong>AI+</strong> ile açılır. Geçmiş konuşmalar sunucuda saklanır; periyodik özet ile asistan sana göre uyum sağlar.</p>
          {typeof onGoPremium === "function" ? (
            <button type="button" className="ai-btn-primary" onClick={onGoPremium}>
              Planları gör
            </button>
          ) : null}
        </div>
      )}

      {err && (
        <div className="ai-error" role="alert">
          {err}
        </div>
      )}

      {token && canChat && (
        <>
          <div className="ai-chat-toolbar">
            <button type="button" className="ai-secondary" onClick={loadHistory} disabled={loadingHistory || busy}>
              {loadingHistory ? "Yükleniyor…" : "Yenile"}
            </button>
            <button type="button" className="ai-secondary ai-chat-clear" onClick={clearChat} disabled={busy || messages.length === 0}>
              Sohbeti sıfırla
            </button>
            {busy ? (
              <button type="button" className="ai-secondary" onClick={stopGeneration}>
                Durdur
              </button>
            ) : null}
          </div>

          <div className="ai-chat-scroll" ref={listRef}>
            {messages.length === 0 && !busy && !loadingHistory && (
              <div className="ai-chat-onboarding">
                <p className="ai-chat-empty">
                  Aşağıdan hızlı başlat veya doğrudan yaz. Asistan, WordBoost verin + geçmiş özetin ile uyumlu cevap verir.
                </p>
                <div className="ai-chat-starters" role="group" aria-label="Hızlı başlangıç önerileri">
                  {CHAT_STARTERS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      className="ai-chat-starter-chip"
                      onClick={() => applyStarter(s.text)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id || `${m.role}-${m.createdAt}`} className={`ai-chat-bubble ai-chat-bubble--${m.role}`}>
                <span className="ai-chat-bubble-label">{m.role === "user" ? "Sen" : "Asistan"}</span>
                {m.role === "assistant" ? (
                  <div className="ai-chat-md">
                    <ReactMarkdown>{m.content || ""}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="ai-chat-plain">{m.content}</p>
                )}
              </div>
            ))}
            {thinkingVisible ? (
              <div className="ai-chat-thinking" aria-live="polite">
                <span className="ai-chat-thinking-dots" aria-hidden />
                <span>Derinlemesine düşünüyorum…</span>
              </div>
            ) : null}
            {streamingText ? (
              <div className="ai-chat-bubble ai-chat-bubble--assistant ai-chat-bubble--streaming">
                <span className="ai-chat-bubble-label">Asistan</span>
                <div className="ai-chat-md">
                  <ReactMarkdown>{streamingText}</ReactMarkdown>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="ai-chat-compose">
            <textarea
              className="ai-chat-input"
              rows={3}
              placeholder="Mesajını yaz… (Enter gönderir, Shift+Enter satır)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
              maxLength={6000}
            />
            <div className="ai-chat-compose-actions">
              <span className="ai-char-count">{input.length} / 6000</span>
              <button type="button" className="ai-btn-primary" onClick={send} disabled={busy || !input.trim()}>
                {busy ? "Gönderiliyor…" : "Gönder"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
