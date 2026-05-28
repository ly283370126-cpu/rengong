export type AssistantMode = "demo" | "realtime";

export type AssistantStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "executing_tool"
  | "error";

export type ToolName =
  | "get_current_date"
  | "open_url"
  | "open_app"
  | "open_file"
  | "search_web"
  | "create_calendar_event";

export interface AppStatus {
  ok: boolean;
  openaiConfigured: boolean;
  realtimeModel: string;
  voice: string;
  allowedApps: string[];
  shortcuts: string[];
  envPath?: string;
  keyStatus?: "missing" | "present";
  openaiProxyConfigured?: boolean;
  openaiProxyEnv?: "HTTPS_PROXY" | "HTTP_PROXY" | "ALL_PROXY" | null;
}

export interface AppConfig {
  openaiApiKey: string;
  realtimeModel: string;
  realtimeVoice: string;
}

export interface ToolRequest {
  name: ToolName;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  ok: boolean;
  name: ToolName;
  result?: unknown;
  error?: string;
}

export interface LogEntry {
  id: string;
  at: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
}
