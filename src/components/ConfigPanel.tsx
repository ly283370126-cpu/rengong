import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Settings, X } from "lucide-react";

interface ConfigPanelProps {
  open: boolean;
  onClose(): void;
  onSaved(): void;
}

interface ConfigPayload {
  openaiApiKeyMasked: string;
  openaiConfigured: boolean;
  realtimeModel: string;
  realtimeVoice: string;
  envPath: string;
}

export function ConfigPanel({ open, onClose, onSaved }: ConfigPanelProps) {
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("gpt-realtime");
  const [voice, setVoice] = useState("marin");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage("");
    fetch("/api/config")
      .then((response) => response.json())
      .then((payload: ConfigPayload) => {
        setConfig(payload);
        setModel(payload.realtimeModel);
        setVoice(payload.realtimeVoice);
        setKey("");
      })
      .catch(() => setMessage("读取配置失败。"));
  }, [open]);

  if (!open) return null;

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openaiApiKey: key,
          realtimeModel: model,
          realtimeVoice: voice
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "保存失败");
      setMessage("配置已保存。");
      setKey("");
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function testKey() {
    setBusy(true);
    setMessage("");
    try {
      if (key.trim()) await save();
      const response = await fetch("/api/config/test-openai", { method: "POST" });
      const payload = await response.json();
      setMessage(payload.message ?? (payload.ok ? "Key 可用。" : "Key 不可用。"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="config-backdrop" role="dialog" aria-modal="true" aria-label="配置">
      <section className="config-panel">
        <div className="config-panel-header">
          <div>
            <Settings size={18} />
            <strong>Assistant Settings</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭配置">
            <X size={18} />
          </button>
        </div>

        <label className="config-field">
          <span>OpenAI API Key</span>
          <div className="key-input">
            <KeyRound size={16} />
            <input
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={config?.openaiConfigured ? `已配置：${config.openaiApiKeyMasked}` : "粘贴 sk-..."}
              autoComplete="off"
            />
          </div>
        </label>

        <div className="config-grid">
          <label className="config-field">
            <span>Realtime Model</span>
            <input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
          <label className="config-field">
            <span>Voice</span>
            <input value={voice} onChange={(event) => setVoice(event.target.value)} />
          </label>
        </div>

        <div className="config-path">
          <CheckCircle2 size={15} />
          <span>{config?.envPath ?? ".env"}</span>
        </div>

        {message && <p className="config-message">{message}</p>}

        <div className="config-actions">
          <button type="button" onClick={() => void testKey()} disabled={busy}>
            测试 Key
          </button>
          <button type="button" onClick={() => void save()} disabled={busy}>
            保存配置
          </button>
        </div>
      </section>
    </div>
  );
}
