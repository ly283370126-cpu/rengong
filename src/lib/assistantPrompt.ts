export const assistantName = "星灵";

export function buildAssistantInstructions(now = new Date()): string {
  const date = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "full",
    timeStyle: "short"
  }).format(now);

  return [
    `你叫${assistantName}，是一个中文实时语音桌面助手。`,
    `当前中国时间是：${date}。回答今天日期时必须使用这个时间，不要凭记忆猜。`,
    "你的回复要短、自然、像真人语音对话，优先一句话解决问题。",
    "用户说“星灵”是在唤醒你；唤醒后简短回应，等待下一句。",
    "用户让你打开网页、本机应用、文件、搜索网页或创建日程时，优先调用工具，不要假装已经执行。",
    "如果工具失败，直接说明失败原因，并给出最短的下一步建议。",
    "你不能执行没有白名单的应用，也不能构造任意 shell 命令。"
  ].join("\n");
}

export const realtimeTools = [
  {
    type: "function",
    name: "get_current_date",
    description: "获取当前中国日期和时间。用户问今天、现在、星期几时调用。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  },
  {
    type: "function",
    name: "open_url",
    description: "打开一个安全的 http/https 网页。可以传入 url，也可以传入 shortcut，例如 baidu、bilibili、douyin、github。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        url: {
          type: "string",
          description: "完整 http/https URL。"
        },
        shortcut: {
          type: "string",
          description: "预设快捷方式名称，例如 baidu、bilibili、douyin、github。"
        }
      }
    }
  },
  {
    type: "function",
    name: "open_app",
    description: "打开白名单本机应用。支持 calculator、notepad、paint、chrome、edge、wechat。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        app: {
          type: "string",
          description: "应用白名单名称：calculator、notepad、paint。"
        }
      },
      required: ["app"]
    }
  },
  {
    type: "function",
    name: "open_file",
    description: "打开一个用户明确提供的本机文件或目录绝对路径。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description: "Windows 绝对路径，例如 C:\\Users\\name\\Desktop。"
        }
      },
      required: ["path"]
    }
  },
  {
    type: "function",
    name: "search_web",
    description: "用浏览器搜索网页。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description: "搜索关键词。"
        },
        engine: {
          type: "string",
          enum: ["baidu", "bing", "google"],
          description: "搜索引擎，默认 bing。"
        }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "create_calendar_event",
    description: "打开日程创建页面，预填标题和备注。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: {
          type: "string",
          description: "日程标题。"
        },
        date: {
          type: "string",
          description: "用户说出的日期或时间。"
        },
        notes: {
          type: "string",
          description: "备注。"
        }
      },
      required: ["title"]
    }
  }
];

export function buildRealtimeSessionConfig(model = "gpt-realtime", voice = "marin") {
  return {
    type: "realtime",
    model,
    audio: {
      input: {
        turn_detection: {
          type: "semantic_vad",
          eagerness: "medium",
          create_response: true,
          interrupt_response: true
        }
      },
      output: {
        voice
      }
    },
    instructions: buildAssistantInstructions(),
    tools: realtimeTools,
    tool_choice: "auto"
  };
}
