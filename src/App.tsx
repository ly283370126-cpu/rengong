import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash2 } from "lucide-react";
import { ControlDock } from "./components/ControlDock";
import { ConfigPanel } from "./components/ConfigPanel";
import { CognitivePanel } from "./components/CognitivePanel";
import { EventLog } from "./components/EventLog";
import { JarvisHud } from "./components/JarvisHud";
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
    createLog("system", "核心已上线。本地中文助手可用；配置有效 OpenAI Key 后启用 Realtime。")
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
        addLog({ role: "system", text: "Realtime 需要 OPENAI_API_KEY；本地中文核心仍可使用。" });
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
      <JarvisHud
        mode={mode}
        status={status}
        openaiConfigured={Boolean(appStatus?.openaiConfigured)}
        active={active}
        model={appStatus?.realtimeModel}
        voice={appStatus?.voice}
      />

      <header className="top-bar">
        <div className="brand-lockup">
          <span className="brand-mark">J</span>
          <div>
            <strong>JARVIS DESKTOP</strong>
          <span>Realtime neural interface</span>
          </div>
        </div>
        <div className="system-state">
          {appStatus?.ok ? <CheckCircle2 size={16} /> : <CircleSlash2 size={16} />}
          <span>{appStatus?.openaiConfigured ? "OpenAI Ready" : "Demo Ready"}</span>
        </div>
      </header>

      <section className="hero-copy" aria-label="Assistant identity">
        <p>JARVIS LOCAL</p>
        <h1>Core</h1>
        <span>中文语音、工具调度、实时粒子智能核心。</span>
      </section>

      <EventLog entries={logs} />
      <CognitivePanel
        entries={logs}
        openaiConfigured={Boolean(appStatus?.openaiConfigured)}
        proxyConfigured={appStatus?.openaiProxyConfigured}
        active={active}
      />

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
          <span>Realtime 需要在 .env 中配置 OPENAI_API_KEY。</span>
        </div>
      )}
    </main>
  );
}
