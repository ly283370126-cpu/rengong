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
  demo: "本地",
  realtime: "实时"
};

const statusLabel: Record<AssistantStatus, string> = {
  idle: "待命",
  connecting: "连接中",
  listening: "聆听",
  thinking: "思考",
  speaking: "回应",
  executing_tool: "工具",
  error: "异常"
};

export function JarvisHud({ mode, status, openaiConfigured, active, model, voice }: JarvisHudProps) {
  const runtimeState = active ? "在线" : "待命";
  const linkState = openaiConfigured ? "OpenAI 就绪" : "本地模式";
  const modelLabel = model?.trim() || "默认";
  const voiceLabel = voice?.trim() || "默认";

  return (
    <section
      className="jarvis-hud"
      data-active={active}
      data-mode={mode}
      data-status={status}
      aria-label="Assistant telemetry HUD"
    >
      <div className="jarvis-hud__corner jarvis-hud__corner--north-west" aria-label="Runtime telemetry">
        <HudMetric label="核心" value={runtimeState} tone={active ? "live" : "muted"} />
        <HudMetric label="模式" value={modeLabel[mode]} />
      </div>

      <div className="jarvis-hud__corner jarvis-hud__corner--north-east" aria-label="Connection telemetry">
        <HudMetric label="连接" value={linkState} tone={openaiConfigured ? "live" : "muted"} />
        <HudMetric label="状态" value={statusLabel[status]} tone={status === "error" ? "alert" : undefined} />
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
        <HudMetric label="模型" value={modelLabel} />
        <HudMetric label="声音" value={voiceLabel} />
      </div>

      <div className="jarvis-hud__corner jarvis-hud__corner--south-east" aria-label="Signal telemetry">
        <HudMetric label="输入" value={active ? "已激活" : "静默"} tone={active ? "live" : "muted"} />
        <HudMetric label="输出" value={status === "speaking" ? "播报" : "清晰"} tone={status === "speaking" ? "live" : undefined} />
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
