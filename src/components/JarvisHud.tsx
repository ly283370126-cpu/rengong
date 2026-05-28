import type { AssistantMode, AssistantStatus } from "../types/realtime";

interface JarvisHudProps {
  mode: AssistantMode;
  status: AssistantStatus;
  openaiConfigured: boolean;
  active: boolean;
  model?: string;
  voice?: string;
}

const modeLabel: Record<AssistantMode, string> = {
  demo: "Local",
  realtime: "Realtime"
};

const statusLabel: Record<AssistantStatus, string> = {
  idle: "Idle",
  connecting: "Linking",
  listening: "Listening",
  thinking: "Resolving",
  speaking: "Speaking",
  executing_tool: "Tooling",
  error: "Fault"
};

export function JarvisHud({ mode, status, openaiConfigured, active, model, voice }: JarvisHudProps) {
  const runtimeState = active ? "Active" : "Standby";
  const linkState = openaiConfigured ? "OpenAI Ready" : "Local Only";
  const modelLabel = model?.trim() || "Default";
  const voiceLabel = voice?.trim() || "Default";

  return (
    <section
      className="jarvis-hud"
      data-active={active}
      data-mode={mode}
      data-status={status}
      aria-label="Assistant telemetry HUD"
    >
      <div className="jarvis-hud__corner jarvis-hud__corner--north-west" aria-label="Runtime telemetry">
        <HudMetric label="Core" value={runtimeState} tone={active ? "live" : "muted"} />
        <HudMetric label="Mode" value={modeLabel[mode]} />
      </div>

      <div className="jarvis-hud__corner jarvis-hud__corner--north-east" aria-label="Connection telemetry">
        <HudMetric label="Link" value={linkState} tone={openaiConfigured ? "live" : "muted"} />
        <HudMetric label="Status" value={statusLabel[status]} tone={status === "error" ? "alert" : undefined} />
      </div>

      <div className="jarvis-hud__scan" aria-hidden="true">
        <svg className="jarvis-hud__scan-svg" viewBox="0 0 240 240" focusable="false">
          <circle className="jarvis-hud__scan-guide" cx="120" cy="120" r="86" />
          <circle className="jarvis-hud__scan-guide jarvis-hud__scan-guide--wide" cx="120" cy="120" r="104" />
          <path className="jarvis-hud__scan-arc jarvis-hud__scan-arc--primary" d="M120 16a104 104 0 0 1 91 53" />
          <path className="jarvis-hud__scan-arc jarvis-hud__scan-arc--secondary" d="M224 120a104 104 0 0 1-53 91" />
          <path className="jarvis-hud__scan-arc jarvis-hud__scan-arc--tertiary" d="M120 224a104 104 0 0 1-91-53" />
          <line className="jarvis-hud__reticle" x1="120" y1="26" x2="120" y2="44" />
          <line className="jarvis-hud__reticle" x1="120" y1="196" x2="120" y2="214" />
          <line className="jarvis-hud__reticle" x1="26" y1="120" x2="44" y2="120" />
          <line className="jarvis-hud__reticle" x1="196" y1="120" x2="214" y2="120" />
        </svg>
        <span className="jarvis-hud__scan-label jarvis-hud__scan-label--north">Scan</span>
        <span className="jarvis-hud__scan-label jarvis-hud__scan-label--south">{statusLabel[status]}</span>
      </div>

      <div className="jarvis-hud__corner jarvis-hud__corner--south-west" aria-label="Model telemetry">
        <HudMetric label="Model" value={modelLabel} />
        <HudMetric label="Voice" value={voiceLabel} />
      </div>

      <div className="jarvis-hud__corner jarvis-hud__corner--south-east" aria-label="Signal telemetry">
        <HudMetric label="Input" value={active ? "Armed" : "Quiet"} tone={active ? "live" : "muted"} />
        <HudMetric label="Output" value={status === "speaking" ? "Live" : "Clear"} tone={status === "speaking" ? "live" : undefined} />
      </div>
    </section>
  );
}

function HudMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "live" | "muted" | "alert" }) {
  return (
    <div className="jarvis-hud__metric" data-tone={tone}>
      <span className="jarvis-hud__metric-label">{label}</span>
      <span className="jarvis-hud__metric-value">{value}</span>
    </div>
  );
}
