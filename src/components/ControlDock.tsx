import {
  Bot,
  CalendarClock,
  Calculator,
  Globe2,
  Mic,
  SendHorizontal,
  Settings,
  TerminalSquare
} from "lucide-react";
import type { AssistantStatus } from "../types/realtime";

interface ControlDockProps {
  status: AssistantStatus;
  active: boolean;
  command: string;
  onCommandChange(value: string): void;
  onSend(): void;
  onQuick(text: string): void;
  onSettings(): void;
}

const statusLabel: Record<AssistantStatus, string> = {
  idle: "待命",
  connecting: "连接中",
  listening: "聆听",
  thinking: "思考",
  speaking: "回应",
  executing_tool: "执行",
  error: "异常"
};

export function ControlDock({
  status,
  active,
  command,
  onCommandChange,
  onSend,
  onQuick,
  onSettings
}: ControlDockProps) {
  return (
    <section className="control-shell" aria-label="星灵桌面智能控制台">
      <div className="main-dock">
        <div className={`status-pill status-${status}`}>
          <span className="status-dot" />
          <strong>{active ? `语音${statusLabel[status]}` : "语音待命"}</strong>
        </div>

        <button className="icon-mode-button" type="button" onClick={onSettings} aria-label="打开设置" title="设置">
          <Settings size={16} />
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
          placeholder="输入中文指令，例如：星灵，今天几号？"
          aria-label="中文测试指令"
        />
        <button type="submit" disabled={!command.trim()} aria-label="发送指令" title="发送">
          <SendHorizontal size={17} />
        </button>
      </form>

      <div className="quick-row" aria-label="快捷中文测试">
        <button type="button" onClick={() => onQuick("你的名字是什么？")}>
          <Bot size={15} />
          <span>名字</span>
        </button>
        <button type="button" onClick={() => onQuick("今天是什么日期？")}>
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
