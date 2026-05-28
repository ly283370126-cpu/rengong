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

type ConfigResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

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
      .catch(() => setMessage("Unable to read local configuration."));
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
      const payload = (await response.json()) as ConfigResponse;
      if (!response.ok) throw new Error(payload.error ?? "Save failed");
      setMessage("Configuration saved locally.");
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
      const payload = (await response.json()) as ConfigResponse;
      setMessage(payload.message ?? (payload.ok ? "Key is usable." : "Key is not usable."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="config-backdrop" role="dialog" aria-modal="true" aria-label="Assistant settings">
      <section className="config-panel">
        <div className="config-panel-header">
          <div>
            <Settings size={18} />
            <strong>Assistant Settings</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings">
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
              placeholder={config?.openaiConfigured ? `Configured: ${config.openaiApiKeyMasked}` : "Paste sk-..."}
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
            Test key
          </button>
          <button type="button" onClick={() => void save()} disabled={busy}>
            Save settings
          </button>
        </div>
      </section>
    </div>
  );
}
