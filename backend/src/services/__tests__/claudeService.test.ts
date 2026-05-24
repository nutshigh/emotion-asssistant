import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      stream: vi.fn(),
      create: vi.fn().mockResolvedValue({
        content: [{ text: '{"conversation_summary":"test","profile_updates":{},"new_facts":[]}' }],
      }),
    },
  })),
}));

import { streamChat, summarizeConversation } from "../claudeService";
import type { ChatRequest, SummarizeRequest } from "../../types";

describe("streamChat", () => {
  it("returns an async iterable for SSE streaming", () => {
    const request: ChatRequest = {
      message: "今天好累",
      profile: {} as any,
      conversation_summary: "",
      recent_messages: [],
    };
    const result = streamChat(request);
    expect(result).toBeDefined();
    expect(typeof result[Symbol.asyncIterator]).toBe("function");
  });
});

describe("summarizeConversation", () => {
  it("returns summary and profile updates", async () => {
    const request: SummarizeRequest = {
      messages: [{ id: "1", role: "user", content: "今天好累", timestamp: new Date().toISOString() }],
      profile: {} as any,
    };
    const result = await summarizeConversation(request);
    expect(result).toHaveProperty("conversation_summary");
    expect(result).toHaveProperty("profile_updates");
    expect(result).toHaveProperty("new_facts");
  });
});
