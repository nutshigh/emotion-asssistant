import { Router, type Request, type Response } from "express";
import { streamChat, summarizeConversation } from "../services/claudeService";
import type { ChatRequest, ChatSSEEvent, SummarizeRequest } from "../types";

const router = Router();

router.post("/chat", async (req: Request, res: Response) => {
  const { message, profile, conversation_summary, recent_messages } = req.body as ChatRequest;

  if (!message?.trim()) {
    res.status(400).json({ error: "消息不能为空" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    for await (const token of streamChat({ message, profile, conversation_summary, recent_messages })) {
      const event: ChatSSEEvent = { type: "token", content: token };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    const doneEvent: ChatSSEEvent = { type: "done", message_id: `msg_${Date.now()}` };
    res.write(`data: ${JSON.stringify(doneEvent)}\n\n`);
    res.end();
  } catch (err) {
    console.error("[Chat Error]", err);
    res.write(`data: ${JSON.stringify({ type: "done", error: "抱歉，我走神了..." })}\n\n`);
    res.end();
  }
});

router.post("/chat/summarize", async (req: Request, res: Response) => {
  const { messages, profile } = req.body as SummarizeRequest;

  if (!messages?.length) {
    res.status(400).json({ error: "对话记录不能为空" });
    return;
  }

  try {
    const result = await summarizeConversation({ messages, profile });
    res.json(result);
  } catch (err) {
    console.error("[Summarize Error]", err);
    res.status(500).json({ error: "分析失败" });
  }
});

export default router;
