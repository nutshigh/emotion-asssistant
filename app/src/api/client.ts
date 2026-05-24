import type { ChatRequest, ChatSSEEvent, SummarizeRequest, SummarizeResponse } from "../types";

const BASE_URL = "http://10.0.2.2:3000/api"; // Android emulator → host localhost

export async function* streamChat(request: ChatRequest): AsyncGenerator<ChatSSEEvent> {
  const response = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "请求失败" }));
    throw new Error(err.error || "请求失败");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const json = line.slice(6);
        try {
          yield JSON.parse(json) as ChatSSEEvent;
        } catch { /* skip malformed lines */ }
      }
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
