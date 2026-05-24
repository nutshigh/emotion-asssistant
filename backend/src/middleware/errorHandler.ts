import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error("[Error]", err.message);
  res.status(500).json({ error: "抱歉，我这边出了点问题，请稍后再试。" });
}
