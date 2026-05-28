import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolName, ToolResult } from "../types/realtime";

const execFileAsync = promisify(execFile);

export const urlShortcuts = {
  baidu: "https://www.baidu.com",
  bilibili: "https://www.bilibili.com",
  douyin: "https://www.douyin.com",
  github: "https://github.com",
  openai: "https://platform.openai.com/docs",
  google: "https://www.google.com",
  bing: "https://www.bing.com",
  calendar: "https://calendar.google.com",
  outlook: "https://outlook.live.com/calendar"
} as const;

export const allowedApps = {
  calculator: {
    label: "计算器",
    win32: "calc.exe",
    darwin: "Calculator",
    linux: "gnome-calculator"
  },
  notepad: {
    label: "记事本",
    win32: "notepad.exe",
    darwin: "TextEdit",
    linux: "gedit"
  },
  paint: {
    label: "画图",
    win32: "mspaint.exe",
    darwin: "Preview",
    linux: "pinta"
  },
  chrome: {
    label: "Chrome",
    win32: "chrome.exe",
    darwin: "Google Chrome",
    linux: "google-chrome"
  },
  edge: {
    label: "Microsoft Edge",
    win32: "msedge.exe",
    darwin: "Microsoft Edge",
    linux: "microsoft-edge"
  },
  wechat: {
    label: "微信",
    win32: "WeChat.exe",
    darwin: "WeChat",
    linux: "wechat"
  }
} as const;

const toolSchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("get_current_date"),
    arguments: z.record(z.string(), z.unknown()).optional().default({})
  }),
  z.object({
    name: z.literal("open_url"),
    arguments: z.object({
      url: z.string().optional(),
      shortcut: z.string().optional()
    })
  }),
  z.object({
    name: z.literal("open_app"),
    arguments: z.object({
      app: z.string()
    })
  }),
  z.object({
    name: z.literal("open_file"),
    arguments: z.object({
      path: z.string()
    })
  }),
  z.object({
    name: z.literal("search_web"),
    arguments: z.object({
      query: z.string(),
      engine: z.enum(["baidu", "bing", "google"]).optional().default("bing")
    })
  }),
  z.object({
    name: z.literal("create_calendar_event"),
    arguments: z.object({
      title: z.string(),
      date: z.string().optional(),
      notes: z.string().optional()
    })
  })
]);

function result(name: ToolName, data: unknown): ToolResult {
  return { ok: true, name, result: data };
}

function failure(name: ToolName, error: string): ToolResult {
  return { ok: false, name, error };
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

function safeUrl(input: string): string {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("只允许打开 http/https 网页。");
  }
  return url.toString();
}

async function openUrl(url: string) {
  const system = platform();

  if (system === "win32") {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Start-Process -FilePath $args[0]",
      url
    ]);
    return;
  }

  if (system === "darwin") {
    await execFileAsync("open", [url]);
    return;
  }

  await execFileAsync("xdg-open", [url]);
}

function userAllowedFilePath(input: string): string {
  const normalized = input.replace(/^["']|["']$/g, "");
  if (/^https?:\/\//i.test(normalized)) return safeUrl(normalized);
  if (!/^[a-zA-Z]:\\|^\\\\/.test(normalized)) {
    throw new Error("文件路径必须是 Windows 绝对路径。");
  }
  return normalized;
}

async function openWhitelistedApp(app: keyof typeof allowedApps) {
  const system = platform();
  const spec = allowedApps[app];

  if (system === "win32") {
    await execFileAsync(spec.win32, []);
    return spec.label;
  }

  if (system === "darwin") {
    await execFileAsync("open", ["-a", spec.darwin]);
    return spec.label;
  }

  await execFileAsync(spec.linux, []);
  return spec.label;
}

export async function executeTool(input: unknown): Promise<ToolResult> {
  const parsed = toolSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      name: "get_current_date",
      error: parsed.error.issues.map((issue) => issue.message).join("; ")
    };
  }

  const request = parsed.data;

  try {
    if (request.name === "get_current_date") {
      return result("get_current_date", currentDate());
    }

    if (request.name === "open_url") {
      const shortcut = request.arguments.shortcut?.toLowerCase();
      const fromShortcut = shortcut
        ? urlShortcuts[shortcut as keyof typeof urlShortcuts]
        : undefined;
      const target = safeUrl(fromShortcut ?? request.arguments.url ?? "");
      await openUrl(target);
      return result("open_url", { opened: target });
    }

    if (request.name === "open_file") {
      const target = userAllowedFilePath(request.arguments.path);
      await openUrl(target);
      return result("open_file", { opened: target });
    }

    if (request.name === "search_web") {
      const query = encodeURIComponent(request.arguments.query);
      const engine = request.arguments.engine;
      const target =
        engine === "baidu"
          ? `https://www.baidu.com/s?wd=${query}`
          : engine === "google"
            ? `https://www.google.com/search?q=${query}`
            : `https://www.bing.com/search?q=${query}`;
      await openUrl(target);
      return result("search_web", { opened: target, query: request.arguments.query });
    }

    if (request.name === "create_calendar_event") {
      const title = encodeURIComponent(request.arguments.title);
      const notes = encodeURIComponent(request.arguments.notes ?? "");
      const target = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${notes}`;
      await openUrl(target);
      return result("create_calendar_event", {
        opened: target,
        title: request.arguments.title,
        date: request.arguments.date ?? null
      });
    }

    const key = request.arguments.app.toLowerCase() as keyof typeof allowedApps;
    if (!allowedApps[key]) {
      return failure("open_app", `应用不在白名单里：${request.arguments.app}`);
    }

    const label = await openWhitelistedApp(key);
    return result("open_app", { opened: key, label });
  } catch (error) {
    return failure(request.name, error instanceof Error ? error.message : String(error));
  }
}
