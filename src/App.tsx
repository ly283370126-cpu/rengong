import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash2 } from "lucide-react";
import { ControlDock } from "./components/ControlDock";
import { ConfigPanel } from "./components/ConfigPanel";
import { CognitivePanel } from "./components/CognitivePanel";
import { EventLog } from "./components/EventLog";
import { JarvisHud } from "./components/JarvisHud";
import { MobileVoiceGate } from "./components/MobileVoiceGate";
import { ParticleOrb } from "./components/ParticleOrb";
import { useAudioLevel } from "./hooks/useAudioLevel";
import { useLocalDemo } from "./hooks/useLocalDemo";
import type { AppStatus, AssistantStatus, LogEntry } from "./types/realtime";

function createLog(role: LogEntry["role"], text: string): LogEntry {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    role,
    text
  };
}

export default function App() {
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [command, setCommand] = useState("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [voiceGateOpen, setVoiceGateOpen] = useState(false);
  const voiceBootedRef = useRef(false);
  const [logs, setLogs] = useState<LogEntry[]>([
    createLog("system", "星灵已就绪。语音对话会优先使用 DeepSeek，本地工具也在线。")
  ]);

  const addLog = useCallback((entry: Omit<LogEntry, "id" | "at">) => {
    setLogs((current) => [...current, createLog(entry.role, entry.text)].slice(-30));
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([createLog("system", "对话记录已清空。")]);
  }, []);

  const demo = useLocalDemo({
    onStatus: setStatus,
    addLog,
    onMicStream: setMicStream,
    aiConfigured: Boolean(appStatus?.deepseekConfigured)
  });

  const audioAnalysis = useAudioLevel(micStream);
  const active = demo.active;

  const refreshStatus = useCallback(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((payload: AppStatus) => setAppStatus(payload))
      .catch(() => {
        setAppStatus({
          ok: false,
          openaiConfigured: false,
          deepseekConfigured: false,
          deepseekModel: "unknown",
          realtimeModel: "unknown",
          voice: "unknown",
          allowedApps: [],
          shortcuts: []
        });
      });
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!appStatus?.ok || voiceBootedRef.current) return;
    voiceBootedRef.current = true;
    const needsUserGesture =
      window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 620px)").matches;
    if (needsUserGesture) {
      setVoiceGateOpen(true);
      return;
    }
    void demo.start();
  }, [appStatus?.ok, demo]);

  const allowMobileVoice = useCallback(() => {
    setVoiceGateOpen(false);
    void demo.start();
  }, [demo]);

  const visualLevel = useMemo(() => {
    if (status === "speaking") return Math.max(audioAnalysis.level, 0.76);
    if (status === "executing_tool") return Math.max(audioAnalysis.level, 0.52);
    if (status === "thinking") return Math.max(audioAnalysis.level, 0.34);
    if (status === "connecting") return Math.max(audioAnalysis.level, 0.24);
    return audioAnalysis.level;
  }, [audioAnalysis.level, status]);

  const visualAnalysis = useMemo(() => {
    if (status === "speaking") {
      return { level: visualLevel, bass: 0.82, mid: 0.62, treble: 0.72 };
    }
    if (status === "executing_tool") {
      return { level: visualLevel, bass: 0.42, mid: 0.7, treble: 0.46 };
    }
    return { ...audioAnalysis, level: visualLevel };
  }, [audioAnalysis, status, visualLevel]);

  const sendCommand = useCallback(
    async (value = command) => {
      const text = value.trim();
      if (!text) return;
      setCommand("");

      if (!demo.active) setStatus("listening");
      await demo.submit(text);
    },
    [command, demo]
  );

  return (
    <main className="app-shell">
      <ParticleOrb status={status} audioLevel={visualLevel} audioAnalysis={visualAnalysis} />

      <div className="ambient-grid" aria-hidden="true" />
      <JarvisHud
        mode="demo"
        status={status}
        openaiConfigured={Boolean(appStatus?.openaiConfigured)}
        active={active}
        model={appStatus?.realtimeModel}
        voice={appStatus?.voice}
      />

      <header className="top-bar">
        <div className="brand-lockup">
          <span className="brand-mark">星</span>
          <div>
            <strong>星灵桌面智能</strong>
            <span>Voice first with DeepSeek</span>
          </div>
        </div>
        <div className="system-state">
          {appStatus?.ok ? <CheckCircle2 size={16} /> : <CircleSlash2 size={16} />}
          <span>{appStatus?.deepseekConfigured ? "DeepSeek Ready" : appStatus?.openaiConfigured ? "OpenAI Ready" : "Voice Ready"}</span>
        </div>
      </header>

      <section className="hero-copy" aria-label="Assistant identity">
        <p>DESKTOP AI</p>
        <h1>星灵</h1>
        <span>中文语音对话、DeepSeek 大脑、本地工具调度。</span>
      </section>

      <EventLog entries={logs} onClear={clearLogs} />
      <CognitivePanel
        entries={logs}
        openaiConfigured={Boolean(appStatus?.openaiConfigured)}
        deepseekConfigured={Boolean(appStatus?.deepseekConfigured)}
        proxyConfigured={appStatus?.openaiProxyConfigured}
        active={active}
      />

      <ControlDock
        status={status}
        active={active}
        command={command}
        onCommandChange={setCommand}
        onSend={() => void sendCommand()}
        onQuick={(text) => void sendCommand(text)}
        onSettings={() => setConfigOpen(true)}
      />

      <ConfigPanel open={configOpen} onClose={() => setConfigOpen(false)} onSaved={refreshStatus} />
      <MobileVoiceGate open={voiceGateOpen && !demo.active} onAllow={allowMobileVoice} onSettings={() => setConfigOpen(true)} />

      {!appStatus?.deepseekConfigured && !appStatus?.openaiConfigured && (
        <div className="config-note" role="status">
          <AlertTriangle size={16} />
          <span>请先在设置中配置 DeepSeek Key；本地工具仍可使用。</span>
        </div>
      )}
    </main>
  );
}
