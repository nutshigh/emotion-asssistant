import { Platform } from "react-native";
import type { ChatRequest, ChatSSEEvent, SummarizeRequest, SummarizeResponse } from "../types";

const DEV_URL = Platform.select({
  android: "http://10.0.2.2:3000/api",
  default: "http://localhost:3000/api",
});

const BASE_URL = __DEV__ ? DEV_URL : "https://emotion-asssistant-production.up.railway.app/api";

export function streamChat(request: ChatRequest): {
  [Symbol.asyncIterator](): AsyncIterator<ChatSSEEvent>;
} {
  let lastIndex = 0;
  let buffer = "";
  let done = false;
  let resolveNext: ((value: IteratorResult<ChatSSEEvent>) => void) | null = null;
  const pending: ChatSSEEvent[] = [];

  function parseEvents(): void {
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as ChatSSEEvent;
          if (resolveNext) {
            resolveNext({ value: event, done: false });
            resolveNext = null;
          } else {
            pending.push(event);
          }
          if (event.type === "done") {
            done = true;
          }
        } catch { /* skip malformed */ }
      }
    }
  }

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${BASE_URL}/chat`);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.send(JSON.stringify(request));

  xhr.onprogress = () => {
    const newData = xhr.responseText.slice(lastIndex);
    lastIndex = xhr.responseText.length;
    buffer += newData;
    parseEvents();
  };

  xhr.onerror = () => {
    done = true;
    const errorEvent: ChatSSEEvent = { type: "done" };
    if (resolveNext) {
      resolveNext({ value: errorEvent, done: false });
      resolveNext = null;
    }
    // Resolve any pending next() call
    if (resolveNext) {
      resolveNext({ value: errorEvent, done: false });
      resolveNext = null;
    }
  };

  xhr.onloadend = () => {
    done = true;
    // flush remaining
    const remaining = xhr.responseText.slice(lastIndex);
    if (remaining) {
      buffer += remaining;
      parseEvents();
    }
    if (resolveNext) {
      resolveNext({ value: undefined as any, done: true });
      resolveNext = null;
    }
  };

  return {
    [Symbol.asyncIterator](): AsyncIterator<ChatSSEEvent> {
      return {
        async next(): Promise<IteratorResult<ChatSSEEvent>> {
          if (pending.length > 0) {
            return { value: pending.shift()!, done: false };
          }
          if (done) {
            return { value: undefined as any, done: true };
          }
          return new Promise((resolve) => {
            resolveNext = resolve;
          });
        },
      };
    },
  };
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
