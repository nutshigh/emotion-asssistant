import { Platform } from "react-native";
import type { ChatRequest, ChatSSEEvent, SummarizeRequest, SummarizeResponse } from "../types";

const DEV_URL = Platform.select({
  android: "http://10.0.2.2:3000/api",
  default: "http://localhost:3000/api",
});

const BASE_URL = __DEV__ ? DEV_URL : "https://emotion-asssistant-production.up.railway.app/api";

export function streamChat(request: ChatRequest): AsyncGenerator<ChatSSEEvent> {
  let lastIndex = 0;
  let buffer = "";
  let done = false;
  const events: ChatSSEEvent[] = [];
  let nextResolve: ((r: IteratorResult<ChatSSEEvent>) => void) | null = null;

  function processChunk(text: string) {
    // Normalize line endings: \r\n → \n, then split
    buffer += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as ChatSSEEvent;
        if (nextResolve) {
          nextResolve({ value: event, done: false });
          nextResolve = null;
        } else {
          events.push(event);
        }
        if (event.type === "done") {
          done = true;
        }
      } catch { /* skip */ }
    }
  }

  function finalize() {
    done = true;
    if (nextResolve) {
      nextResolve({ value: undefined as any, done: true });
      nextResolve = null;
    }
  }

  async function* generator(): AsyncGenerator<ChatSSEEvent> {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/chat`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "text/event-stream");

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 || xhr.readyState === 4) {
        const text = xhr.responseText || "";
        if (text.length > lastIndex) {
          processChunk(text.slice(lastIndex));
          lastIndex = text.length;
        }
        if (xhr.readyState === 4) finalize();
      }
    };

    // Fallback: some platforms only fire readyState 4 without 3
    xhr.onload = () => {
      const text = xhr.responseText || "";
      if (text.length > lastIndex) {
        processChunk(text.slice(lastIndex));
        lastIndex = text.length;
      }
      finalize();
    };

    xhr.onerror = () => {
      finalize();
    };

    xhr.send(JSON.stringify(request));

    while (true) {
      if (events.length > 0) {
        const event = events.shift()!;
        yield event;
        if (event.type === "done") break;
      } else if (done) {
        break;
      } else {
        await new Promise<IteratorResult<ChatSSEEvent>>((resolve) => {
          nextResolve = resolve;
        });
      }
    }
  }

  return generator();
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
