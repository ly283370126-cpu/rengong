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
      <div className="mode-row" role="tablist" aria-label="Mode">
        <button
          className={mode === "demo" ? "mode-button is-active" : "mode-button"}
          type="button"
          onClick={() => onModeChange("demo")}
          aria-pressed={mode === "demo"}
        >
          <Bot size={16} />
          <span>Local demo</span>
        </button>
        <button
          className={mode === "realtime" ? "mode-button is-active" : "mode-button"}
          type="button"
          onClick={() => onModeChange("realtime")}
          aria-pressed={mode === "realtime"}
          title={openaiConfigured ? "Use OpenAI Realtime" : "Add OPENAI_API_KEY in .env"}
        >
          <Radio size={16} />
          <span>Realtime</span>
        </button>
        <button className="icon-mode-button" type="button" onClick={onSettings} aria-label="Open settings" title="Settings">
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
          placeholder="Type a test command, e.g. What day is it?"
          aria-label="Test command"
        />
        <button type="submit" disabled={!command.trim()}>
          Send
        </button>
      </form>

      <div className="quick-row" aria-label="Quick tests">
        <button type="button" onClick={() => onQuick("星灵，在吗？")}>
          <Radio size={15} />
          <span>Wake</span>
        </button>
        <button type="button" onClick={() => onQuick("你的名字是什么？")}>
          <Bot size={15} />
          <span>Name</span>
        </button>
        <button type="button" onClick={() => onQuick("今天是什么日子？")}>
          <CalendarClock size={15} />
          <span>Date</span>
        </button>
        <button type="button" onClick={() => onQuick("帮我打开百度。")}>
          <Globe2 size={15} />
          <span>Baidu</span>
        </button>
        <button type="button" onClick={() => onQuick("帮我打开计算器。")}>
          <Calculator size={15} />
          <span>Calculator</span>
        </button>
        <button type="button" onClick={() => onQuick("帮我打开记事本。")}>
          <TerminalSquare size={15} />
          <span>Notepad</span>
        </button>
        <button type="button" onClick={() => onQuick("帮我搜索 OpenAI Realtime。")}>
          <Globe2 size={15} />
          <span>Search</span>
        </button>
      </div>
    </section>
  );
}
