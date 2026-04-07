import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";

function customUrlTransform(url) {
  if (url.startsWith("data:image/")) return url;
  return defaultUrlTransform(url);
}

const MarkdownImage = ({ src, alt, ...props }) => {
  const downloadImage = () => {
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = (alt || "gorsel").replace(/[^a-zA-Z0-9_\-]/g, "_") + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="ai-chat-image-wrapper">
      <img src={src} alt={alt} {...props} />
      <button
        type="button"
        title="Görseli indir"
        className="ai-chat-img-download-btn"
        onClick={(e) => {
          e.preventDefault();
          downloadImage();
        }}
      >
        <span aria-hidden="true">⬇</span> İndir
      </button>
    </div>
  );
};

import { apiUrl } from "../utils/apiUrl";
import { readResponseJson } from "../utils/httpJson";
import { hasUnlimitedAiClient } from "../utils/premiumDisplay";
import { extractPdfTextFromArrayBuffer } from "../utils/pdfExtract";
import { makePdfBytesFromText } from "../utils/pdfMake";

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

const MAX_PENDING_FILES = 5;
const MAX_FILE_CHARS = 78000;

function threadStorageKey(username) {
  return `wb_ai_chat_thread_${username || "anon"}`;
}

function userVisibleText(content) {
  const s = String(content || "");
  const marker = "\n\n---\n📎";
  const idx = s.indexOf(marker);
  return idx >= 0 ? s.slice(0, idx).trim() : s.trim();
}

function WordyAssistantLabel() {
  return (
    <span className="ai-chat-bubble-label ai-chat-bubble-label--wordy">
      <img src="/wb-logo.png" alt="" className="ai-chat-wordy-avatar" width={20} height={20} decoding="async" />
      Wordy
    </span>
  );
}

function humanizeAiErrorMessage(raw, payload) {
  const code = payload?.code || payload?.error;
  if (code === "groq_auth_invalid" || code === "groq_rate_limit" || code === "rate_limit") {
    if (code === "rate_limit") {
      return "Çok fazla istek gönderildi. Lütfen bir dakika bekleyip tekrar deneyin.";
    }
    return String(payload?.message || payload?.error || raw || "Yapay zeka servis limitine takıldı.");
  }
  if (payload?.error === "ai_chat_premium_required" || code === "ai_chat_premium_required") {
    return String(payload?.message || "AI Sohbet için Premium veya AI+ gerekir.");
  }
  return String(raw || "Bir hata oluştu.");
}

export default function AiChatView({ user, onGoPremium, onGoWriting }) {
  const token = user?.token || "";
  const canChat = hasUnlimitedAiClient(user);
  const uname = user?.username || "";

  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [threadTitle, setThreadTitle] = useState("");

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [pendingImages, setPendingImages] = useState([]);
  const [visionBusy, setVisionBusy] = useState(false);
  const [imageGenBusy, setImageGenBusy] = useState(false);

  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [thinkingVisible, setThinkingVisible] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const thinkingTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const imgInputRef = useRef(null);

  const downloadPdf = useCallback(async (title, body) => {
    const bytes = await makePdfBytesFromText(title, body);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "wordy").toString().slice(0, 80).replace(/[^\w\s-]/g, "").trim() || "wordy"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }, []);

  const fetchThreadList = useCallback(async () => {
    if (!token || !canChat) return [];
    const r = await fetch(apiUrl("/api/ai/chat/threads"), { headers: { Authorization: token } });
    const d = await readResponseJson(r);
    if (!r.ok) {
      const msg = d?.message || d?.error || `HTTP ${r.status}`;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return Array.isArray(d.threads) ? d.threads : [];
  }, [token, canChat]);

  const loadThreads = useCallback(async () => {
    if (!token || !canChat) return;
    setLoadingThreads(true);
    try {
      const list = await fetchThreadList();
      setThreads(list);
      return list;
    } catch (e) {
      setErr(e?.message || "Sohbet listesi yüklenemedi");
      return [];
    } finally {
      setLoadingThreads(false);
    }
  }, [token, canChat, fetchThreadList]);

  const createThreadRemote = useCallback(async () => {
    const r = await fetch(apiUrl("/api/ai/chat/threads"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({}),
    });
    const d = await readResponseJson(r);
    if (!r.ok) {
      const msg = d?.message || d?.error || `HTTP ${r.status}`;
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return d.thread;
  }, [token]);

  const loadMessages = useCallback(
    async (threadId) => {
      if (!token || !canChat || !threadId) return;
      setLoadingHistory(true);
      try {
        const q = new URLSearchParams({ threadId: String(threadId) });
        const r = await fetch(apiUrl(`/api/ai/chat?${q}`), { headers: { Authorization: token } });
        const d = await readResponseJson(r);
        if (!r.ok) {
          const msg = d?.message || d?.error || `HTTP ${r.status}`;
          throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
        }
        setMessages(Array.isArray(d.messages) ? d.messages : []);
        if (d.threadId) setActiveThreadId(String(d.threadId));
        setThreadTitle(d.title || "Yeni sohbet");
        setErr("");
      } catch (e) {
        setErr(e?.message || "Geçmiş yüklenemedi");
      } finally {
        setLoadingHistory(false);
      }
    },
    [token, canChat]
  );

  useEffect(() => {
    if (!token || !canChat) return;
    let cancelled = false;
    (async () => {
      const list = await loadThreads();
      if (cancelled) return;
      if (list.length === 0) {
        try {
          const t = await createThreadRemote();
          if (cancelled || !t?.id) return;
          setThreads([t]);
          setActiveThreadId(String(t.id));
          setThreadTitle(t.title || "Yeni sohbet");
          setMessages([]);
          try {
            localStorage.setItem(threadStorageKey(uname), String(t.id));
          } catch {
            /* ignore */
          }
        } catch (e) {
          if (!cancelled) setErr(e?.message || "İlk sohbet oluşturulamadı");
        }
        return;
      }
      let pick = null;
      try {
        pick = localStorage.getItem(threadStorageKey(uname));
      } catch {
        pick = null;
      }
      if (pick && list.some((x) => String(x.id) === String(pick))) {
        setActiveThreadId(String(pick));
        await loadMessages(pick);
      } else {
        const first = list[0];
        setActiveThreadId(String(first.id));
        await loadMessages(first.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, canChat, uname, loadThreads, createThreadRemote, loadMessages]);

  useEffect(() => {
    if (activeThreadId && uname) {
      try {
        localStorage.setItem(threadStorageKey(uname), activeThreadId);
      } catch {
        /* ignore */
      }
    }
  }, [activeThreadId, uname]);

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

  const streamSse = async ({ body, onText, onMeta, onDone }) => {
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
        if (currentEvent === "meta") onMeta?.(payload);
        if (currentEvent === "done") onDone?.(payload);
        if (currentEvent === "error") {
          throw new Error(humanizeAiErrorMessage(payload?.error || "AI error", payload));
        }
      }
    }
  };

  const send = async () => {
    const t = input.trim();
    const filesSnapshot = pendingFiles.slice();
    const hasFiles = filesSnapshot.length > 0;
    if ((!t && !hasFiles) || !token || !canChat || busy || !activeThreadId) return;
    setInput("");
    setPendingFiles([]);
    setErr("");
    setStreamingText("");
    setBusy(true);

    const attachments = filesSnapshot.map((f) => ({
      name: f.name,
      mimeType: f.mimeType,
      text: f.text,
    }));

    const optimistic = [
      ...messages,
      {
        id: `tmp-${Date.now()}`,
        role: "user",
        content: t || (hasFiles ? "(Ekli dosyalar)" : ""),
        files: filesSnapshot.map((f) => ({ name: f.name, mimeType: f.mimeType, size: f.size })),
        createdAt: new Date().toISOString(),
      },
    ];
    setMessages(optimistic);

    try {
      await streamSse({
        body: { message: t, threadId: activeThreadId, attachments },
        onText: (chunk) => setStreamingText((prev) => prev + chunk),
        onMeta: (payload) => {
          if (payload?.threadId) {
            setActiveThreadId(String(payload.threadId));
          }
        },
        onDone: () => {
          setStreamingText("");
        },
      });
      await loadMessages(activeThreadId);
      await loadThreads();
    } catch (e) {
      if (e?.name === "AbortError") {
        await loadMessages(activeThreadId);
        await loadThreads();
        return;
      }
      setErr(humanizeAiErrorMessage(e.message, e.payload));
      await loadMessages(activeThreadId);
      await loadThreads();
    } finally {
      setBusy(false);
      setStreamingText("");
    }
  };

  const deleteCurrentThread = async () => {
    if (!token || !canChat || !activeThreadId) return;
    if (!window.confirm("Bu sohbet kalıcı olarak silinsin mi?")) return;
    setErr("");
    try {
      const r = await fetch(apiUrl(`/api/ai/chat/threads/${activeThreadId}`), {
        method: "DELETE",
        headers: { Authorization: token },
      });
      const d = await readResponseJson(r);
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      const list = await fetchThreadList();
      setThreads(list);
      if (list.length === 0) {
        const t = await createThreadRemote();
        setThreads([t]);
        setActiveThreadId(String(t.id));
        setThreadTitle(t.title || "Yeni sohbet");
        setMessages([]);
      } else {
        const next = list[0];
        setActiveThreadId(String(next.id));
        await loadMessages(next.id);
      }
    } catch (e) {
      setErr(e?.message || "Sohbet silinemedi");
    }
  };

  const startNewChat = async () => {
    if (!token || !canChat || busy) return;
    setErr("");
    try {
      const t = await createThreadRemote();
      setThreads((prev) => [t, ...prev]);
      setActiveThreadId(String(t.id));
      setThreadTitle(t.title || "Yeni sohbet");
      setMessages([]);
      setSidebarOpen(false);
    } catch (e) {
      setErr(e?.message || "Yeni sohbet açılamadı");
    }
  };

  const selectThread = async (id) => {
    if (!id || busy || String(id) === String(activeThreadId)) {
      setSidebarOpen(false);
      return;
    }
    setActiveThreadId(String(id));
    await loadMessages(id);
    setSidebarOpen(false);
  };

  const renameThread = async () => {
    if (!token || !activeThreadId) return;
    const next = window.prompt("Sohbet başlığı", threadTitle || "");
    if (next == null) return;
    const title = String(next).trim().slice(0, 120);
    if (!title) return;
    try {
      const r = await fetch(apiUrl(`/api/ai/chat/threads/${activeThreadId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ title }),
      });
      const d = await readResponseJson(r);
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setThreadTitle(d.title || title);
      await loadThreads();
    } catch (e) {
      setErr(e?.message || "Başlık güncellenemedi");
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

  const onPickFiles = (e) => {
    const fl = e.target?.files;
    if (!fl || !fl.length) return;
    const take = Math.min(fl.length, MAX_PENDING_FILES - pendingFiles.length);
    for (let i = 0; i < take; i++) {
      const file = fl[i];
      const mt = String(file.type || "").toLowerCase();

      if (mt.startsWith("image/")) {
        const imgTake = Math.min(fl.length, MAX_PENDING_FILES - pendingImages.length);
        if (pendingImages.length >= MAX_PENDING_FILES) continue;
        if (i >= imgTake) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          if (!dataUrl.startsWith("data:image/")) return;
          setPendingImages((prev) => {
            if (prev.length >= MAX_PENDING_FILES) return prev;
            return [
              ...prev,
              {
                id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: file.name || "gorsel",
                mimeType: mt || "image/png",
                dataUrl,
                size: file.size,
              },
            ];
          });
        };
        reader.readAsDataURL(file);
        continue;
      }

      if (mt === "application/pdf") {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const buf = reader.result;
            if (!(buf instanceof ArrayBuffer)) return;
            let text = await extractPdfTextFromArrayBuffer(buf, { maxPages: 20 });
            if (text.length > MAX_FILE_CHARS) text = `${text.slice(0, MAX_FILE_CHARS)}\n…(PDF metni kısaltıldı)`;
            setPendingFiles((prev) => {
              if (prev.length >= MAX_PENDING_FILES) return prev;
              return [
                ...prev,
                {
                  id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  name: `${file.name || "pdf"} (metin)`,
                  mimeType: "text/plain",
                  text,
                  size: text.length,
                },
              ];
            });
          } catch (errPdf) {
            setErr(errPdf?.message || "PDF okunamadı");
          }
        };
        reader.readAsArrayBuffer(file);
        continue;
      }

      const reader = new FileReader();
      reader.onload = () => {
        let text = String(reader.result || "");
        if (text.length > MAX_FILE_CHARS) {
          text = `${text.slice(0, MAX_FILE_CHARS)}\n…(dosya kısaltıldı)`;
        }
        setPendingFiles((prev) => {
          if (prev.length >= MAX_PENDING_FILES) return prev;
          return [
            ...prev,
            {
              id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              name: file.name || "dosya",
              mimeType: file.type || "text/plain",
              text,
              size: file.size,
            },
          ];
        });
      };
      reader.readAsText(file, "UTF-8");
    }
    e.target.value = "";
  };

  const removePendingFile = (id) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const removePendingImage = (id) => {
    setPendingImages((prev) => prev.filter((f) => f.id !== id));
  };

  const runVisionOnPending = async () => {
    if (!token || !canChat || visionBusy || pendingImages.length === 0) return;
    setVisionBusy(true);
    setErr("");
    try {
      const img = pendingImages[0];
      const r = await fetch(apiUrl("/api/ai/vision/describe"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ imageDataUrl: img.dataUrl }),
      });
      const d = await readResponseJson(r);
      if (!r.ok) throw new Error(d?.message || d?.error || `HTTP ${r.status}`);
      const text = String(d?.text || "").trim();
      setMessages((prev) => [
        ...prev,
        {
          id: `tool-vision-${Date.now()}`,
          role: "assistant",
          content: text || "Görsel okundu ama çıktı boş döndü.",
          createdAt: new Date().toISOString(),
        },
      ]);
      setPendingImages([]);
    } catch (e) {
      setErr(e?.message || "Görsel okunamadı");
    } finally {
      setVisionBusy(false);
    }
  };

  const generateImage = async () => {
    if (!token || !canChat || imageGenBusy) return;
    const prompt = window.prompt("Nasıl bir görsel üretelim? (İngilizce veya Türkçe yazabilirsin)", "Minimal, modern bir çalışma masası, sıcak ışık, yüksek kalite");
    if (!prompt) return;
    setImageGenBusy(true);
    setErr("");
    try {
      const r = await fetch(apiUrl("/api/ai/image/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ prompt, size: "1024x1024" }),
      });
      const d = await readResponseJson(r);
      if (!r.ok) throw new Error(d?.message || d?.error || `HTTP ${r.status}`);
      // Support both base64 (imageDataUrl) and URL (imageUrl) responses
      const dataUrl = String(d?.imageDataUrl || "");
      const remoteUrl = String(d?.imageUrl || "");
      const imgSrc = dataUrl.startsWith("data:image/") ? dataUrl : remoteUrl;
      if (!imgSrc) throw new Error("Görsel üretilemedi (boş çıktı).");
      setMessages((prev) => [
        ...prev,
        {
          id: `tool-imagegen-${Date.now()}`,
          role: "assistant",
          content: `**Görsel üretildi** ✨\n\n![Üretilen görsel](${imgSrc})\n\nİstersen bu görsel hakkında soru da hazırlayabilirim.`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setErr(e?.message || "Görsel üretilemedi");
    } finally {
      setImageGenBusy(false);
    }
  };

  return (
    <div className="ai-chat-root">
      <aside className={`ai-chat-sidebar ${sidebarOpen ? "ai-chat-sidebar--open" : ""}`}>
        <div className="ai-chat-sidebar-head">
          <div className="ai-chat-sidebar-brand-row" aria-label="Wordy asistan">
            <img src="/wb-logo.png" alt="" className="ai-chat-sidebar-logo" width={28} height={28} decoding="async" />
            <span className="ai-chat-sidebar-brand">Wordy</span>
          </div>
          <button
            type="button"
            className="ai-chat-sidebar-close"
            aria-label="Kenar çubuğunu kapat"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>
        <button type="button" className="ai-chat-new-chat" onClick={startNewChat} disabled={busy || loadingThreads}>
          + Yeni sohbet
        </button>
        <div className="ai-chat-thread-list" role="navigation" aria-label="Sohbet geçmişi">
          {loadingThreads && threads.length === 0 ? (
            <p className="ai-chat-sidebar-hint">Yükleniyor…</p>
          ) : null}
          {threads.map((th) => (
            <div
              key={th.id}
              className={`ai-chat-thread-item ${String(th.id) === String(activeThreadId) ? "ai-chat-thread-item--active" : ""}`}
            >
              <button
                type="button"
                className="ai-chat-thread-item-main"
                onClick={() => selectThread(th.id)}
                disabled={busy}
              >
                <span className="ai-chat-thread-item-title">{th.title || "Sohbet"}</span>
                {th.preview ? <span className="ai-chat-thread-item-preview">{th.preview}</span> : null}
              </button>
              <button
                type="button"
                className="ai-chat-thread-item-del"
                aria-label="Sohbeti sil"
                disabled={busy}
                onClick={async (ev) => {
                  ev.stopPropagation();
                  if (!window.confirm("Bu sohbet silinsin mi?")) return;
                  try {
                    const r = await fetch(apiUrl(`/api/ai/chat/threads/${th.id}`), {
                      method: "DELETE",
                      headers: { Authorization: token },
                    });
                    const d = await readResponseJson(r);
                    if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
                    const list = await fetchThreadList();
                    setThreads(list);
                    if (String(th.id) === String(activeThreadId)) {
                      if (list.length === 0) {
                        const nt = await createThreadRemote();
                        setThreads([nt]);
                        setActiveThreadId(String(nt.id));
                        setMessages([]);
                        setThreadTitle(nt.title || "Yeni sohbet");
                      } else {
                        const nx = list[0];
                        setActiveThreadId(String(nx.id));
                        await loadMessages(nx.id);
                      }
                    }
                  } catch (errDel) {
                    setErr(errDel?.message || "Silinemedi");
                  }
                }}
              >
                🗑
              </button>
            </div>
          ))}
        </div>
        <p className="ai-chat-sidebar-foot">
          Modeller bağlam + özet ile uzun yanıt üretir. Metin dosyası ekleyebilirsin (.txt, .md, .csv, .json).
        </p>
      </aside>

      {sidebarOpen ? (
        <button
          type="button"
          className="ai-chat-sidebar-backdrop"
          aria-label="Kenar çubuğunu kapat"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="ai-chat-main">
        <header className="ai-chat-topbar">
          <button
            type="button"
            className="ai-chat-menu-btn"
            aria-label="Sohbet listesi"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            ☰
          </button>
          <div className="ai-chat-topbar-center">
            <h2 className="ai-chat-topbar-title">{threadTitle || "AI Sohbet"}</h2>
            <p className="ai-chat-topbar-sub">
              ChatGPT tarzı sohbet · geçmiş konuşmalar · dosya ekle
            </p>
          </div>
          <div className="ai-chat-topbar-actions">
            {typeof onGoWriting === "function" ? (
              <button type="button" className="ai-chat-link-btn ai-chat-link-btn--compact" onClick={onGoWriting}>
                ✍️ Yazım
              </button>
            ) : null}
            <button
              type="button"
              className="ai-chat-link-btn ai-chat-link-btn--compact"
              onClick={() => {
                const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
                if (!lastAssistant) return;
                downloadPdf(threadTitle || "AI sohbet", lastAssistant.content || "");
              }}
              disabled={!messages.some((m) => m.role === "assistant")}
              title="Son yanıtı PDF olarak indir"
            >
              📄 PDF
            </button>
            <button type="button" className="ai-chat-link-btn ai-chat-link-btn--compact" onClick={renameThread}>
              ✎ Ad
            </button>
            <button type="button" className="ai-chat-link-btn ai-chat-link-btn--compact" onClick={() => loadThreads()} disabled={loadingThreads || busy}>
              ↻
            </button>
            <button type="button" className="ai-chat-link-btn ai-chat-link-btn--compact ai-chat-link-btn--danger" onClick={deleteCurrentThread} disabled={busy || !activeThreadId}>
              Sil
            </button>
          </div>
        </header>

        <div className="ai-chat-pro-banner">
          {canChat ? (
            <span className="ai-badge ai-badge--pro">Pro sohbet</span>
          ) : (
            <span className="ai-badge ai-badge--free">Kilitli</span>
          )}
          <span className="ai-hint-inline">
            Premium veya AI+ gerekir. Sohbetler sunucuda saklanır; profil özeti ile kişiselleşir.
          </span>
        </div>

        {!token && (
          <div className="ai-error" role="alert">
            Sohbet için giriş yapmalısın.
          </div>
        )}

        {token && !canChat && (
          <div className="ai-chat-upsell">
            <p>
              AI Sohbet yalnızca <strong>Premium</strong> veya <strong>AI+</strong> ile açılır. Çoklu sohbet, dosya ekleme ve
              akıllı bağlam dahildir.
            </p>
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
            <div className="ai-chat-scroll">
              {messages.length === 0 && !busy && !loadingHistory && (
                <div className="ai-chat-onboarding">
                  <p className="ai-chat-empty">
                    Yeni bir konu yaz veya dosya ekle. Soldaki listeden eski sohbetlere dön.
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
              {loadingHistory && messages.length === 0 ? (
                <p className="ai-chat-loading-msg">Mesajlar yükleniyor…</p>
              ) : null}
              {messages.map((m) => (
                <div key={m.id || `${m.role}-${m.createdAt}`} className={`ai-chat-bubble ai-chat-bubble--${m.role}`}>
                  {m.role === "user" ? (
                    <span className="ai-chat-bubble-label">Sen</span>
                  ) : (
                    <WordyAssistantLabel />
                  )}
                  {m.role === "assistant" ? (
                    <div className="ai-chat-md">
                      <ReactMarkdown
                        urlTransform={customUrlTransform}
                        components={{ img: MarkdownImage }}
                      >
                        {m.content || ""}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <>
                      {userVisibleText(m.content) ? (
                        <p className="ai-chat-plain">{userVisibleText(m.content)}</p>
                      ) : null}
                      {Array.isArray(m.files) && m.files.length > 0 ? (
                        <div className="ai-chat-file-chips">
                          {m.files.map((f, i) => (
                            <span key={`${f.name}-${i}`} className="ai-chat-file-chip">
                              📎 {f.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
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
                  <WordyAssistantLabel />
                  <div className="ai-chat-md">
                    <ReactMarkdown>{streamingText}</ReactMarkdown>
                  </div>
                </div>
              ) : null}
              {busy ? (
                <button type="button" className="ai-chat-stop-fab" onClick={stopGeneration}>
                  Durdur
                </button>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <div className="ai-chat-compose">
              <input
                ref={fileInputRef}
                type="file"
                className="ai-chat-file-input"
                accept=".txt,.md,.csv,.json,.log,.pdf,image/*,text/plain,text/csv,application/json,application/pdf"
                multiple
                onChange={onPickFiles}
              />
              {pendingFiles.length > 0 ? (
                <div className="ai-chat-pending-files">
                  {pendingFiles.map((f) => (
                    <span key={f.id} className="ai-chat-pending-chip">
                      {f.name}
                      <button type="button" aria-label="Kaldır" onClick={() => removePendingFile(f.id)}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              {pendingImages.length > 0 ? (
                <div className="ai-chat-pending-files">
                  {pendingImages.map((f) => (
                    <span key={f.id} className="ai-chat-pending-chip ai-chat-pending-chip--img">
                      🖼 {f.name}
                      <button type="button" aria-label="Kaldır" onClick={() => removePendingImage(f.id)}>
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className="ai-chat-mini-action"
                    onClick={runVisionOnPending}
                    disabled={busy || visionBusy}
                    title="Seçili görseli oku"
                  >
                    {visionBusy ? "Okunuyor…" : "Görsel oku"}
                  </button>
                </div>
              ) : null}
              <div className="ai-chat-compose-inner">
                <button
                  type="button"
                  className="ai-chat-attach-btn"
                  disabled={busy || pendingFiles.length + pendingImages.length >= MAX_PENDING_FILES}
                  onClick={() => fileInputRef.current?.click()}
                  title="Dosya ekle (metin, PDF, görsel)"
                >
                  +
                </button>
                <textarea
                  className="ai-chat-input ai-chat-input--grow"
                  rows={3}
                  placeholder="Mesajını yaz… (Enter gönderir, Shift+Enter satır). Soldan dosya ekleyebilirsin."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={busy}
                />
                <button type="button" className="ai-btn-primary ai-chat-send-btn" onClick={send} disabled={busy || (!input.trim() && pendingFiles.length === 0)}>
                  {busy ? "…" : "Gönder"}
                </button>
              </div>
              <div className="ai-chat-compose-meta">
                <span className="ai-char-count">Karakter sınırı yok · Enter gönderir</span>
                <span className="ai-char-count">En fazla {MAX_PENDING_FILES} ek · PDF metni otomatik çıkarılır</span>
                <button
                  type="button"
                  className="ai-chat-mini-action"
                  onClick={generateImage}
                  disabled={busy || imageGenBusy}
                  title="AI ile görsel üret"
                >
                  {imageGenBusy ? "Üretiliyor…" : "Görsel üret"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
