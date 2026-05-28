import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantStatus, LogEntry, ToolName, ToolResult } from "../types/realtime";

interface DemoOptions {
  onStatus(status: AssistantStatus): void;
  addLog(entry: Omit<LogEntry, "id" | "at">): void;
}

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type RecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
};

const shortcuts = [
  { pattern: /baidu|百度/i, shortcut: "baidu", label: "Baidu" },
  { pattern: /bilibili|b站|B站/i, shortcut: "bilibili", label: "Bilibili" },
  { pattern: /douyin|抖音/i, shortcut: "douyin", label: "Douyin" },
  { pattern: /github/i, shortcut: "github", label: "GitHub" },
  { pattern: /openai/i, shortcut: "openai", label: "OpenAI docs" },
  { pattern: /google|谷歌/i, shortcut: "google", label: "Google" },
  { pattern: /bing|必应/i, shortcut: "bing", label: "Bing" }
];

const apps = [
  { pattern: /calculator|计算器/i, app: "calculator", label: "Calculator" },
  { pattern: /notepad|记事本/i, app: "notepad", label: "Notepad" },
  { pattern: /paint|画图/i, app: "paint", label: "Paint" },
  { pattern: /chrome|谷歌浏览器|浏览器/i, app: "chrome", label: "Chrome" },
  { pattern: /edge/i, app: "edge", label: "Microsoft Edge" },
  { pattern: /wechat|微信/i, app: "wechat", label: "WeChat" }
];

function hasSpeechSynthesis() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const speechWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalize(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function stripCommandWords(text: string) {
  return normalize(
    text
      .replace(/jarvis|javis|贾维斯|星灵/gi, "")
      .replace(/please|帮我|请|一下|打开|搜索|查一下|查一查|查|look up|search for/gi, "")
  );
}

async function executeTool(name: ToolName, args: Record<string, unknown>): Promise<ToolResult> {
  const response = await fetch("/api/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args })
  });

  return response.json() as Promise<ToolResult>;
}

function toolSummary(tool: ToolResult, success: string) {
  return tool.ok ? success : `工具调用失败：${tool.error ?? "未知错误"}。`;
}

export function useLocalDemo({ onStatus, addLog }: DemoOptions) {
  const [active, setActive] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const shouldListenRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const startRecognitionRef = useRef<() => boolean>(() => false);
  const submitRef = useRef<(raw: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onend = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognitionRef.current = null;
    try {
      recognition.abort();
    } catch {
      recognition.stop();
    }
  }, []);

  const startRecognition = useCallback(() => {
    if (!shouldListenRef.current || speakingRef.current || recognitionRef.current) {
      return Boolean(recognitionRef.current);
    }

    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) return false;

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) finalText += result[0]?.transcript ?? "";
      }
      const cleaned = finalText.trim();
      if (cleaned) void submitRef.current(cleaned);
    };
    recognition.onerror = (event) => {
      if (event.error && event.error !== "no-speech") {
        addLog({ role: "system", text: `浏览器语音识别提示：${event.error}` });
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (shouldListenRef.current && !speakingRef.current) {
        window.setTimeout(() => startRecognitionRef.current(), 280);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      return true;
    } catch {
      recognitionRef.current = null;
      return false;
    }
  }, [addLog]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const speak = useCallback(
    async (text: string) => {
      addLog({ role: "assistant", text });
      onStatus("speaking");
      speakingRef.current = true;
      stopRecognition();

      if (!hasSpeechSynthesis()) {
        await wait(Math.min(2800, Math.max(900, text.length * 70)));
        speakingRef.current = false;
        if (shouldListenRef.current) startRecognitionRef.current();
        onStatus("listening");
        return;
      }

      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = /[\u4e00-\u9fff]/.test(text) ? "zh-CN" : "en-US";
        utterance.rate = 1.02;
        utterance.pitch = 0.92;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        utteranceRef.current = utterance;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });

      speakingRef.current = false;
      if (shouldListenRef.current) startRecognitionRef.current();
      onStatus("listening");
    },
    [addLog, onStatus, stopRecognition]
  );

  const start = useCallback(async () => {
    setActive(true);
    activeRef.current = true;
    shouldListenRef.current = true;
    onStatus("listening");
    const recognitionStarted = startRecognitionRef.current();
    if (!recognitionStarted) {
      addLog({
        role: "system",
        text: "当前浏览器没有可用的本地语音识别；文字指令和快捷动作仍然在线。"
      });
    }
    await speak("系统已上线。我可以打开应用和网页、搜索信息、读取时间、草拟日程，并调度本地工具。");
  }, [addLog, onStatus, speak]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    activeRef.current = false;
    speakingRef.current = false;
    stopRecognition();
    if (hasSpeechSynthesis()) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setActive(false);
    onStatus("idle");
  }, [onStatus, stopRecognition]);

  const submit = useCallback(
    async (raw: string) => {
      const text = normalize(raw);
      if (!text) return;

      if (!activeRef.current) {
        setActive(true);
        activeRef.current = true;
        shouldListenRef.current = true;
      }

      addLog({ role: "user", text });
      onStatus("thinking");
      await wait(220);

      if (/jarvis|javis|贾维斯|星灵|醒醒|在吗|hello|hi/i.test(text)) {
        await speak("我在。告诉我要打开什么、搜索什么、安排什么，或者让我分析下一步。");
        return;
      }

      if (/name|名字|你是谁|who are you/i.test(text)) {
        await speak("你可以叫我贾维斯桌面版。本地核心负责工具调度，Realtime 会接入完整模型能力。");
        return;
      }

      if (/help|capabilities|能力|能做什么|帮助/i.test(text)) {
        await speak("我可以听你说话、语音回应、打开白名单应用和网页、搜索、读取本地时间，并创建日程草稿。");
        return;
      }

      if (/today|date|time|day|现在|今天|日期|时间|星期|几点/i.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("get_current_date", {});
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        const result = tool.result as { zhCN?: string } | undefined;
        await speak(tool.ok ? `现在是${result?.zhCN ?? "本地时间已读取，但解析不完整"}。` : toolSummary(tool, ""));
        return;
      }

      const shortcut = shortcuts.find((item) => item.pattern.test(text));
      if (shortcut && /open|打开|进入|launch/i.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_url", { shortcut: shortcut.shortcut });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(toolSummary(tool, `${shortcut.label} 已打开。`));
        return;
      }

      const app = apps.find((item) => item.pattern.test(text));
      if (app && /open|打开|launch|启动/i.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_app", { app: app.app });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(toolSummary(tool, `${app.label} 已打开。`));
        return;
      }

      if (/search|look up|google|bing|搜索|查询|查一下|查一查/i.test(text)) {
        const query = stripCommandWords(text) || text;
        onStatus("executing_tool");
        const tool = await executeTool("search_web", { query, engine: "bing" });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(toolSummary(tool, `我已打开关于「${query}」的搜索结果。`));
        return;
      }

      if (/calendar|schedule|meeting|reminder|日程|提醒|会议/i.test(text)) {
        onStatus("executing_tool");
        const title = stripCommandWords(text) || "Jarvis task";
        const tool = await executeTool("create_calendar_event", {
          title,
          notes: "由贾维斯桌面版本地核心创建。"
        });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(toolSummary(tool, "我已打开日程草稿。确认时间后保存即可。"));
        return;
      }

      if (/thanks|thank you|谢谢|感谢/i.test(text)) {
        await speak("随时待命。");
        return;
      }

      await speak("本地核心已收到。配置有效的 OpenAI Key 后，我可以进入更深入的实时推理模式。");
    },
    [addLog, onStatus, speak]
  );

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  return { active, start, stop, submit };
}
