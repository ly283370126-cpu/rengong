import { Activity, BrainCircuit, Cpu, Network } from "lucide-react";
import type { ReactNode } from "react";
import type { LogEntry } from "../types/realtime";

interface CognitivePanelProps {
  entries: LogEntry[];
  openaiConfigured: boolean;
  deepseekConfigured?: boolean;
  proxyConfigured?: boolean;
  active: boolean;
}

const capabilities = [
  "中文语音",
  "文字交互",
  "工具调度",
  "网页启动",
  "应用控制",
  "本地备忘",
  "日程草稿",
  "实时模型"
];

export function CognitivePanel({ entries, openaiConfigured, deepseekConfigured, proxyConfigured, active }: CognitivePanelProps) {
  const traces = entries.slice(-4).reverse();

  return (
    <aside className="cognitive-panel" aria-label="认知状态">
      <div className="cognitive-panel__header">
        <BrainCircuit size={16} />
        <span>认知核心</span>
      </div>

      <div className="cognitive-panel__status-grid">
        <StatusChip icon={<Activity size={13} />} label="会话" value={active ? "在线" : "待命"} live={active} />
        <StatusChip
          icon={<Network size={13} />}
          label="大脑"
          value={deepseekConfigured ? "DeepSeek" : openaiConfigured ? "OpenAI" : "本地"}
          live={deepseekConfigured || openaiConfigured}
        />
        <StatusChip icon={<Cpu size={13} />} label="代理" value={proxyConfigured ? "已连接" : "直连"} live={proxyConfigured} />
      </div>

      <div className="cognitive-panel__capabilities" aria-label="Active capabilities">
        {capabilities.map((capability) => (
          <span key={capability}>{capability}</span>
        ))}
      </div>

      <div className="cognitive-panel__trace-list" aria-label="Recent memory traces">
        {traces.map((entry) => (
          <article key={entry.id} className={`cognitive-panel__trace role-${entry.role}`}>
            <span>{entry.role}</span>
            <p>{entry.text}</p>
          </article>
        ))}
      </div>
    </aside>
  );
}

function StatusChip({ icon, label, value, live }: { icon: ReactNode; label: string; value: string; live?: boolean }) {
  return (
    <div className="cognitive-panel__status" data-live={live ? "true" : "false"}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
