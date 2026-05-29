import { buildVoiceChatInstructions } from "../lib/assistantPrompt";
import { openaiFetch } from "./openaiClient";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type DeepSeekChatResult = {
  ok: boolean;
  text?: string;
  model?: string;
  error?: string;
};

type DeepSeekChoice = {
  message?: {
    content?: string | null;
  };
};

type DeepSeekResponse = {
  choices?: DeepSeekChoice[];
  error?: {
    message?: string;
  };
};

const deepseekBaseUrl = "https://api.deepseek.com";

export function deepseekModel() {
  return process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
}

export function deepseekConfigured() {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export async function createDeepSeekChat(
  messages: ChatMessage[],
  options: { memories?: string[] } = {}
): Promise<DeepSeekChatResult> {
  if (!process.env.DEEPSEEK_API_KEY) {
    return { ok: false, error: "DEEPSEEK_API_KEY 未配置。" };
  }

  const model = deepseekModel();
  const memoryPrompt = options.memories?.length
    ? `\n\n用户让我记住的本地备忘：\n${options.memories.map((item) => `- ${item}`).join("\n")}`
    : "";

  const response = await openaiFetch(`${deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `${buildVoiceChatInstructions()}${memoryPrompt}`
        },
        ...messages.slice(-12)
      ],
      thinking: { type: "disabled" },
      max_tokens: 420,
      temperature: 0.8,
      stream: false
    })
  });

  const payload = (await response.json().catch(() => null)) as DeepSeekResponse | null;
  if (!response.ok) {
    return {
      ok: false,
      model,
      error: payload?.error?.message ?? response.statusText
    };
  }

  const text = payload?.choices?.[0]?.message?.content?.trim();
  if (!text) return { ok: false, model, error: "DeepSeek 没有返回可读内容。" };

  return { ok: true, model, text };
}
