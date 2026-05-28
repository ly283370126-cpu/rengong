const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { platform } = require("node:os");
const express = require("express");
const dotenv = require("dotenv");

const execFileAsync = promisify(execFile);

const urlShortcuts = {
  baidu: "https://www.baidu.com",
  bilibili: "https://www.bilibili.com",
  douyin: "https://www.douyin.com",
  github: "https://github.com",
  openai: "https://platform.openai.com/docs",
  google: "https://www.google.com",
  bing: "https://www.bing.com",
  calendar: "https://calendar.google.com",
  outlook: "https://outlook.live.com/calendar"
};

const allowedApps = {
  calculator: { label: "计算器", win32: "calc.exe", darwin: "Calculator", linux: "gnome-calculator" },
  notepad: { label: "记事本", win32: "notepad.exe", darwin: "TextEdit", linux: "gedit" },
  paint: { label: "画图", win32: "mspaint.exe", darwin: "Preview", linux: "pinta" },
  chrome: { label: "Chrome", win32: "chrome.exe", darwin: "Google Chrome", linux: "google-chrome" },
  edge: { label: "Microsoft Edge", win32: "msedge.exe", darwin: "Microsoft Edge", linux: "microsoft-edge" },
  wechat: { label: "微信", win32: "WeChat.exe", darwin: "WeChat", linux: "wechat" }
};

function masked(value) {
  if (!value) return "";
  if (value.length <= 12) return "已配置";
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}

function currentDate() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    zhCN: new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      dateStyle: "full",
      timeStyle: "medium"
    }).format(now)
  };
}

function safeUrl(input) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("只允许打开 http/https 网页。");
  }
  return url.toString();
}

async function openTarget(target) {
  const system = platform();
  if (system === "win32") {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Start-Process -FilePath $args[0]",
      target
    ]);
    return;
  }
  if (system === "darwin") {
    await execFileAsync("open", [target]);
    return;
  }
  await execFileAsync("xdg-open", [target]);
}

async function openWhitelistedApp(app) {
  const spec = allowedApps[app];
  if (!spec) throw new Error(`应用不在白名单里：${app}`);
  const system = platform();
  if (system === "win32") await execFileAsync(spec.win32, []);
  else if (system === "darwin") await execFileAsync("open", ["-a", spec.darwin]);
  else await execFileAsync(spec.linux, []);
  return spec.label;
}

async function executeTool(input) {
  const name = input?.name;
  const args = input?.arguments || {};
  try {
    if (name === "get_current_date") return { ok: true, name, result: currentDate() };
    if (name === "open_url") {
      const target = safeUrl(args.shortcut ? urlShortcuts[String(args.shortcut).toLowerCase()] : args.url);
      await openTarget(target);
      return { ok: true, name, result: { opened: target } };
    }
    if (name === "open_app") {
      const key = String(args.app || "").toLowerCase();
      const label = await openWhitelistedApp(key);
      return { ok: true, name, result: { opened: key, label } };
    }
    if (name === "search_web") {
      const query = encodeURIComponent(String(args.query || ""));
      const engine = args.engine || "bing";
      const target =
        engine === "baidu"
          ? `https://www.baidu.com/s?wd=${query}`
          : engine === "google"
            ? `https://www.google.com/search?q=${query}`
            : `https://www.bing.com/search?q=${query}`;
      await openTarget(target);
      return { ok: true, name, result: { opened: target, query: args.query } };
    }
    if (name === "create_calendar_event") {
      const title = encodeURIComponent(String(args.title || "新日程"));
      const notes = encodeURIComponent(String(args.notes || ""));
      const target = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${notes}`;
      await openTarget(target);
      return { ok: true, name, result: { opened: target, title: args.title } };
    }
    if (name === "open_file") {
      const target = String(args.path || "");
      if (!/^[a-zA-Z]:\\|^\\\\/.test(target)) throw new Error("文件路径必须是 Windows 绝对路径。");
      await openTarget(target);
      return { ok: true, name, result: { opened: target } };
    }
    return { ok: false, name: "get_current_date", error: `未知工具：${name}` };
  } catch (error) {
    return { ok: false, name, error: error instanceof Error ? error.message : String(error) };
  }
}

function buildAssistantInstructions() {
  const date = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date());
  return [
    "你叫星灵，是一个中文实时语音桌面助手。",
    `当前中国时间是：${date}。回答今天日期时必须使用这个时间，不要凭记忆猜。`,
    "用户说“星灵”是在唤醒你；唤醒后简短回应，等待下一句。",
    "用户让你打开网页、本机应用、文件、搜索网页或创建日程时，优先调用工具。",
    "你不能执行没有白名单的应用，也不能构造任意 shell 命令。"
  ].join("\n");
}

const realtimeTools = [
  { type: "function", name: "get_current_date", description: "获取当前中国日期和时间。", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "open_url", description: "打开安全网页或快捷方式。", parameters: { type: "object", properties: { url: { type: "string" }, shortcut: { type: "string" } }, additionalProperties: false } },
  { type: "function", name: "open_app", description: "打开白名单应用。", parameters: { type: "object", properties: { app: { type: "string" } }, required: ["app"], additionalProperties: false } },
  { type: "function", name: "search_web", description: "搜索网页。", parameters: { type: "object", properties: { query: { type: "string" }, engine: { type: "string", enum: ["baidu", "bing", "google"] } }, required: ["query"], additionalProperties: false } },
  { type: "function", name: "create_calendar_event", description: "打开日程创建页面。", parameters: { type: "object", properties: { title: { type: "string" }, date: { type: "string" }, notes: { type: "string" } }, required: ["title"], additionalProperties: false } },
  { type: "function", name: "open_file", description: "打开用户明确提供的本机文件或目录。", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } }
];

function sessionConfig() {
  return {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
    audio: {
      input: { turn_detection: { type: "semantic_vad", eagerness: "medium", create_response: true, interrupt_response: true } },
      output: { voice: process.env.OPENAI_REALTIME_VOICE || "marin" }
    },
    instructions: buildAssistantInstructions(),
    tools: realtimeTools,
    tool_choice: "auto"
  };
}

async function writeEnvValues(envPath, values) {
  let raw = "";
  try {
    raw = await fs.readFile(envPath, "utf-8");
  } catch {}
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  const seen = new Set();
  const next = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match || !(match[1] in values)) return line;
    seen.add(match[1]);
    return `${match[1]}=${values[match[1]]}`;
  });
  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) next.push(`${key}=${value}`);
    process.env[key] = value;
  }
  await fs.mkdir(path.dirname(envPath), { recursive: true });
  await fs.writeFile(envPath, `${next.join("\n")}\n`, "utf-8");
}

function startLocalServer({ port, staticDir, envDir }) {
  const envPath = path.join(envDir, ".env");
  dotenv.config({ path: envPath });
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(express.text({ type: "application/sdp", limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      realtimeModel: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
      voice: process.env.OPENAI_REALTIME_VOICE || "marin",
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
      realtimeModel: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
      realtimeVoice: process.env.OPENAI_REALTIME_VOICE || "marin",
      envPath
    });
  });

  app.put("/api/config", async (req, res) => {
    const values = {};
    if (req.body.openaiApiKey) values.OPENAI_API_KEY = String(req.body.openaiApiKey).trim();
    if (req.body.realtimeModel) values.OPENAI_REALTIME_MODEL = String(req.body.realtimeModel).trim();
    if (req.body.realtimeVoice) values.OPENAI_REALTIME_VOICE = String(req.body.realtimeVoice).trim();
    await writeEnvValues(envPath, values);
    res.json({ ok: true, saved: Object.keys(values), envPath });
  });

  app.post("/api/config/test-openai", async (_req, res) => {
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ ok: false, message: "OPENAI_API_KEY 未配置。" });
    const response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return res.status(400).json({ ok: false, status: response.status, message: payload?.error?.message || response.statusText });
    }
    res.json({ ok: true, status: response.status, message: "OpenAI Key 可用。" });
  });

  app.post("/api/tools/execute", async (req, res) => {
    const output = await executeTool(req.body);
    res.status(output.ok ? 200 : 400).json(output);
  });

  app.post("/api/realtime/calls", async (req, res) => {
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: "OPENAI_API_KEY 未配置。" });
    const form = new FormData();
    form.set("sdp", req.body);
    form.set("session", JSON.stringify(sessionConfig()));
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });
    if (!response.ok) return res.status(response.status).json({ error: "OpenAI Realtime 会话创建失败。", detail: await response.text() });
    res.type("application/sdp").send(await response.text());
  });

  app.use(express.static(staticDir));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(staticDir, "index.html")));

  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        url: `http://127.0.0.1:${actualPort}`,
        close: () => server.close()
      });
    });
    server.on("error", reject);
  });
}

module.exports = { startLocalServer };
