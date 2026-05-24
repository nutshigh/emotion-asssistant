import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./promptBuilder";
import type { ChatRequest, Message, SummarizeRequest, SummarizeResponse } from "../types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
});

const MODEL = process.env.MODEL || "claude-sonnet-4-6";

export async function* streamChat(request: ChatRequest): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(request.profile, request.conversation_summary);

  const messages: Anthropic.MessageParam[] = [
    ...request.recent_messages.map((m: Message) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: request.message },
  ];

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    temperature: 0.7,
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

export async function summarizeConversation(request: SummarizeRequest): Promise<SummarizeResponse> {
  const conversationText = request.messages
    .map((m: Message) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n");

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    temperature: 0.3,
    system: "你是一个用户画像分析器。根据对话内容，提取用户的新信息并更新画像。只返回 JSON，不要其他文字。",
    messages: [{
      role: "user",
      content: `分析以下对话，返回 JSON：\n{ "conversation_summary": "一句话摘要", "profile_updates": { 需要更新的画像字段 }, "new_facts": ["新发现的事实"] }\n\n当前画像：${JSON.stringify(request.profile)}\n\n对话：\n${conversationText}`,
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
