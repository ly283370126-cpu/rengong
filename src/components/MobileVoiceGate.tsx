import { Mic, Settings } from "lucide-react";

interface MobileVoiceGateProps {
  open: boolean;
  onAllow(): void;
  onSettings(): void;
}

export function MobileVoiceGate({ open, onAllow, onSettings }: MobileVoiceGateProps) {
  if (!open) return null;
  const insecureRemote =
    typeof window !== "undefined" &&
    !window.isSecureContext &&
    !["localhost", "127.0.0.1"].includes(window.location.hostname);

  return (
    <div className="mobile-voice-gate" role="dialog" aria-modal="true" aria-label="允许语音沟通">
      <section className="mobile-voice-gate__panel">
        <div className="mobile-voice-gate__icon">
          <Mic size={24} />
        </div>
        <h2>让星灵听见你</h2>
        <p>手机浏览器需要你点一下，才能打开麦克风。授权后就会默认进入语音沟通。</p>
        {insecureRemote && <p className="mobile-voice-gate__warning">手机端麦克风通常需要 HTTPS；如果你用局域网 IP 访问，请改用 HTTPS 地址。</p>}
        <button className="mobile-voice-gate__primary" type="button" onClick={onAllow}>
          <Mic size={18} />
          <span>允许语音沟通</span>
        </button>
        <button className="mobile-voice-gate__secondary" type="button" onClick={onSettings}>
          <Settings size={17} />
          <span>设置</span>
        </button>
      </section>
    </div>
  );
}
