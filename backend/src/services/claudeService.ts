import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { buildSystemPrompt } from "./promptBuilder";
import type { ChatRequest, Message, SummarizeRequest, SummarizeResponse } from "../types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
});

const API_KEY = process.env.ANTHROPIC_API_KEY;
const BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const MODEL = process.env.MODEL || "claude-sonnet-4-6";

const LOG_FILE = path.join(__dirname, "..", "..", "llm-debug.log");

function log(msg: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  console.log(line.trim());
}

export async function* streamChat(request: ChatRequest): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(request.profile, request.conversation_summary);

  const toContent = (text: string) => [{ type: "text" as const, text }];

  const messages = [
    ...request.recent_messages.map((m: Message) => ({
      role: m.role as "user" | "assistant",
      content: toContent(m.content),
    })),
    { role: "user" as const, content: toContent(request.message) },
  ];

  const body = {
    model: MODEL,
    max_tokens: 384000,
    temperature: 0.7,
    stream: true,
    system: systemPrompt,
    messages,
  };

  log(`=== NEW CHAT REQUEST ===`);
  log(`Model: ${MODEL}, Messages: ${messages.length}, SystemPrompt: ${systemPrompt.length} chars`);
  log(`Last user message: "${request.message.slice(0, 100)}"`);

  const res = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    log(`API ERROR ${res.status}: ${errText}`);
    throw new Error(`API error ${res.status}: ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullResponse = "";
  let eventCount = 0;
  let textTokenCount = 0;
  let otherEventCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;

      eventCount++;
      try {
        const event = JSON.parse(trimmed.slice(6));

        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const token = event.delta.text;
          fullResponse += token;
          textTokenCount++;
          yield token;
        } else {
          otherEventCount++;
          // Log non-text events to understand DeepSeek's event structure
          if (otherEventCount <= 5) {
            log(`Non-text event #${otherEventCount}: type=${event.type}, delta_type=${event.delta?.type || "none"}`);
          }
        }
      } catch {
        log(`PARSE ERROR for line: "${trimmed.slice(0, 200)}"`);
      }
    }
  }

  // Flush remaining buffer
  if (buffer.trim().startsWith("data: ")) {
    try {
      const event = JSON.parse(buffer.trim().slice(6));
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        fullResponse += event.delta.text;
        textTokenCount++;
        yield event.delta.text;
      }
    } catch { /* skip */ }
  }

  log(`=== CHAT COMPLETE ===`);
  log(`Total SSE events: ${eventCount}, Text tokens: ${textTokenCount}, Other events: ${otherEventCount}`);
  log(`Full response (${fullResponse.length} chars): "${fullResponse.slice(0, 500)}"`);
  log(`Response end: "${fullResponse.slice(-200)}"`);
  log(`=== END ===\n`);
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
