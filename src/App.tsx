import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash2 } from "lucide-react";
import { ControlDock } from "./components/ControlDock";
import { ConfigPanel } from "./components/ConfigPanel";
import { EventLog } from "./components/EventLog";
import { ParticleOrb } from "./components/ParticleOrb";
import { useAudioLevel } from "./hooks/useAudioLevel";
import { useLocalDemo } from "./hooks/useLocalDemo";
import { useRealtimeSession } from "./hooks/useRealtimeSession";
import type { AppStatus, AssistantMode, AssistantStatus, LogEntry } from "./types/realtime";

function createLog(role: LogEntry["role"], text: string): LogEntry {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    role,
    text
  };
}

export default function App() {
  const [mode, setMode] = useState<AssistantMode>("demo");
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [command, setCommand] = useState("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([
    createLog("system", "项目已启动。Local Demo 可直接体验；Realtime 需要配置 OPENAI_API_KEY。")
  ]);

  const addLog = useCallback((entry: Omit<LogEntry, "id" | "at">) => {
    setLogs((current) => [...current, createLog(entry.role, entry.text)].slice(-30));
  }, []);

  const demo = useLocalDemo({ onStatus: setStatus, addLog });
  const realtime = useRealtimeSession({
    onStatus: setStatus,
    addLog,
    onMicStream: setMicStream,
    model: appStatus?.realtimeModel,
    voice: appStatus?.voice
  });

  const audioAnalysis = useAudioLevel(micStream);
  const active = mode === "demo" ? demo.active : realtime.active;

  const refreshStatus = useCallback(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((payload: AppStatus) => setAppStatus(payload))
      .catch(() => {
        setAppStatus({
          ok: false,
          openaiConfigured: false,
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

  const stopCurrent = useCallback(() => {
    if (demo.active) demo.stop();
    if (realtime.active) realtime.stop();
  }, [demo, realtime]);

  const start = useCallback(async () => {
    try {
      stopCurrent();
      if (mode === "demo") {
        await demo.start();
        return;
      }

      if (!appStatus?.openaiConfigured) {
        setStatus("error");
        addLog({ role: "system", text: "Realtime 需要 OPENAI_API_KEY。已保留 Local Demo 可用。" });
        return;
      }

      await realtime.start();
    } catch (error) {
      setStatus("error");
      addLog({ role: "system", text: error instanceof Error ? error.message : String(error) });
    }
  }, [addLog, appStatus?.openaiConfigured, demo, mode, realtime, stopCurrent]);

  const stop = useCallback(() => {
    stopCurrent();
  }, [stopCurrent]);

  const sendCommand = useCallback(
    async (value = command) => {
      const text = value.trim();
      if (!text) return;
      setCommand("");

      if (mode === "demo") {
        if (!demo.active) {
          setStatus("listening");
        }
        await demo.submit(text);
        return;
      }

      if (!realtime.active) {
        addLog({ role: "system", text: "请先启动 Realtime，再发送文字或直接说话。" });
        return;
      }

      realtime.sendText(text);
    },
    [addLog, command, demo, mode, realtime]
  );

  const changeMode = useCallback(
    (nextMode: AssistantMode) => {
      if (nextMode === mode) return;
      stopCurrent();
      setMode(nextMode);
    },
    [mode, stopCurrent]
  );

  return (
    <main className="app-shell">
      <ParticleOrb status={status} audioLevel={visualLevel} audioAnalysis={visualAnalysis} />

      <div className="ambient-grid" aria-hidden="true" />
      <header className="top-bar">
        <div className="brand-lockup">
          <span className="brand-mark">VO</span>
          <div>
            <strong>Voice Orb Assistant</strong>
            <span>Realtime voice agent</span>
          </div>
        </div>
        <div className="system-state">
          {appStatus?.ok ? <CheckCircle2 size={16} /> : <CircleSlash2 size={16} />}
          <span>{appStatus?.openaiConfigured ? "OpenAI Ready" : "Demo Ready"}</span>
        </div>
      </header>

      <section className="hero-copy" aria-label="Assistant identity">
        <p>STARLING LOCAL</p>
        <h1>星灵</h1>
        <span>低延迟语音、工具调用、粒子可视化。</span>
      </section>

      <EventLog entries={logs} />

      <ControlDock
        mode={mode}
        status={status}
        openaiConfigured={Boolean(appStatus?.openaiConfigured)}
        active={active}
        command={command}
        onModeChange={changeMode}
        onCommandChange={setCommand}
        onStart={start}
        onStop={stop}
        onSend={() => void sendCommand()}
        onQuick={(text) => void sendCommand(text)}
        onSettings={() => setConfigOpen(true)}
      />

      <ConfigPanel open={configOpen} onClose={() => setConfigOpen(false)} onSaved={refreshStatus} />

      {!appStatus?.openaiConfigured && (
        <div className="config-note" role="status">
          <AlertTriangle size={16} />
          <span>真实 Realtime 需要复制 .env.example 为 .env 并填写 OPENAI_API_KEY。</span>
        </div>
      )}
    </main>
  );
}
