import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

type Target = {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl?: string;
};

type CdpResponse = {
  id: number;
  result?: unknown;
  error?: { message?: string };
};

const root = process.cwd();
const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? 9222);
const profilePath =
  process.env.CHROME_PROFILE_DIR ?? path.join(root, ".chrome-codex-profile");
const defaultUrl = process.env.CHROME_START_URL ?? "http://127.0.0.1:5173/";
const proxy = process.env.CHROME_PROXY ?? "http://127.0.0.1:7892";
const proxyBypass = process.env.CHROME_PROXY_BYPASS ?? "127.0.0.1;localhost;<local>";
const endpoint = `http://127.0.0.1:${debugPort}`;

function arg(name: string, fallback?: string) {
  const flag = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(flag));
  return found ? found.slice(flag.length) : fallback;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url} failed: ${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

async function targets() {
  return request<Target[]>(`${endpoint}/json/list`);
}

async function firstPageTarget() {
  const pages = (await targets()).filter((target) => target.type === "page");
  const page = pages.find((target) => target.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) {
    throw new Error("No debuggable Chrome page found. Run npm run chrome:start first.");
  }
  return page;
}

async function start() {
  await fs.mkdir(profilePath, { recursive: true });

  try {
    await request(`${endpoint}/json/version`);
    console.log(JSON.stringify({ ok: true, alreadyRunning: true, endpoint }, null, 2));
    return;
  } catch {
    // Start a new controlled Chrome below.
  }

  const args = [
    `--remote-debugging-port=${debugPort}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    `--proxy-server=${proxy}`,
    `--proxy-bypass-list=${proxyBypass}`,
    defaultUrl
  ];

  const child = spawn(chromePath, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
}

async function waitForChrome() {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    try {
      await request(`${endpoint}/json/version`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Chrome debug endpoint did not start at ${endpoint}`);
}

async function stop() {
  if (process.platform !== "win32") {
    throw new Error("chrome:stop currently supports Windows only.");
  }

  const escapedProfile = profilePath.replace(/'/g, "''");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `$profile='${escapedProfile}'; Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -like "*$profile*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
      ],
      { stdio: "inherit", windowsHide: true }
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Failed to stop Chrome profile processes: ${code}`));
    });
  });
  console.log(JSON.stringify({ ok: true, stoppedProfile: profilePath }, null, 2));
}

class CdpClient {
  private socket?: WebSocket;
  private nextId = 1;
  private pending = new Map<number, (response: CdpResponse) => void>();

  constructor(private readonly wsUrl: string) {}

  async connect() {
    this.socket = new WebSocket(this.wsUrl);
    this.socket.addEventListener("message", (event) => {
      const response = JSON.parse(String(event.data)) as CdpResponse;
      if (typeof response.id === "number") {
        const resolve = this.pending.get(response.id);
        this.pending.delete(response.id);
        resolve?.(response);
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.socket?.addEventListener("open", () => resolve(), { once: true });
      this.socket?.addEventListener("error", () => reject(new Error("CDP WebSocket failed")), {
        once: true
      });
    });
  }

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
    if (!this.socket) throw new Error("CDP client is not connected");
    const id = this.nextId++;
    const response = await new Promise<CdpResponse>((resolve) => {
      this.pending.set(id, resolve);
      this.socket?.send(JSON.stringify({ id, method, params }));
    });
    if (response.error) throw new Error(response.error.message ?? `${method} failed`);
    return response.result as T;
  }

  close() {
    this.socket?.close();
  }
}

async function withPage<T>(run: (client: CdpClient, target: Target) => Promise<T>) {
  const target = await firstPageTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl!);
  await client.connect();
  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    return await run(client, target);
  } finally {
    client.close();
  }
}

async function evaluate<T>(client: CdpClient, expression: string) {
  const result = await client.send<{
    result: { value?: T };
    exceptionDetails?: unknown;
  }>("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(`Evaluation failed: ${JSON.stringify(result)}`);
  return result.result.value as T;
}

async function gotoPage() {
  const url = arg("url", process.argv[3] === "goto" ? process.argv[4] : undefined);
  if (!url) throw new Error("Usage: npm run chrome:goto -- --url=https://example.com");
  await withPage(async (client) => {
    await client.send("Page.navigate", { url });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const state = await evaluate<{ title: string; url: string }>(
      client,
      "({ title: document.title, url: location.href })"
    );
    console.log(JSON.stringify({ ok: true, ...state }, null, 2));
  });
}

async function click() {
  const selector = arg("selector");
  if (!selector) throw new Error("Usage: npm run chrome:click -- --selector='button'");
  await withPage(async (client) => {
    const clicked = await evaluate<boolean>(
      client,
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
      })()`
    );
    console.log(JSON.stringify({ ok: clicked, selector }, null, 2));
    if (!clicked) process.exitCode = 1;
  });
}

async function typeText() {
  const selector = arg("selector");
  const text = arg("text") ?? "";
  if (!selector) throw new Error("Usage: npm run chrome:type -- --selector='input' --text='hello'");
  await withPage(async (client) => {
    const typed = await evaluate<boolean>(
      client,
      `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
        el.focus();
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`
    );
    console.log(JSON.stringify({ ok: typed, selector, textLength: text.length }, null, 2));
    if (!typed) process.exitCode = 1;
  });
}

async function status() {
  const version = await request(`${endpoint}/json/version`);
  const pageTargets = await targets();
  console.log(JSON.stringify({ ok: true, version, targets: pageTargets }, null, 2));
}

const command = process.argv[2] ?? "status";

try {
  if (command === "start") {
    await start();
    await waitForChrome();
    await status();
  } else if (command === "stop") {
    await stop();
  } else if (command === "goto") {
    await gotoPage();
  } else if (command === "click") {
    await click();
  } else if (command === "type") {
    await typeText();
  } else if (command === "status") {
    await status();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
