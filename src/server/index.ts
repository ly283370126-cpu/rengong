import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { buildRealtimeSessionConfig } from "../lib/assistantPrompt";
import { openaiFetch, openaiNetworkStatus } from "./openaiClient";
import { allowedApps, executeTool, urlShortcuts } from "./tools";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const port = Number(process.env.PORT ?? 8787);
const publicOrigin = process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:5173";
const envPath = path.resolve(process.cwd(), ".env");

function realtimeModel() {
  return process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
}

function realtimeVoice() {
  return process.env.OPENAI_REALTIME_VOICE ?? "marin";
}

const configSchema = z.object({
  openaiApiKey: z.string().optional(),
  realtimeModel: z.string().min(1).optional(),
  realtimeVoice: z.string().min(1).optional()
});

function masked(value?: string) {
  if (!value) return "";
  if (value.length <= 12) return "已配置";
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

async function readEnvFile() {
  try {
    return await fs.readFile(envPath, "utf-8");
  } catch {
    return "";
  }
}

async function writeEnvValues(values: Record<string, string>) {
  const raw = await readEnvFile();
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const seen = new Set<string>();
  const next = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!(key in values)) return line;
    seen.add(key);
    return `${key}=${values[key]}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) next.push(`${key}=${value}`);
    process.env[key] = value;
  }

  await fs.writeFile(envPath, `${next.join("\n")}\n`, "utf-8");
}

app.use(cors({ origin: publicOrigin }));
app.use(express.json({ limit: "2mb" }));
app.use(express.text({ type: "application/sdp", limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  const network = openaiNetworkStatus();

  res.json({
    ok: true,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    realtimeModel: realtimeModel(),
    voice: realtimeVoice(),
    openaiProxyConfigured: network.proxyConfigured,
    openaiProxyEnv: network.proxyEnv,
    allowedApps: Object.keys(allowedApps),
    shortcuts: Object.keys(urlShortcuts),
    envPath,
    keyStatus: process.env.OPENAI_API_KEY ? "present" : "missing"
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    openaiApiKeyMasked: masked(process.env.OPENAI_API_KEY),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    realtimeModel: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
    realtimeVoice: process.env.OPENAI_REALTIME_VOICE ?? "marin",
    envPath
  });
});

app.put("/api/config", async (req, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((issue) => issue.message).join("; ") });
    return;
  }

  const values: Record<string, string> = {};
  if (parsed.data.openaiApiKey?.trim()) {
    values.OPENAI_API_KEY = parsed.data.openaiApiKey.trim();
  }
  if (parsed.data.realtimeModel?.trim()) {
    values.OPENAI_REALTIME_MODEL = parsed.data.realtimeModel.trim();
  }
  if (parsed.data.realtimeVoice?.trim()) {
    values.OPENAI_REALTIME_VOICE = parsed.data.realtimeVoice.trim();
  }

  await writeEnvValues(values);
  res.json({ ok: true, saved: Object.keys(values), envPath });
});

app.post("/api/config/test-openai", async (_req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(400).json({ ok: false, status: null, message: "OPENAI_API_KEY 未配置。" });
    return;
  }

  const response = await openaiFetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    res.status(400).json({
      ok: false,
      status: response.status,
      message: payload?.error?.message ?? response.statusText
    });
    return;
  }

  res.json({ ok: true, status: response.status, message: "OpenAI Key 可用。" });
});

app.post("/api/tools/execute", async (req, res) => {
  const output = await executeTool(req.body);
  res.status(output.ok ? 200 : 400).json(output);
});

app.post("/api/realtime/calls", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(400).json({
      error: "OPENAI_API_KEY 未配置。请先使用 Local Demo，或在 .env 中配置 Key 后重启。"
    });
    return;
  }

  if (typeof req.body !== "string" || !req.body.includes("v=0")) {
    res.status(400).json({ error: "请求体必须是 WebRTC SDP offer。" });
    return;
  }

  const form = new FormData();
  form.set("sdp", req.body);
  form.set("session", JSON.stringify(buildRealtimeSessionConfig(realtimeModel(), realtimeVoice())));

  const openaiResponse = await openaiFetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: form
  });

  if (!openaiResponse.ok) {
    const detail = await openaiResponse.text();
    res.status(openaiResponse.status).json({
      error: "OpenAI Realtime 会话创建失败。",
      detail
    });
    return;
  }

  const answer = await openaiResponse.text();
  res.type("application/sdp").send(answer);
});

const distPath = path.resolve(__dirname, "../../dist");
app.use(express.static(distPath));
app.get(/.*/, (_req, res, next) => {
  res.sendFile(path.join(distPath, "index.html"), (error) => {
    if (error) next();
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Voice Orb Assistant API listening on http://127.0.0.1:${port}`);
});
