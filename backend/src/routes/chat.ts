import { Router, type Request, type Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { streamChat, summarizeConversation } from "../services/claudeService";
import type { ChatRequest, ChatSSEEvent, SummarizeRequest } from "../types";

const router = Router();
const LOG_FILE = path.join(__dirname, "..", "..", "llm-debug.log");

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

  // Disable Nagle's algorithm to prevent TCP from batching small packets
  const socket = (res as any).socket;
  if (socket) socket.setNoDelay(true);

  let tokenCount = 0;
  try {
    for await (const token of streamChat({ message, profile, conversation_summary, recent_messages })) {
      tokenCount++;
      const event: ChatSSEEvent = { type: "token", content: token };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      // Small delay every 2 tokens to prevent client buffer overflow
      if (tokenCount % 2 === 0) {
        await new Promise((r) => setTimeout(r, 20));
      }
      // Diagnostic: log every token sent to client
      const ts = new Date().toISOString();
      const line = `[${ts}] [chat.ts] SEND token #${tokenCount}: "${token}"\n`;
      try { fs.appendFileSync(LOG_FILE, line); } catch {}
    }
    const doneEvent: ChatSSEEvent = { type: "done", message_id: `msg_${Date.now()}` };
    res.write(`data: ${JSON.stringify(doneEvent)}\n\n`);
    // Log total tokens sent
    const ts2 = new Date().toISOString();
    const summary = `[${ts2}] [chat.ts] Total tokens sent: ${tokenCount}\n`;
    try { fs.appendFileSync(LOG_FILE, summary); } catch {}
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

// Debug endpoint: view last N lines of LLM logs
router.get("/debug/logs", (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      res.json({ error: "No logs yet" });
      return;
    }
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const last = lines.slice(-200);
    res.type("text/plain").send(last.join("\n"));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Debug endpoint: client reports what it received for comparison
router.post("/debug/client-log", (req: Request, res: Response) => {
  try {
    const { tokenCount, fullReply } = req.body;
    const ts = new Date().toISOString();
    const line = `[${ts}] [CLIENT REPORT] Tokens received: ${tokenCount}, fullReply (${fullReply?.length || 0} chars): "${fullReply}"\n`;
    fs.appendFileSync(LOG_FILE, line);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Clear logs
router.delete("/debug/logs", (_req: Request, res: Response) => {
  try {
    fs.writeFileSync(LOG_FILE, "");
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
