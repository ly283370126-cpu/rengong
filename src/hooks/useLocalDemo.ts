import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantStatus, LogEntry, ToolName, ToolResult } from "../types/realtime";

interface DemoOptions {
  onStatus(status: AssistantStatus): void;
  addLog(entry: Omit<LogEntry, "id" | "at">): void;
  onMicStream?(stream: MediaStream | null): void;
  aiConfigured?: boolean;
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

type MemoryItem = {
  id: string;
  text: string;
  at: string;
};

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatResult = {
  ok: boolean;
  text?: string;
  model?: string;
  error?: string;
};

const memoryStorageKey = "voice-orb-assistant.local-memory";

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
      .replace(/please|帮我|请|一下|打开|搜索|查询|查一下|查一查|查|look up|search for/gi, "")
  );
}

function extractDirectUrl(text: string) {
  const match = /https?:\/\/[^\s，。！？]+/i.exec(text);
  return match?.[0].replace(/[),.，。!?！？]+$/, "") ?? null;
}

function extractFilePath(text: string) {
  const quoted = /["“']([a-zA-Z]:\\[^"”'\r\n]+|\\\\[^"”'\r\n]+)["”']/.exec(text);
  const raw = quoted?.[1] ?? /([a-zA-Z]:\\[^\r\n，。]+|\\\\[^\r\n，。]+)/.exec(text)?.[1];
  return raw?.replace(/[，。,.!?！？]+$/, "").trim() ?? null;
}

function parseMemoryText(text: string) {
  return stripCommandWords(
    text
      .replace(/记住|帮我记住|请记住|remember|note that|note/gi, "")
      .replace(/^[:：,\s]+/, "")
  );
}

function scoreVoice(voice: SpeechSynthesisVoice, wantsChinese: boolean) {
  const profile = `${voice.name} ${voice.lang}`.toLowerCase();
  let score = 0;

  if (wantsChinese) {
    if (/zh|cmn|chinese|mandarin|中文|普通话/.test(profile)) score += 60;
    if (/xiaoxiao|xiaoyi|xiaobei|xiaoni|huihui|yaoyao|tingting|hanhan/.test(profile)) score += 42;
    if (/natural|online|neural|premium/.test(profile)) score += 24;
    if (/female|woman|girl|女/.test(profile)) score += 16;
    if (/yunxi|yunyang|kangkang|male|man|男/.test(profile)) score -= 16;
    if (/google/.test(profile)) score -= 8;
  } else {
    if (/^en/.test(voice.lang)) score += 50;
    if (/ava|aria|jenny|emma|sara|female|natural|neural|premium/.test(profile)) score += 32;
    if (/guy|andrew|david|mark|male/.test(profile)) score -= 10;
  }

  if (voice.default) score += 4;
  if (!voice.localService && /online|natural|neural/.test(profile)) score += 8;
  return score;
}

function selectNaturalVoice(text: string) {
  if (!hasSpeechSynthesis()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const wantsChinese = /[\u4e00-\u9fff]/.test(text);
  const matchingLanguage = wantsChinese
    ? voices.filter((voice) => /zh|cmn|chinese|mandarin/i.test(`${voice.lang} ${voice.name}`))
    : voices.filter((voice) => /^en/i.test(voice.lang));

  return [...(matchingLanguage.length ? matchingLanguage : voices)].sort(
    (left, right) => scoreVoice(right, wantsChinese) - scoreVoice(left, wantsChinese)
  )[0];
}

function prepareSpeechText(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "我把代码内容放在文字里了。")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSpeechText(text: string) {
  const prepared = prepareSpeechText(text);
  const parts = prepared.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [prepared];
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const next = `${current}${part}`.trim();
    if (next.length > 80 && current) {
      chunks.push(current.trim());
      current = part;
    } else {
      current = next;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.slice(0, 8);
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
  return tool.ok ? success : `这一步没成：${tool.error ?? "原因还不明确"}。`;
}

async function executeChat(messages: ChatMessage[], memories: string[]): Promise<ChatResult> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, memories })
  });

  return response.json() as Promise<ChatResult>;
}

export function useLocalDemo({ onStatus, addLog, onMicStream, aiConfigured = false }: DemoOptions) {
  const [active, setActive] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const shouldListenRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionBlockedRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const memoryRef = useRef<MemoryItem[]>([]);
  const chatHistoryRef = useRef<ChatMessage[]>([]);
  const startRecognitionRef = useRef<() => boolean>(() => false);
  const submitRef = useRef<(raw: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(memoryStorageKey);
      const items = raw ? (JSON.parse(raw) as MemoryItem[]) : [];
      if (Array.isArray(items)) memoryRef.current = items.slice(-20);
    } catch {
      memoryRef.current = [];
    }
  }, []);

  useEffect(() => {
    if (!hasSpeechSynthesis()) return;
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const saveMemory = useCallback((items: MemoryItem[]) => {
    memoryRef.current = items.slice(-20);
    try {
      window.localStorage.setItem(memoryStorageKey, JSON.stringify(memoryRef.current));
    } catch {
      // Memory is a convenience feature; losing persistence should not break the assistant.
    }
  }, []);

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

  const releaseMicStream = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    onMicStream?.(null);
  }, [onMicStream]);

  const ensureMicStream = useCallback(async () => {
    if (micStreamRef.current) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      const secureHint =
        typeof window !== "undefined" && !window.isSecureContext
          ? " 手机浏览器通常需要 HTTPS 才会开放麦克风。"
          : "";
      addLog({ role: "system", text: `这个环境没有麦克风接口；文字对话还能继续。${secureHint}` });
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      micStreamRef.current = stream;
      onMicStream?.(stream);
      return true;
    } catch {
      recognitionBlockedRef.current = true;
      addLog({ role: "system", text: "我还没拿到麦克风权限；允许麦克风后，我就能听见你说话。" });
      return false;
    }
  }, [addLog, onMicStream]);

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
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        recognitionBlockedRef.current = true;
        shouldListenRef.current = false;
        activeRef.current = false;
        setActive(false);
        releaseMicStream();
        addLog({ role: "system", text: "麦克风权限不可用；文字指令仍然可以继续使用。" });
        return;
      }
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
      if (recognitionBlockedRef.current) return false;
      recognition.start();
      recognitionRef.current = recognition;
      return true;
    } catch {
      recognitionRef.current = null;
      return false;
    }
  }, [addLog, releaseMicStream]);

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
        const listening = shouldListenRef.current && startRecognitionRef.current();
        if (listening) {
          onStatus("listening");
        } else {
          shouldListenRef.current = false;
          activeRef.current = false;
          setActive(false);
          onStatus("idle");
        }
        return;
      }

      const chunks = splitSpeechText(text);
      window.speechSynthesis.cancel();
      for (const chunk of chunks) {
        await new Promise<void>((resolve) => {
          const wantsChinese = /[\u4e00-\u9fff]/.test(chunk);
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = wantsChinese ? "zh-CN" : "en-US";
          utterance.voice = selectNaturalVoice(chunk);
          utterance.rate = wantsChinese ? 0.82 : 0.86;
          utterance.pitch = wantsChinese ? 0.88 : 0.92;
          utterance.volume = 0.74;
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          utteranceRef.current = utterance;
          window.speechSynthesis.speak(utterance);
        });

        if (chunks.length > 1) await wait(130);
      }

      speakingRef.current = false;
      const listening = shouldListenRef.current && startRecognitionRef.current();
      if (listening) {
        onStatus("listening");
      } else {
        shouldListenRef.current = false;
        activeRef.current = false;
        setActive(false);
        onStatus("idle");
      }
    },
    [addLog, onStatus, stopRecognition]
  );

  const start = useCallback(async () => {
    recognitionBlockedRef.current = false;
    const micReady = await ensureMicStream();
    setActive(true);
    activeRef.current = true;
    shouldListenRef.current = micReady;
    onStatus(micReady ? "listening" : "idle");
    const recognitionStarted = micReady && startRecognitionRef.current();
    if (!recognitionStarted) {
      shouldListenRef.current = false;
      activeRef.current = false;
      setActive(false);
      if (!micReady) releaseMicStream();
      addLog({
        role: "system",
        text: micReady
          ? "当前环境没有可用的语音识别；文字指令和快捷动作仍然在线。"
          : "麦克风还没有准备好；文字指令和快捷动作仍然在线。"
      });
    }
    await speak("我在啦。你想打开网页、搜点东西、看时间，或者记个备忘，直接跟我说就行。");
  }, [addLog, ensureMicStream, onStatus, releaseMicStream, speak]);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    activeRef.current = false;
    speakingRef.current = false;
    stopRecognition();
    releaseMicStream();
    if (hasSpeechSynthesis()) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setActive(false);
    onStatus("idle");
  }, [onStatus, releaseMicStream, stopRecognition]);

  const submit = useCallback(
    async (raw: string) => {
      const text = normalize(raw);
      if (!text) return;

      if (!activeRef.current) {
        shouldListenRef.current = false;
      }

      addLog({ role: "user", text });
      onStatus("thinking");
      await wait(220);

      if (/jarvis|javis|贾维斯|星灵|醒醒|在吗|hello|hi/i.test(text)) {
        await speak("我在呢。你直接说，我来帮你处理。");
        return;
      }

      if (/name|名字|你是谁|who are you/i.test(text)) {
        await speak("叫我星灵就好。我先帮你处理桌面上的小事，接上实时语音后，也能陪你聊更复杂的问题。");
        return;
      }

      if (/help|capabilities|能力|能做什么|帮助/i.test(text)) {
        await speak("可以呀。我能听你说话，也能收文字；开网页、启动应用、搜索、看时间、记备忘、写日程都行。");
        return;
      }

      if (/你记住了什么|记忆列表|列出记忆|备忘列表|memory list|what do you remember/i.test(text)) {
        const items = memoryRef.current;
        if (!items.length) {
          await speak("我现在还没记任何事。");
          return;
        }
        await speak(`我记得这几件：${items.map((item, index) => `${index + 1}，${item.text}`).join("；")}。`);
        return;
      }

      if (/清空记忆|清除记忆|忘掉全部|forget everything|clear memory/i.test(text)) {
        saveMemory([]);
        await speak("好，我已经把这些本地备忘清掉了。");
        return;
      }

      if (/记住|帮我记住|请记住|remember|note that|note/i.test(text)) {
        const memoryText = parseMemoryText(text);
        if (!memoryText) {
          await speak("可以，你把要记的内容说完整一点，我来存。");
          return;
        }
        const item = { id: crypto.randomUUID(), text: memoryText, at: new Date().toISOString() };
        saveMemory([...memoryRef.current, item]);
        await speak(`好，我记住了：${memoryText}。`);
        return;
      }

      if (/today|date|time|day|现在|今天|日期|时间|星期|几点/i.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("get_current_date", {});
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        const result = tool.result as { zhCN?: string } | undefined;
        await speak(tool.ok ? `现在是${result?.zhCN ?? "本地时间读到了，不过格式有点怪"}。` : toolSummary(tool, ""));
        return;
      }

      const directUrl = extractDirectUrl(text);
      if (directUrl && /open|打开|进入|访问|launch|go to/i.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_url", { url: directUrl });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(toolSummary(tool, "好，网页给你打开了。"));
        return;
      }

      const shortcut = shortcuts.find((item) => item.pattern.test(text));
      if (shortcut && /open|打开|进入|访问|看一下|launch/i.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_url", { shortcut: shortcut.shortcut });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(toolSummary(tool, `好，${shortcut.label} 打开了。`));
        return;
      }

      const app = apps.find((item) => item.pattern.test(text));
      if (app && /open|打开|launch|启动/i.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_app", { app: app.app });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(toolSummary(tool, `好，${app.label} 开了。`));
        return;
      }

      const filePath = extractFilePath(text);
      if (filePath && /open|打开|进入|访问|启动|launch/i.test(text)) {
        onStatus("executing_tool");
        const tool = await executeTool("open_file", { path: filePath });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(toolSummary(tool, "好，我把这个位置打开了。"));
        return;
      }

      if (/search|look up|google|bing|搜索|查询|查一下|查一查/i.test(text)) {
        const query = stripCommandWords(text) || text;
        onStatus("executing_tool");
        const tool = await executeTool("search_web", { query, engine: "bing" });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(toolSummary(tool, `我帮你搜「${query}」了，结果页已经打开。`));
        return;
      }

      if (/calendar|schedule|meeting|reminder|日程|提醒|会议/i.test(text)) {
        onStatus("executing_tool");
        const title = stripCommandWords(text) || "Jarvis task";
        const tool = await executeTool("create_calendar_event", {
          title,
          notes: "由星灵桌面智能创建。"
        });
        addLog({ role: "tool", text: JSON.stringify(tool.result ?? tool.error) });
        await speak(toolSummary(tool, "日程草稿我打开了，你确认时间后保存就行。"));
        return;
      }

      if (/thanks|thank you|谢谢|感谢/i.test(text)) {
        await speak("不客气，我在。");
        return;
      }

      if (aiConfigured) {
        const userMessage: ChatMessage = { role: "user", content: text };
        const nextHistory: ChatMessage[] = [...chatHistoryRef.current, userMessage].slice(-12);
        onStatus("thinking");
        const chat = await executeChat(
          nextHistory,
          memoryRef.current.map((item) => item.text)
        );
        if (chat.ok && chat.text) {
          const assistantMessage: ChatMessage = { role: "assistant", content: chat.text };
          chatHistoryRef.current = [...nextHistory, assistantMessage].slice(-12);
          await speak(chat.text);
          return;
        }
        await speak(`我刚刚没连上 DeepSeek：${chat.error ?? "原因不太明确"}。你可以再说一遍，或者先让我帮你打开工具。`);
        return;
      }

      await speak("嗯，我听到了。你可以先让我搜资料、开工具、记备忘；接上 DeepSeek 后，我们就能自然聊天了。");
    },
    [addLog, aiConfigured, onStatus, saveMemory, speak]
  );

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  return { active, start, stop, submit };
}
