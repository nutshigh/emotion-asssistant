import { Platform } from "react-native";
import type { ChatRequest, ChatSSEEvent, SummarizeRequest, SummarizeResponse } from "../types";

const DEV_URL = Platform.select({
  android: "http://10.0.2.2:3000/api",
  default: "http://localhost:3000/api",
});

export const BASE_URL = __DEV__ ? DEV_URL : "https://emotion-asssistant-production.up.railway.app/api";

export async function* streamChat(request: ChatRequest): AsyncGenerator<ChatSSEEvent> {
  let lastIndex = 0;
  let buffer = "";
  const events: ChatSSEEvent[] = [];
  let resolveNext: ((r: IteratorResult<ChatSSEEvent>) => void) | null = null;
  let finished = false;
  let errorMsg: string | null = null;

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${BASE_URL}/chat`);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.timeout = 60000;

  xhr.onreadystatechange = () => {
    if (xhr.readyState === 3 || xhr.readyState === 4) {
      const text = xhr.responseText || "";
      if (text.length > lastIndex) {
        const newData = text.slice(lastIndex);
        lastIndex = text.length;
        // normalize line endings
        buffer += newData.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as ChatSSEEvent;
            if (resolveNext) {
              resolveNext({ value: event, done: false });
              resolveNext = null;
            } else {
              events.push(event);
            }
            if (event.type === "done") finished = true;
          } catch { /* skip */ }
        }
      }
      if (xhr.readyState === 4) {
        // Flush remaining buffer — last line(s) might still be incomplete
        if (buffer.trim()) {
          const line = buffer.trim();
          buffer = "";
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6)) as ChatSSEEvent;
              if (resolveNext) {
                resolveNext({ value: event, done: false });
                resolveNext = null;
              } else {
                events.push(event);
              }
              if (event.type === "done") finished = true;
            } catch { /* skip */ }
          }
        }
        finished = true;
      }
      // Wake pending iterator
      if (finished && resolveNext) {
        resolveNext({ value: undefined as any, done: true });
        resolveNext = null;
      }
    }
  };

  xhr.onerror = () => {
    errorMsg = "网络连接失败，请检查网络后重试";
    finished = true;
  };

  xhr.ontimeout = () => {
    errorMsg = "请求超时，请稍后重试";
    finished = true;
  };

  xhr.send(JSON.stringify(request));

  while (true) {
    if (events.length > 0) {
      const event = events.shift()!;
      yield event;
      if (event.type === "done") break;
    } else if (finished) {
      if (errorMsg) throw new Error(errorMsg);
      break;
    } else {
      await new Promise<IteratorResult<ChatSSEEvent>>((resolve) => {
        resolveNext = resolve;
      });
    }
  }
}

export async function summarizeConversation(request: SummarizeRequest): Promise<SummarizeResponse> {
  const response = await fetch(`${BASE_URL}/chat/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("分析请求失败");
  }

  return response.json() as Promise<SummarizeResponse>;
}
