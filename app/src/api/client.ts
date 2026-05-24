import { Platform } from "react-native";
import { EventSourcePolyfill } from "event-source-polyfill";
import type { ChatRequest, ChatSSEEvent, SummarizeRequest, SummarizeResponse } from "../types";

const DEV_URL = Platform.select({
  android: "http://10.0.2.2:3000/api",
  default: "http://localhost:3000/api",
});

export const BASE_URL = __DEV__ ? DEV_URL : "https://emotion-asssistant-production.up.railway.app/api";

export async function* streamChat(request: ChatRequest): AsyncGenerator<ChatSSEEvent> {
  const events: ChatSSEEvent[] = [];
  let nextResolve: ((r: IteratorResult<ChatSSEEvent>) => void) | null = null;
  let done = false;
  let error: string | null = null;

  const es = new EventSourcePolyfill(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    heartbeatTimeout: 60000,
  });

  es.onmessage = (e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data) as ChatSSEEvent;
      if (nextResolve) {
        nextResolve({ value: event, done: false });
        nextResolve = null;
      } else {
        events.push(event);
      }
      if (event.type === "done") {
        done = true;
        es.close();
      }
    } catch { /* skip */ }
  };

  es.onerror = () => {
    error = "连接中断";
    done = true;
    es.close();
  };

  while (true) {
    if (events.length > 0) {
      const event = events.shift()!;
      yield event;
      if (event.type === "done") break;
    } else if (done) {
      if (error) throw new Error(error);
      break;
    } else {
      await new Promise<IteratorResult<ChatSSEEvent>>((resolve) => {
        nextResolve = resolve;
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
