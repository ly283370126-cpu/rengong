import { Bot, CalendarClock, Calculator, Globe2, Mic, Power, Radio, Settings, Square, TerminalSquare } from "lucide-react";
import type { AssistantMode, AssistantStatus } from "../types/realtime";

interface ControlDockProps {
  mode: AssistantMode;
  status: AssistantStatus;
  openaiConfigured: boolean;
  active: boolean;
  command: string;
  onModeChange(mode: AssistantMode): void;
  onCommandChange(value: string): void;
  onStart(): void;
  onStop(): void;
  onSend(): void;
  onQuick(text: string): void;
  onSettings(): void;
}

const statusLabel: Record<AssistantStatus, string> = {
  idle: "Idle",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  executing_tool: "Tool",
  error: "Error"
};

export function ControlDock({
  mode,
  status,
  openaiConfigured,
  active,
  command,
  onModeChange,
  onCommandChange,
  onStart,
  onStop,
  onSend,
  onQuick,
  onSettings
}: ControlDockProps) {
  return (
    <section className="control-shell" aria-label="Voice assistant controls">
      <div className="mode-row" role="tablist" aria-label="运行模式">
        <button
          className={mode === "demo" ? "mode-button is-active" : "mode-button"}
          type="button"
          onClick={() => onModeChange("demo")}
          aria-pressed={mode === "demo"}
        >
          <Bot size={16} />
          <span>Local Demo</span>
        </button>
        <button
          className={mode === "realtime" ? "mode-button is-active" : "mode-button"}
          type="button"
          onClick={() => onModeChange("realtime")}
          aria-pressed={mode === "realtime"}
          title={openaiConfigured ? "使用 OpenAI Realtime" : "需要在 .env 配置 OPENAI_API_KEY"}
        >
          <Radio size={16} />
          <span>Realtime</span>
        </button>
        <button className="icon-mode-button" type="button" onClick={onSettings} aria-label="打开配置" title="配置">
          <Settings size={16} />
        </button>
      </div>

      <div className="main-dock">
        <div className={`status-pill status-${status}`}>
          <span className="status-dot" />
          <strong>{statusLabel[status]}</strong>
        </div>

        <button
          className="power-button"
          type="button"
          onClick={active ? onStop : onStart}
          aria-label={active ? "End realtime" : "Start realtime"}
          title={active ? "End realtime" : "Start realtime"}
        >
          {active ? <Square size={19} /> : <Power size={19} />}
        </button>

        <button className="primary-action" type="button" onClick={active ? onStop : onStart}>
          {active ? "End realtime" : "Start realtime"}
        </button>
      </div>

      <form
        className="command-row"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <Mic size={17} aria-hidden="true" />
        <input
          value={command}
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder="输入一句话测试：今天是什么日子？"
          aria-label="测试文字指令"
        />
        <button type="submit" disabled={!command.trim()}>
          发送
        </button>
      </form>

      <div className="quick-row" aria-label="快捷测试">
        <button type="button" onClick={() => onQuick("星灵，在吗？")}>
          <Radio size={15} />
          <span>唤醒</span>
        </button>
        <button type="button" onClick={() => onQuick("你的名字是什么？")}>
          <Bot size={15} />
          <span>名字</span>
        </button>
        <button type="button" onClick={() => onQuick("今天是什么日子？")}>
          <CalendarClock size={15} />
          <span>日期</span>
        </button>
        <button type="button" onClick={() => onQuick("帮我打开百度。")}>
          <Globe2 size={15} />
          <span>百度</span>
        </button>
        <button type="button" onClick={() => onQuick("帮我打开计算器。")}>
          <Calculator size={15} />
          <span>计算器</span>
        </button>
        <button type="button" onClick={() => onQuick("帮我打开记事本。")}>
          <TerminalSquare size={15} />
          <span>记事本</span>
        </button>
        <button type="button" onClick={() => onQuick("帮我搜索 OpenAI Realtime。")}>
          <Globe2 size={15} />
          <span>搜索</span>
        </button>
      </div>
    </section>
  );
}
