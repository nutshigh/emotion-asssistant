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
  let hasError = false;
  let resolveNext: ((value: IteratorResult<ChatSSEEvent>) => void) | null = null;
  const pending: ChatSSEEvent[] = [];

  function flushPending() {
    while (resolveNext && pending.length > 0) {
      const event = pending.shift()!;
      resolveNext({ value: event, done: false });
      resolveNext = null;
    }
    if (done && resolveNext) {
      resolveNext({ value: undefined as any, done: true });
      resolveNext = null;
    }
  }

  function parseNewData(newData: string) {
    buffer += newData;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const event = JSON.parse(trimmed.slice(6)) as ChatSSEEvent;
        pending.push(event);
        if (event.type === "done") {
          done = true;
        }
      } catch {
        // skip unparseable lines
      }
    }
    flushPending();
  }

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${BASE_URL}/chat`);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Accept", "text/event-stream");

  xhr.onreadystatechange = () => {
    try {
      if (xhr.readyState === 3 || xhr.readyState === 4) {
        const currentText = xhr.responseText || "";
        if (currentText.length > lastIndex) {
          const newData = currentText.slice(lastIndex);
          lastIndex = currentText.length;
          parseNewData(newData);
        }
        if (xhr.readyState === 4) {
          done = true;
          flushPending();
        }
      }
    } catch {
      // ignore read errors
    }
  };

  xhr.onerror = () => {
    hasError = true;
    done = true;
    pending.push({ type: "done" });
    flushPending();
  };

  xhr.ontimeout = () => {
    hasError = true;
    done = true;
    pending.push({ type: "done" });
    flushPending();
  };

  xhr.timeout = 30000;
  xhr.send(JSON.stringify(request));

  return {
    [Symbol.asyncIterator](): AsyncIterator<ChatSSEEvent> {
      return {
        async next(): Promise<IteratorResult<ChatSSEEvent>> {
          if (pending.length > 0) {
            const event = pending.shift()!;
            return { value: event, done: false };
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
