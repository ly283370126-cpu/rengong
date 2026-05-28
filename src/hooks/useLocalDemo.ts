import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantStatus, LogEntry, ToolName } from "../types/realtime";

interface DemoOptions {
  onStatus(status: AssistantStatus): void;
  addLog(entry: Omit<LogEntry, "id" | "at">): void;
}

function hasSpeechSynthesis() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
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

async function executeTool(name: ToolName, args: Record<string, unknown>) {
  const response = await fetch("/api/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args })
  });

  return response.json();
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
    if (!SpeechRecognition) {
      return false;
    }

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
      if (cleaned) {
        void submitRef.current(cleaned);
      }
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
        await wait(Math.min(2600, Math.max(900, text.length * 95)));
        speakingRef.current = false;
        if (shouldListenRef.current) startRecognitionRef.current();
        onStatus("listening");
        return;
      }

      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "zh-CN";
        utterance.rate = 1.02;
        utterance.pitch = 1.02;
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
      addLog({ role: "system", text: "当前浏览器没有可用的本地语音识别，可以用文字框和快捷按钮测试。" });
    }
    await speak("你好，我是星灵。你可以直接说话，也可以问日期，或者让我打开百度、B站、计算器和记事本。");
  }, [addLog, onStatus, speak]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    activeRef.current = false;
    speakingRef.current = false;
    stopRecognition();
    if (hasSpeechSynthesis()) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    setActive(false);
    onStatus("idle");
  }, [onStatus, stopRecognition]);

  const submit = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;

      if (!activeRef.current) {
        setActive(true);
        activeRef.current = true;
        shouldListenRef.current = true;
      }

      addLog({ role: "user", text });
      onStatus("thinking");
      await wait(280);

      if (/星灵|醒醒|在吗/.test(text)) {
        await speak("我在。你说。");
        return;
      }

      if (/名字|叫/.test(text)) {
        await speak("我叫星灵，是你的实时语音 AI 助手。");
        return;
      }

      if (/今天|日期|星期|几点|时间/.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("get_current_date", {});
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(`现在是${tool.result?.zhCN ?? "我没能读取到时间"}。`);
        return;
      }

      if (/百度/.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_url", { shortcut: "baidu" });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(tool.ok ? "百度已经打开了。" : `打开失败：${tool.error}`);
        return;
      }

      if (/B站|哔哩|bilibili/i.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_url", { shortcut: "bilibili" });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(tool.ok ? "B站已经打开了。" : `打开失败：${tool.error}`);
        return;
      }

      if (/计算器/.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_app", { app: "calculator" });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(tool.ok ? "计算器已经打开了。" : `打开失败：${tool.error}`);
        return;
      }

      if (/记事本/.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_app", { app: "notepad" });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(tool.ok ? "记事本已经打开了。" : `打开失败：${tool.error}`);
        return;
      }

      if (/微信/.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_app", { app: "wechat" });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(tool.ok ? "微信已经打开了。" : `打开失败：${tool.error}`);
        return;
      }

      if (/浏览器|Chrome|谷歌浏览器/i.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_app", { app: "chrome" });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(tool.ok ? "浏览器已经打开了。" : `打开失败：${tool.error}`);
        return;
      }

      if (/搜索|查一下|搜一下/.test(text)) {
        const query = text
          .replace(/星灵/g, "")
          .replace(/帮我/g, "")
          .replace(/搜索|查一下|搜一下/g, "")
          .trim();
        onStatus("executing_tool");
        const tool = await executeTool("search_web", { query: query || text, engine: "bing" });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(tool.ok ? "搜索结果已经打开了。" : `搜索失败：${tool.error}`);
        return;
      }

      if (/日程|提醒|会议/.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("create_calendar_event", { title: text, notes: "由星灵创建" });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(tool.ok ? "日程创建页面已经打开了，你可以确认时间后保存。" : `日程失败：${tool.error}`);
        return;
      }

      if (/谢谢|感谢/.test(text)) {
        await speak("不用客气，有需要随时叫我。");
        return;
      }

      await speak("这条我先用本地演示模式回答：收到。配好 OpenAI Key 后，我就能进行真正的实时 AI 对话。");
    },
    [addLog, onStatus, speak]
  );

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  return { active, start, stop, submit };
}
