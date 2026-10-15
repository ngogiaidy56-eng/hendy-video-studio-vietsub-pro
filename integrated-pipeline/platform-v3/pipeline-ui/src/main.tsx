import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Step = { name: string; status: string; message: string; durationMs?: number };
type PipelineResult = { jobId: string; status: string; verdict: string; steps: Step[]; patchedConfig?: string; recoveryPath?: string };

const api = (path: string) => `${window.location.origin}${path}`;

function App() {
  const [dark, setDark] = useState(true);
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pixel, setPixel] = useState(100);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [agentMessage, setAgentMessage] = useState("Local agent: chưa kết nối");
  const [token, setToken] = useState(sessionStorage.getItem("pipeline_token") || "");
  const [otp, setOtp] = useState("");
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setUrl((value) => value); // editor undo hook point
        setAgentMessage("Ctrl+Z đã được bắt ở UI layer");
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  const authenticateTelegram = async () => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.initData) { setAgentMessage("Không tìm thấy Telegram initData; nhập OTP hoặc session token."); return; }
    tg.ready(); tg.expand();
    const response = await fetch(api("/api/auth/telegram"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: tg.initData }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Telegram auth failed");
    setToken(data.token); sessionStorage.setItem("pipeline_token", data.token);
    setAgentMessage(`🟢 Đã xác thực Telegram user ${data.user?.id ?? ""}`);
  };

  const verifyOtp = async () => {
    const response = await fetch(api("/api/auth/otp"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: otp }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "OTP failed");
    setToken(data.token); sessionStorage.setItem("pipeline_token", data.token);
    setAgentMessage("🟢 OTP hợp lệ. Phiên pipeline đã mở.");
  };

  const connectAgent = () => {
    ws.current?.close();
    const socket = new WebSocket("ws://127.0.0.1:8799");
    socket.onopen = () => setAgentMessage("🟢 Local sandbox :8799 connected");
    socket.onmessage = (event) => setAgentMessage(event.data);
    socket.onerror = () => setAgentMessage("🔴 Không kết nối được local agent; dùng Cloud API");
    socket.onclose = () => ws.current === socket && setAgentMessage("Local agent disconnected");
    ws.current = socket;
  };

  const dryRun = async () => {
    setBusy(true); setResult(null);
    try {
      const response = await fetch(api("/api/pipeline/dry-run"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ mode: "dry-run", inputType: file ? "video" : url ? "url" : "none", sourceUrl: url || null, filename: file?.name || null, strict: true, runExtraction: Boolean(url), runTranscription: Boolean(file) })
      });
      const body = await response.json();
      setResult(body);
    } catch (error) {
      setAgentMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };

  const inputSummary = useMemo(() => file ? `Video: ${file.name}` : url ? `URL: ${url}` : "Chưa có đầu vào", [file, url]);

  return <main className={dark ? "app dark" : "app"} style={{ "--scale": pixel / 100 } as React.CSSProperties}>
    <header className="topbar"><div><strong>🎛️ Video Pipeline Console</strong><span> React UI Client / TMA</span></div><button onClick={() => setDark((v) => !v)}>{dark ? "☀️ LIGHT" : "🌙 DARK"}</button></header>
    <section className="grid">
      <div className="panel"><h2>Đầu vào đa phương tiện</h2><div className="auth"><div className="row"><button onClick={authenticateTelegram}>🔐 Telegram Auth</button><input value={otp} onChange={(e) => setOtp(e.target.value.toUpperCase())} maxLength={6} placeholder="OTP 6 ký tự / 60s"/><button onClick={verifyOtp} disabled={otp.length !== 6}>Xác thực OTP</button></div><small>Session: {token ? "đã có" : "chưa có"}</small></div><p>{inputSummary}</p><label>URL mạng</label><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..."/><label>Ảnh OCR / Video MP4</label><input type="file" accept="image/*,video/mp4" onChange={(e) => setFile(e.target.files?.[0] ?? null)}/><label>Pixel layout: {pixel}%</label><input type="range" min="80" max="140" value={pixel} onChange={(e) => setPixel(Number(e.target.value))}/><div className="row"><button onClick={connectAgent}>Kết nối Sandbox :8799</button><button className="primary" onClick={dryRun} disabled={busy}>{busy ? "ĐANG CHẠY..." : "CHẠY THỬ & SỬA LỖI (DRY-RUN)"}</button></div><small>{agentMessage}</small></div>
      <div className="panel"><h2>Pipeline Gate</h2>{result ? <><div className={`status ${result.status === "NOMINAL" ? "ok" : "bad"}`}>{result.status} · {result.verdict}</div>{result.steps.map((step) => <div className="step" key={step.name}><b>{step.status === "PASS" ? "✅" : "🚨"} {step.name}</b><span>{step.message}</span></div>)}<details><summary>SOT patched config</summary><pre>{result.patchedConfig}</pre></details></> : <div className="empty">Chưa có kết quả dry-run.</div>}</div>
    </section>
    <footer><a href="/tai-app">/tai-app · tải ứng dụng</a><span>Ctrl+Z hook active · Release chỉ mở khi Gate = NOMINAL</span></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
