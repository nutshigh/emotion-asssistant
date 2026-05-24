import type { Request, Response, NextFunction } from "express";

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || "unknown";
  const now = Date.now();
  let entry = requestCounts.get(ip);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    requestCounts.set(ip, entry);
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({ error: "请求太频繁了，请稍等一下。" });
    return;
  }
  next();
}
