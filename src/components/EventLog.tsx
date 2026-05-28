import type { LogEntry } from "../types/realtime";

interface EventLogProps {
  entries: LogEntry[];
}

export function EventLog({ entries }: EventLogProps) {
  return (
    <aside className="event-log" aria-label="Conversation event log">
      <div className="event-log-header">
        <span>Live Trace</span>
        <strong>{entries.length}</strong>
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
