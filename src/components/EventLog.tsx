import { Trash2 } from "lucide-react";
import type { LogEntry } from "../types/realtime";

interface EventLogProps {
  entries: LogEntry[];
  onClear(): void;
}

export function EventLog({ entries, onClear }: EventLogProps) {
  return (
    <aside className="event-log" aria-label="对话记录">
      <div className="event-log-header">
        <span>对话记录</span>
        <button type="button" onClick={onClear} aria-label="清空对话记录" title="清空">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="event-log-list">
        {entries.slice(-8).map((entry) => (
          <article key={entry.id} className={`log-line role-${entry.role}`}>
            <span>{entry.role}</span>
            <p>{entry.text}</p>
          </article>
        ))}
      </div>
    </aside>
  );
}
