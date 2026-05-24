import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./promptBuilder";
import type { ChatRequest, Message, SummarizeRequest, SummarizeResponse } from "../types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
});

const API_KEY = process.env.ANTHROPIC_API_KEY;
const BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const MODEL = process.env.MODEL || "claude-sonnet-4-6";

export async function* streamChat(request: ChatRequest): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(request.profile, request.conversation_summary);

  // DeepSeek expects content as array of text blocks
  const toContent = (text: string) => [{ type: "text" as const, text }];

  const messages = [
    ...request.recent_messages.map((m: Message) => ({
      role: m.role as "user" | "assistant",
      content: toContent(m.content),
    })),
    { role: "user" as const, content: toContent(request.message) },
  ];

  // Use raw fetch to DeepSeek's SSE endpoint instead of Anthropic SDK streaming
  // This avoids SDK parsing issues with DeepSeek's response format
  const res = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 384000,
      temperature: 0.7,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const event = JSON.parse(trimmed.slice(6));
        // Anthropic streaming format: event.delta.text contains the token
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          yield event.delta.text;
        }
      } catch { /* skip unparseable */ }
    }
  }

  // Flush remaining buffer
  if (buffer.trim().startsWith("data: ")) {
    try {
      const event = JSON.parse(buffer.trim().slice(6));
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        yield event.delta.text;
      }
    } catch { /* skip */ }
  }
}

export async function summarizeConversation(request: SummarizeRequest): Promise<SummarizeResponse> {
  const conversationText = request.messages
    .map((m: Message) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n");

  // Use Anthropic SDK for non-streaming (works fine)
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    temperature: 0.3,
    system: "你是一个用户画像分析器。根据对话内容，提取用户的新信息并更新画像。只返回 JSON，不要其他文字。",
    messages: [{
      role: "user",
      content: [{ type: "text", text: `分析以下对话，返回 JSON：\n{ "conversation_summary": "一句话摘要", "profile_updates": { 需要更新的画像字段 }, "new_facts": ["新发现的事实"] }\n\n当前画像：${JSON.stringify(request.profile)}\n\n对话：\n${conversationText}` }],
    }],
  } as any);

  const textBlock = msg.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
  if (!textBlock) {
    return { conversation_summary: "", profile_updates: {}, new_facts: [] };
  }
  try {
    return JSON.parse(textBlock.text);
  } catch {
    return { conversation_summary: textBlock.text.slice(0, 200), profile_updates: {}, new_facts: [] };
  }
}
