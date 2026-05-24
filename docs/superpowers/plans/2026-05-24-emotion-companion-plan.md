# 情感陪护助手 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Android emotional companion app with evolving personality — React Native frontend, Node.js backend, Claude API for conversation.

**Architecture:** Monorepo with three packages: `app/` (React Native/Expo), `backend/` (Express + TypeScript), `shared/` (common types). Backend is stateless — all user profile data lives in on-device SQLite. App sends profile + conversation context with each request; backend injects into System Prompt, calls Claude API, returns SSE stream.

**Tech Stack:** React Native (Expo), Zustand, SQLite, Express, TypeScript, Claude API (Anthropic SDK), SSE

---

## File Structure

```
emotion--assis/
├── shared/
│   └── types.ts                          # Shared types: Profile, Message, API contracts
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example                      # ANTHROPIC_API_KEY=
│   └── src/
│       ├── index.ts                      # Express app entry, middleware wiring
│       ├── routes/chat.ts                # POST /api/chat (SSE), POST /api/chat/summarize
│       ├── services/claudeService.ts     # Claude API wrapper, SSE streaming
│       ├── services/promptBuilder.ts     # System prompt assembly from profile
│       ├── services/profileAnalyzer.ts   # Extract profile updates from conversation
│       ├── middleware/errorHandler.ts     # Global error handler
│       └── middleware/rateLimiter.ts      # Per-IP rate limiting
├── app/
│   ├── package.json
│   ├── tsconfig.json
│   ├── app.json                          # Expo config
│   ├── App.tsx                           # Root with NavigationContainer
│   └── src/
│       ├── types/index.ts                # Re-exports from shared
│       ├── theme/colors.ts               # Warm color palette
│       ├── db/database.ts                # SQLite init + migrations
│       ├── db/chatRepository.ts          # Chat history CRUD
│       ├── db/profileRepository.ts       # Profile CRUD + merge
│       ├── api/client.ts                 # HTTP + SSE client
│       ├── store/chatStore.ts            # Zustand: messages, sending state
│       ├── store/profileStore.ts         # Zustand: profile, relationship days
│       ├── services/chatService.ts       # Orchestrates send → stream → save → summarize
│       ├── services/profileService.ts    # Profile merge logic, day counting
│       ├── screens/ChatScreen.tsx        # Main chat UI
│       ├── screens/ProfileScreen.tsx     # "我们之间" — days + count
│       ├── screens/SettingsScreen.tsx    # Preferences, clear, export
│       ├── components/ChatBubble.tsx     # Single message bubble
│       ├── components/ChatInput.tsx      # Text input + send button
│       └── components/Navigation.tsx     # Bottom tab navigator
```

---

### Task 1: Project Scaffolding — Shared Types

**Files:**
- Create: `shared/types.ts`
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.env.example`
- Create: `app/package.json`
- Create: `app/tsconfig.json`
- Create: `app/app.json`

- [ ] **Step 1: Create shared types**

```typescript
// shared/types.ts

// ---- User Profile ----
export interface UserProfile {
  version: number;
  last_updated: string; // ISO 8601
  first_interaction: string; // ISO 8601 — used to calculate relationship days
  total_conversations: number;
  communication_style: {
    formality: number;       // 0=casual, 1=formal
    verbosity: number;       // 0=concise, 1=detailed
    humor_level: number;
    emoji_usage: number;
    preferred_pronoun: string | null;
  };
  emotional_patterns: {
    common_moods: string[];
    stress_triggers: string[];
    coping_methods: string[];
    best_response_style: string;
  };
  interests_topics: Array<{ topic: string; confidence: number; frequency: string }>;
  life_context: {
    occupation: string;
    routine: string;
    important_relationships: string[];
    ongoing_challenges: string[];
  };
  interaction_preferences: {
    active_hours: string[];
    avg_session_minutes: number;
    response_length_preference: string;
  };
  relationship: {
    stage: "new" | "building" | "familiar" | "close";
    topics_to_avoid: string[];
    inside_jokes: string[];
    shared_context: string[];
  };
}

export const DEFAULT_PROFILE: UserProfile = {
  version: 1,
  last_updated: new Date().toISOString(),
  first_interaction: new Date().toISOString(),
  total_conversations: 0,
  communication_style: { formality: 0.5, verbosity: 0.5, humor_level: 0.5, emoji_usage: 0.5, preferred_pronoun: null },
  emotional_patterns: { common_moods: [], stress_triggers: [], coping_methods: [], best_response_style: "先共情再回应" },
  interests_topics: [],
  life_context: { occupation: "", routine: "", important_relationships: [], ongoing_challenges: [] },
  interaction_preferences: { active_hours: [], avg_session_minutes: 0, response_length_preference: "medium" },
  relationship: { stage: "new", topics_to_avoid: [], inside_jokes: [], shared_context: [] },
};

// ---- Message ----
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO 8601
}

// ---- API Contracts ----
export interface ChatRequest {
  message: string;
  profile: UserProfile;
  conversation_summary: string;
  recent_messages: Message[];
}

export interface ChatSSEEvent {
  type: "token" | "done";
  content?: string;
  message_id?: string;
}

export interface SummarizeRequest {
  messages: Message[];
  profile: UserProfile;
}

export interface SummarizeResponse {
  conversation_summary: string;
  profile_updates: Partial<UserProfile>;
  new_facts: string[];
}
```

- [ ] **Step 2: Create backend package.json**

```json
// backend/package.json
{
  "name": "emotion-companion-backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create backend tsconfig.json**

```json
// backend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "paths": { "@shared/*": ["../shared/*"] }
  },
  "include": ["src/**/*", "../shared/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create backend .env.example**

```
# backend/.env.example
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
```

- [ ] **Step 5: Create app package.json**

```json
// app/package.json
{
  "name": "emotion-companion-app",
  "version": "1.0.0",
  "private": true,
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "build:apk": "eas build -p android --profile preview",
    "test": "jest",
    "lint": "eslint ."
  },
  "dependencies": {
    "expo": "~52.0.0",
    "expo-file-system": "~18.0.0",
    "expo-sharing": "~13.0.0",
    "expo-sqlite": "~15.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.5",
    "@react-navigation/native": "^7.0.0",
    "@react-navigation/bottom-tabs": "^7.0.0",
    "react-native-screens": "~4.4.0",
    "react-native-safe-area-context": "~4.14.0",
    "zustand": "^5.0.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/react": "~18.3.0",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.6.0",
    "jest": "^29.7.0",
    "@testing-library/react-native": "^12.5.0",
    "jest-expo": "~52.0.0"
  }
}
```

- [ ] **Step 6: Create app tsconfig.json**

```json
// app/tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": { "@shared/*": ["../shared/*"], "@/*": ["src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", "../shared/**/*.ts"]
}
```

- [ ] **Step 7: Create app app.json**

```json
// app/app.json
{
  "expo": {
    "name": "SoulMate",
    "slug": "emotion-companion",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": { "backgroundColor": "#FFF8F0" },
    "android": { "package": "com.soulmate.app", "adaptiveIcon": { "backgroundColor": "#FFF8F0" } },
    "plugins": ["expo-sqlite"]
  }
}
```

- [ ] **Step 8: Create backend vitest config**

```typescript
// backend/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true } });
```

- [ ] **Step 9: Install dependencies**

Run:
```bash
cd F:/sillytavern/emotion--assis/backend && npm install
cd F:/sillytavern/emotion--assis/app && npm install
```

---

### Task 2: Backend — Prompt Builder

**Files:**
- Create: `backend/src/services/promptBuilder.ts`
- Create: `backend/src/services/__tests__/promptBuilder.test.ts`

- [ ] **Step 1: Write failing tests for prompt builder**

```typescript
// backend/src/services/__tests__/promptBuilder.test.ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../promptBuilder";
import { DEFAULT_PROFILE } from "../../../../shared/types";
import type { UserProfile } from "../../../../shared/types";

describe("buildSystemPrompt", () => {
  it("includes the base personality definition", () => {
    const prompt = buildSystemPrompt(DEFAULT_PROFILE, "");
    expect(prompt).toContain("SoulMate");
    expect(prompt).toContain("真诚共情");
  });

  it("includes profile information when provided", () => {
    const profile: UserProfile = {
      ...DEFAULT_PROFILE,
      life_context: { ...DEFAULT_PROFILE.life_context, occupation: "软件工程师" },
    };
    const prompt = buildSystemPrompt(profile, "");
    expect(prompt).toContain("软件工程师");
  });

  it("includes conversation summary when provided", () => {
    const prompt = buildSystemPrompt(DEFAULT_PROFILE, "用户最近在准备面试");
    expect(prompt).toContain("用户最近在准备面试");
  });

  it("handles empty profile gracefully", () => {
    const prompt = buildSystemPrompt(DEFAULT_PROFILE, "");
    expect(prompt.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd F:/sillytavern/emotion--assis/backend && npx vitest run`
Expected: 4 failing tests

- [ ] **Step 3: Implement prompt builder**

```typescript
// backend/src/services/promptBuilder.ts
import type { UserProfile } from "../../../shared/types";

export function buildSystemPrompt(profile: UserProfile, conversationSummary: string): string {
  const parts: string[] = [];

  // Fixed base — cached
  parts.push(`你是 SoulMate，一个情感陪护助手。核心原则：
1. 真诚共情，不用模板化语言回复
2. 记住用户说过的重要事情，在合适的时候自然提起
3. 人格随交互进化，不刻意迎合用户
4. 安全边界：不鼓励自伤、不提供医疗诊断、不替代专业心理治疗
5. 用中文回复，语气自然温暖，像朋友聊天`);

  // Profile injection
  const profileLines: string[] = [];
  const ctx = profile.life_context;
  if (ctx.occupation) profileLines.push(`用户职业：${ctx.occupation}`);
  if (ctx.routine) profileLines.push(`日常节奏：${ctx.routine}`);
  if (ctx.important_relationships.length > 0) profileLines.push(`重要关系：${ctx.important_relationships.join("、")}`);
  if (ctx.ongoing_challenges.length > 0) profileLines.push(`当前挑战：${ctx.ongoing_challenges.join("、")}`);

  const comm = profile.communication_style;
  profileLines.push(`沟通偏好：${comm.formality < 0.4 ? "偏随意" : comm.formality > 0.6 ? "偏正式" : "自然"}，${comm.verbosity < 0.4 ? "回复简洁" : comm.verbosity > 0.6 ? "喜欢详细展开" : "适中的回复长度"}${comm.humor_level > 0.6 ? "，可以适当幽默" : ""}${comm.emoji_usage > 0.6 ? "，可以适当用 emoji" : ""}`);

  const emo = profile.emotional_patterns;
  if (emo.common_moods.length > 0) profileLines.push(`常见情绪：${emo.common_moods.join("、")}`);
  if (emo.best_response_style) profileLines.push(`最佳回应方式：${emo.best_response_style}`);

  if (profile.interests_topics.length > 0) {
    profileLines.push(`兴趣话题：${profile.interests_topics.map((t) => t.topic).join("、")}`);
  }

  const rel = profile.relationship;
  profileLines.push(`关系阶段：${rel.stage === "new" ? "刚认识" : rel.stage === "building" ? "熟悉中" : rel.stage === "familiar" ? "很熟悉了" : "亲密"}`);
  if (rel.topics_to_avoid.length > 0) profileLines.push(`回避话题：${rel.topics_to_avoid.join("、")}`);

  if (profileLines.length > 0) {
    parts.push(`\n【用户画像】\n${profileLines.join("\n")}`);
  }

  // Conversation context
  if (conversationSummary) {
    parts.push(`\n【近期对话】\n${conversationSummary}`);
  }

  return parts.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd F:/sillytavern/emotion--assis/backend && npx vitest run`
Expected: 4 passing

---

### Task 3: Backend — Claude Service

**Files:**
- Create: `backend/src/services/claudeService.ts`
- Create: `backend/src/services/__tests__/claudeService.test.ts`

- [ ] **Step 1: Write failing tests for Claude service**

```typescript
// backend/src/services/__tests__/claudeService.test.ts
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
import type { ChatRequest, SummarizeRequest } from "../../../../shared/types";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd F:/sillytavern/emotion--assis/backend && npx vitest run`
Expected: 2 failing tests (module not found)

- [ ] **Step 3: Implement Claude service**

```typescript
// backend/src/services/claudeService.ts
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./promptBuilder";
import type { ChatRequest, SummarizeRequest, SummarizeResponse } from "../../../shared/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function* streamChat(request: ChatRequest): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(request.profile, request.conversation_summary);

  const messages: Anthropic.MessageParam[] = [
    ...request.recent_messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: request.message },
  ];

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
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
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: "你是一个用户画像分析器。根据对话内容，提取用户的新信息并更新画像。只返回 JSON，不要其他文字。",
    messages: [{
      role: "user",
      content: `分析以下对话，返回 JSON：\n{ "conversation_summary": "一句话摘要", "profile_updates": { 需要更新的画像字段 }, "new_facts": ["新发现的事实"] }\n\n当前画像：${JSON.stringify(request.profile)}\n\n对话：\n${conversationText}`,
    }],
  });

  const text = (msg.content[0] as { text: string }).text;
  try {
    return JSON.parse(text);
  } catch {
    return { conversation_summary: text.slice(0, 200), profile_updates: {}, new_facts: [] };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd F:/sillytavern/emotion--assis/backend && npx vitest run`
Expected: 6 passing (4 promptBuilder + 2 claudeService)

---

### Task 4: Backend — Profile Analyzer

**Files:**
- Create: `backend/src/services/profileAnalyzer.ts`
- Create: `backend/src/services/__tests__/profileAnalyzer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/services/__tests__/profileAnalyzer.test.ts
import { describe, it, expect } from "vitest";
import { mergeProfileUpdates } from "../profileAnalyzer";
import { DEFAULT_PROFILE } from "../../../../shared/types";
import type { UserProfile } from "../../../../shared/types";

describe("mergeProfileUpdates", () => {
  it("merges new interests without duplicates", () => {
    const profile: UserProfile = {
      ...DEFAULT_PROFILE,
      interests_topics: [{ topic: "编程", confidence: 0.9, frequency: "high" }],
    };
    const updates = {
      interests_topics: [{ topic: "编程", confidence: 0.95, frequency: "high" }, { topic: "游戏", confidence: 0.7, frequency: "medium" }],
    };
    const merged = mergeProfileUpdates(profile, updates);
    expect(merged.interests_topics).toHaveLength(2);
  });

  it("appends new items to arrays", () => {
    const profile: UserProfile = { ...DEFAULT_PROFILE };
    const updates = { emotional_patterns: { common_moods: ["焦虑"] } };
    const merged = mergeProfileUpdates(profile, updates);
    expect(merged.emotional_patterns.common_moods).toContain("焦虑");
  });

  it("does not mutate the original profile", () => {
    const profile: UserProfile = { ...DEFAULT_PROFILE };
    const updates = { life_context: { occupation: "设计师" } };
    const merged = mergeProfileUpdates(profile, updates);
    expect(merged.life_context.occupation).toBe("设计师");
    expect(profile.life_context.occupation).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd F:/sillytavern/emotion--assis/backend && npx vitest run`
Expected: 3 failing tests (mergeProfileUpdates not found)

- [ ] **Step 3: Implement profile analyzer**

```typescript
// backend/src/services/profileAnalyzer.ts
import type { UserProfile } from "../../../shared/types";

export function mergeProfileUpdates(
  profile: UserProfile,
  updates: Partial<UserProfile>
): UserProfile {
  const merged = JSON.parse(JSON.stringify(profile)) as UserProfile;

  // Merge interests_topics — deduplicate by topic name
  if (updates.interests_topics) {
    const existing = new Map(merged.interests_topics.map((t) => [t.topic, t]));
    for (const t of updates.interests_topics) {
      existing.set(t.topic, t);
    }
    merged.interests_topics = Array.from(existing.values());
  }

  // Merge emotional_patterns — append arrays
  if (updates.emotional_patterns) {
    const ep = updates.emotional_patterns;
    if (ep.common_moods) {
      const set = new Set(merged.emotional_patterns.common_moods);
      ep.common_moods.forEach((m) => set.add(m));
      merged.emotional_patterns.common_moods = Array.from(set);
    }
    if (ep.stress_triggers) {
      const set = new Set(merged.emotional_patterns.stress_triggers);
      ep.stress_triggers.forEach((t) => set.add(t));
      merged.emotional_patterns.stress_triggers = Array.from(set);
    }
    if (ep.coping_methods) {
      const set = new Set(merged.emotional_patterns.coping_methods);
      ep.coping_methods.forEach((m) => set.add(m));
      merged.emotional_patterns.coping_methods = Array.from(set);
    }
    if (ep.best_response_style) merged.emotional_patterns.best_response_style = ep.best_response_style;
  }

  // Merge life_context — shallow merge
  if (updates.life_context) {
    Object.assign(merged.life_context, updates.life_context);
  }

  // Merge communication_style — update numbers
  if (updates.communication_style) {
    Object.assign(merged.communication_style, updates.communication_style);
  }

  // Merge relationship
  if (updates.relationship) {
    if (updates.relationship.stage) merged.relationship.stage = updates.relationship.stage;
    if (updates.relationship.topics_to_avoid) {
      const set = new Set(merged.relationship.topics_to_avoid);
      updates.relationship.topics_to_avoid.forEach((t) => set.add(t));
      merged.relationship.topics_to_avoid = Array.from(set);
    }
    if (updates.relationship.shared_context) {
      const set = new Set(merged.relationship.shared_context);
      updates.relationship.shared_context.forEach((c) => set.add(c));
      merged.relationship.shared_context = Array.from(set);
    }
  }

  merged.last_updated = new Date().toISOString();
  return merged;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd F:/sillytavern/emotion--assis/backend && npx vitest run`
Expected: 9 passing (4 promptBuilder + 2 claudeService + 3 profileAnalyzer)

---

### Task 5: Backend — Express App & Routes

**Files:**
- Create: `backend/src/index.ts`
- Create: `backend/src/routes/chat.ts`
- Create: `backend/src/middleware/errorHandler.ts`
- Create: `backend/src/middleware/rateLimiter.ts`

- [ ] **Step 1: Create error handler middleware**

```typescript
// backend/src/middleware/errorHandler.ts
import type { Request, Response, NextFunction } from "express";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error("[Error]", err.message);
  res.status(500).json({ error: "抱歉，我这边出了点问题，请稍后再试。" });
}
```

- [ ] **Step 2: Create rate limiter middleware**

```typescript
// backend/src/middleware/rateLimiter.ts
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
```

- [ ] **Step 3: Create chat routes**

```typescript
// backend/src/routes/chat.ts
import { Router, type Request, type Response } from "express";
import { streamChat, summarizeConversation } from "../services/claudeService";
import type { ChatRequest, ChatSSEEvent, SummarizeRequest } from "../../../shared/types";

const router = Router();

router.post("/chat", async (req: Request, res: Response) => {
  const { message, profile, conversation_summary, recent_messages } = req.body as ChatRequest;

  if (!message?.trim()) {
    res.status(400).json({ error: "消息不能为空" });
    return;
  }

  // SSE headers
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
```

- [ ] **Step 4: Create Express app entry**

```typescript
// backend/src/index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import chatRoutes from "./routes/chat";
import { errorHandler } from "./middleware/errorHandler";
import { rateLimiter } from "./middleware/rateLimiter";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(rateLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", chatRoutes);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

export default app;
```

- [ ] **Step 5: Verify backend starts**

Run: `cd F:/sillytavern/emotion--assis/backend && echo "ANTHROPIC_API_KEY=test" > .env && npx tsx src/index.ts &`
Wait 2 seconds, then: `curl http://localhost:3000/api/health`
Expected: `{"status":"ok"}`
Then kill the background process.

---

### Task 6: App — Theme & Types

**Files:**
- Create: `app/src/theme/colors.ts`
- Create: `app/src/types/index.ts`

- [ ] **Step 1: Create color theme**

```typescript
// app/src/theme/colors.ts
export const Colors = {
  // Backgrounds
  bg: "#FFFAF6",
  bgHeader: "#FFF8F0",
  bgBubbleOther: "#FFF0E5",
  bgBubbleSelf: "#FFD4B8",
  bgInput: "#FFF8F0",
  bgCard: "#FFF8F0",

  // Text
  text: "#4A3728",
  textSecondary: "#A08070",
  textMuted: "#C0A090",

  // Accent
  accent: "#E8A87C",
  accentLight: "#F5C9A0",
  accentDark: "#C88D6A",

  // Borders
  border: "#F0E0D0",
  borderLight: "#F0D8C0",

  // Misc
  white: "#FFFFFF",
  danger: "#D4956A",
};
```

- [ ] **Step 2: Create app types (re-export from shared)**

```typescript
// app/src/types/index.ts
export type {
  UserProfile,
  Message,
  ChatRequest,
  ChatSSEEvent,
  SummarizeRequest,
  SummarizeResponse,
} from "../../../shared/types";
export { DEFAULT_PROFILE } from "../../../shared/types";
```

---

### Task 7: App — SQLite Database Layer

**Files:**
- Create: `app/src/db/database.ts`
- Create: `app/src/db/chatRepository.ts`
- Create: `app/src/db/profileRepository.ts`

- [ ] **Step 1: Create database initialization**

```typescript
// app/src/db/database.ts
import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("soulmate.db");
  await initializeSchema(db);
  return db;
}

async function initializeSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profile (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversation_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
  `);
}
```

- [ ] **Step 2: Create chat repository**

```typescript
// app/src/db/chatRepository.ts
import { getDatabase } from "./database";
import type { Message } from "../types";

export async function saveMessage(message: Message): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO messages (id, role, content, timestamp) VALUES (?, ?, ?, ?)",
    [message.id, message.role, message.content, message.timestamp]
  );
}

export async function getRecentMessages(limit: number = 50): Promise<Message[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string; role: string; content: string; timestamp: string;
  }>("SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?", [limit]);
  return rows.reverse().map((r) => ({ ...r, role: r.role as "user" | "assistant" }));
}

export async function getConversationSummaries(limit: number = 5): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ summary: string }>(
    "SELECT summary FROM conversation_summaries ORDER BY created_at DESC LIMIT ?", [limit]
  );
  return rows.map((r) => r.summary);
}

export async function saveConversationSummary(summary: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO conversation_summaries (summary, created_at) VALUES (?, ?)",
    [summary, new Date().toISOString()]
  );
}

export async function cleanOldMessages(daysAgo: number = 30): Promise<void> {
  const db = await getDatabase();
  const cutoff = new Date(Date.now() - daysAgo * 86400000).toISOString();
  await db.runAsync("DELETE FROM messages WHERE timestamp < ?", [cutoff]);
}
```

- [ ] **Step 3: Create profile repository**

```typescript
// app/src/db/profileRepository.ts
import { getDatabase } from "./database";
import type { UserProfile } from "../types";
import { DEFAULT_PROFILE } from "../types";

export async function getProfile(): Promise<UserProfile> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM profile WHERE key = 'user_profile'"
  );
  if (!row) {
    await saveProfile(DEFAULT_PROFILE);
    return DEFAULT_PROFILE;
  }
  return JSON.parse(row.value) as UserProfile;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO profile (key, value) VALUES ('user_profile', ?)",
    [JSON.stringify(profile)]
  );
}

export async function clearProfile(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM profile WHERE key = 'user_profile'");
  const fresh = { ...DEFAULT_PROFILE, first_interaction: new Date().toISOString(), last_updated: new Date().toISOString() };
  await saveProfile(fresh);
}

export async function exportProfile(): Promise<string> {
  const profile = await getProfile();
  return JSON.stringify(profile, null, 2);
}
```

---

### Task 8: App — API Client

**Files:**
- Create: `app/src/api/client.ts`

- [ ] **Step 1: Create API client**

```typescript
// app/src/api/client.ts
import type { ChatRequest, ChatSSEEvent, SummarizeRequest, SummarizeResponse } from "../types";

const BASE_URL = "http://10.0.2.2:3000/api"; // Android emulator → host localhost
// For physical device testing, replace with your machine's LAN IP

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
```

---

### Task 9: App — Zustand Stores

**Files:**
- Create: `app/src/store/chatStore.ts`
- Create: `app/src/store/profileStore.ts`

- [ ] **Step 1: Create chat store**

```typescript
// app/src/store/chatStore.ts
import { create } from "zustand";
import type { Message } from "../types";

interface ChatState {
  messages: Message[];
  isSending: boolean;
  currentReply: string;
  error: string | null;

  addMessage: (msg: Message) => void;
  setSending: (sending: boolean) => void;
  appendToReply: (token: string) => void;
  clearReply: () => void;
  setError: (err: string | null) => void;
  loadMessages: (msgs: Message[]) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isSending: false,
  currentReply: "",
  error: null,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setSending: (sending) => set({ isSending: sending }),
  appendToReply: (token) => set((s) => ({ currentReply: s.currentReply + token })),
  clearReply: () => set({ currentReply: "" }),
  setError: (error) => set({ error }),
  loadMessages: (msgs) => set({ messages: msgs }),
}));
```

- [ ] **Step 2: Create profile store**

```typescript
// app/src/store/profileStore.ts
import { create } from "zustand";
import type { UserProfile } from "../types";
import { DEFAULT_PROFILE } from "../types";

interface ProfileState {
  profile: UserProfile;
  isLoading: boolean;
  relationshipDays: number;

  setProfile: (profile: UserProfile) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  setLoading: (loading: boolean) => void;
  calculateDays: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: DEFAULT_PROFILE,
  isLoading: true,
  relationshipDays: 0,

  setProfile: (profile) => {
    set({ profile, isLoading: false });
    get().calculateDays();
  },
  updateProfile: (updates) => {
    set((s) => ({ profile: { ...s.profile, ...updates, last_updated: new Date().toISOString() } }));
  },
  setLoading: (loading) => set({ isLoading: loading }),
  calculateDays: () => {
    const { profile } = get();
    const first = new Date(profile.first_interaction);
    const now = new Date();
    const days = Math.floor((now.getTime() - first.getTime()) / 86400000);
    set({ relationshipDays: days });
  },
}));
```

---

### Task 10: App — Services

**Files:**
- Create: `app/src/services/chatService.ts`
- Create: `app/src/services/profileService.ts`

- [ ] **Step 1: Create chat service**

```typescript
// app/src/services/chatService.ts
import { useChatStore } from "../store/chatStore";
import { useProfileStore } from "../store/profileStore";
import { saveMessage, getRecentMessages, saveConversationSummary } from "../db/chatRepository";
import { saveProfile } from "../db/profileRepository";
import { streamChat as apiStreamChat, summarizeConversation } from "../api/client";
import { mergeProfileUpdates } from "./profileService";
import type { Message } from "../types";

export async function sendMessage(content: string): Promise<void> {
  const store = useChatStore.getState();
  const profileStore = useProfileStore.getState();

  store.setError(null);
  store.setSending(true);

  // Create user message
  const userMsg: Message = {
    id: `u_${Date.now()}`,
    role: "user",
    content,
    timestamp: new Date().toISOString(),
  };

  store.addMessage(userMsg);
  await saveMessage(userMsg);

  // Get context
  const recentMessages = await getRecentMessages(30);
  const summaries = await (await import("../db/chatRepository")).getConversationSummaries(3);
  const summary = summaries.join("\n");

  store.clearReply();

  try {
    const stream = apiStreamChat({
      message: content,
      profile: profileStore.profile,
      conversation_summary: summary,
      recent_messages: recentMessages.slice(-20),
    });

    let fullReply = "";
    for await (const event of stream) {
      if (event.type === "token" && event.content) {
        fullReply += event.content;
        store.appendToReply(event.content);
      }
    }

    // Save assistant message
    const assistantMsg: Message = {
      id: `a_${Date.now()}`,
      role: "assistant",
      content: fullReply,
      timestamp: new Date().toISOString(),
    };
    store.addMessage(assistantMsg);
    await saveMessage(assistantMsg);
  } catch (err: any) {
    store.setError(err?.message || "发送失败，请检查网络后重试");
  } finally {
    store.setSending(false);
    store.clearReply();
  }
}

export async function triggerSummarize(): Promise<void> {
  const store = useChatStore.getState();
  const profileStore = useProfileStore.getState();

  if (store.messages.length < 10) return; // Not enough to summarize

  try {
    const result = await summarizeConversation({
      messages: store.messages.slice(-30),
      profile: profileStore.profile,
    });

    if (result.conversation_summary) {
      await saveConversationSummary(result.conversation_summary);
    }

    if (result.profile_updates) {
      const merged = mergeProfileUpdates(profileStore.profile, result.profile_updates);
      profileStore.setProfile(merged);
      await saveProfile(merged);
    }
  } catch {
    // Silent fail — summarize is non-critical
  }
}
```

- [ ] **Step 2: Create profile service**

```typescript
// app/src/services/profileService.ts
import type { UserProfile } from "../types";

export function mergeProfileUpdates(
  profile: UserProfile,
  updates: Partial<UserProfile>
): UserProfile {
  const merged = JSON.parse(JSON.stringify(profile)) as UserProfile;

  if (updates.interests_topics) {
    const existing = new Map(merged.interests_topics.map((t) => [t.topic, t]));
    for (const t of updates.interests_topics) {
      existing.set(t.topic, t);
    }
    merged.interests_topics = Array.from(existing.values());
  }

  if (updates.emotional_patterns) {
    const ep = updates.emotional_patterns;
    if (ep.common_moods) {
      const set = new Set(merged.emotional_patterns.common_moods);
      ep.common_moods.forEach((m) => set.add(m));
      merged.emotional_patterns.common_moods = Array.from(set);
    }
    if (ep.stress_triggers) {
      const set = new Set(merged.emotional_patterns.stress_triggers);
      ep.stress_triggers.forEach((t) => set.add(t));
      merged.emotional_patterns.stress_triggers = Array.from(set);
    }
    if (ep.coping_methods) {
      const set = new Set(merged.emotional_patterns.coping_methods);
      ep.coping_methods.forEach((m) => set.add(m));
      merged.emotional_patterns.coping_methods = Array.from(set);
    }
    if (ep.best_response_style) merged.emotional_patterns.best_response_style = ep.best_response_style;
  }

  if (updates.life_context) {
    Object.assign(merged.life_context, updates.life_context);
  }

  if (updates.communication_style) {
    Object.assign(merged.communication_style, updates.communication_style);
  }

  if (updates.relationship) {
    if (updates.relationship.stage) merged.relationship.stage = updates.relationship.stage;
    if (updates.relationship.topics_to_avoid) {
      const set = new Set(merged.relationship.topics_to_avoid);
      updates.relationship.topics_to_avoid.forEach((t) => set.add(t));
      merged.relationship.topics_to_avoid = Array.from(set);
    }
    if (updates.relationship.shared_context) {
      const set = new Set(merged.relationship.shared_context);
      updates.relationship.shared_context.forEach((c) => set.add(c));
      merged.relationship.shared_context = Array.from(set);
    }
  }

  merged.last_updated = new Date().toISOString();
  merged.total_conversations += 1;
  return merged;
}

export function calculateRelationshipDays(firstInteraction: string): number {
  const first = new Date(firstInteraction);
  return Math.floor((Date.now() - first.getTime()) / 86400000);
}
```

---

### Task 11: App — Chat UI Components

**Files:**
- Create: `app/src/components/ChatBubble.tsx`
- Create: `app/src/components/ChatInput.tsx`
- Create: `app/src/screens/ChatScreen.tsx`

- [ ] **Step 1: Create chat bubble component**

```typescript
// app/src/components/ChatBubble.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../theme/colors";
import type { Message } from "../types";

interface Props {
  message: Message;
}

export function ChatBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <View style={[styles.container, isUser ? styles.containerRight : styles.containerLeft]}>
      <View style={[styles.bubble, isUser ? styles.bubbleSelf : styles.bubbleOther]}>
        <Text style={styles.text}>{message.content}</Text>
        <Text style={styles.time}>
          {new Date(message.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 4 },
  containerLeft: { alignItems: "flex-start" },
  containerRight: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  bubbleOther: {
    backgroundColor: Colors.bgBubbleOther,
    borderBottomLeftRadius: 4,
  },
  bubbleSelf: {
    backgroundColor: Colors.bgBubbleSelf,
    borderBottomRightRadius: 4,
  },
  text: { fontSize: 15, color: Colors.text, lineHeight: 22 },
  time: { fontSize: 10, color: Colors.textMuted, marginTop: 4, textAlign: "right" },
});
```

- [ ] **Step 2: Create chat input component**

```typescript
// app/src/components/ChatInput.tsx
import React, { useState } from "react";
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from "react-native";
import { Colors } from "../theme/colors";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="说点什么..."
        placeholderTextColor={Colors.textMuted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSend}
        returnKeyType="send"
        editable={!disabled}
        multiline
        maxLength={2000}
      />
      <TouchableOpacity
        style={[styles.button, (!text.trim() || disabled) && styles.buttonDisabled]}
        onPress={handleSend}
        disabled={!text.trim() || disabled}
      >
        <Text style={styles.buttonText}>发送</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 10,
    backgroundColor: Colors.bgInput,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    maxHeight: 100,
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.accent,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: Colors.white, fontSize: 14, fontWeight: "600" },
});
```

- [ ] **Step 3: Create chat screen**

```typescript
// app/src/screens/ChatScreen.tsx
import React, { useEffect, useRef } from "react";
import { View, FlatList, Text, StyleSheet, ActivityIndicator } from "react-native";
import { ChatBubble } from "../components/ChatBubble";
import { ChatInput } from "../components/ChatInput";
import { useChatStore } from "../store/chatStore";
import { useProfileStore } from "../store/profileStore";
import { sendMessage, triggerSummarize } from "../services/chatService";
import { getRecentMessages } from "../db/chatRepository";
import { getProfile } from "../db/profileRepository";
import { Colors } from "../theme/colors";

export function ChatScreen() {
  const { messages, isSending, currentReply, error, loadMessages, setError } = useChatStore();
  const { setProfile } = useProfileStore();
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    (async () => {
      const [msgs, profile] = await Promise.all([getRecentMessages(50), getProfile()]);
      loadMessages(msgs);
      setProfile(profile);
    })();
  }, []);

  const handleSend = async (text: string) => {
    await sendMessage(text);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Trigger summarize when user leaves (no new messages for a while)
  // In production, use AppState listener; for now, a simple approach
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === "assistant" && !isSending) {
      const timer = setTimeout(() => triggerSummarize(), 5000);
      return () => clearTimeout(timer);
    }
  }, [messages.length, isSending]);

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss} onPress={() => setError(null)}>✕</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🌸</Text>
            <Text style={styles.emptyText}>嗨，我在</Text>
            <Text style={styles.emptySubtext}>想聊什么都可以</Text>
          </View>
        }
        ListFooterComponent={
          isSending && currentReply === "" ? (
            <ActivityIndicator color={Colors.accent} style={{ padding: 16 }} />
          ) : null
        }
      />

      <ChatInput onSend={handleSend} disabled={isSending} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  list: { paddingVertical: 8 },
  empty: { alignItems: "center", marginTop: 120 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 20, color: Colors.accentDark, fontWeight: "300" },
  emptySubtext: { fontSize: 14, color: Colors.textMuted, marginTop: 8 },
  errorBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF0E5",
    padding: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: { color: Colors.accentDark, fontSize: 13, flex: 1 },
  errorDismiss: { color: Colors.textMuted, fontSize: 16, paddingLeft: 12 },
});
```

---

### Task 12: App — Profile & Settings Screens

**Files:**
- Create: `app/src/screens/ProfileScreen.tsx`
- Create: `app/src/screens/SettingsScreen.tsx`

- [ ] **Step 1: Create profile screen ("我们之间")**

```typescript
// app/src/screens/ProfileScreen.tsx
import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useProfileStore } from "../store/profileStore";
import { getProfile } from "../db/profileRepository";
import { calculateRelationshipDays } from "../services/profileService";
import { Colors } from "../theme/colors";

export function ProfileScreen() {
  const { profile, relationshipDays, setProfile, calculateDays } = useProfileStore();

  useEffect(() => {
    (async () => {
      const p = await getProfile();
      setProfile(p);
    })();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🌸</Text>
        <Text style={styles.days}>{relationshipDays}</Text>
        <Text style={styles.daysLabel}>天</Text>
        <Text style={styles.subtext}>
          从第一天到现在{"\n"}陪你走过了{" "}
          <Text style={styles.highlight}>{profile.total_conversations}</Text> 次对话
        </Text>
        <Text style={styles.footer}>就这样慢慢了解你 ✨</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emoji: { fontSize: 48, marginBottom: 12 },
  days: { fontSize: 56, fontWeight: "300", color: Colors.accentDark },
  daysLabel: { fontSize: 16, color: Colors.textSecondary, marginBottom: 20 },
  subtext: { fontSize: 15, color: Colors.textSecondary, textAlign: "center", lineHeight: 24 },
  highlight: { color: Colors.accentDark, fontWeight: "600" },
  footer: { marginTop: 24, fontSize: 13, color: Colors.textMuted },
});
```

- [ ] **Step 2: Create settings screen**

```typescript
// app/src/screens/SettingsScreen.tsx
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Colors } from "../theme/colors";
import { clearProfile, exportProfile } from "../db/profileRepository";
import { useProfileStore } from "../store/profileStore";
import { DEFAULT_PROFILE } from "../types";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";

export function SettingsScreen() {
  const { setProfile } = useProfileStore();

  const handleClear = () => {
    Alert.alert("确认清除", "这将清除所有关于你的记忆数据，无法恢复。确定继续吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "清除",
        style: "destructive",
        onPress: async () => {
          await clearProfile();
          setProfile({ ...DEFAULT_PROFILE, first_interaction: new Date().toISOString(), last_updated: new Date().toISOString() });
        },
      },
    ]);
  };

  const handleExport = async () => {
    try {
      const json = await exportProfile();
      const path = `${FileSystem.cacheDirectory}soulmate_profile.json`;
      await FileSystem.writeAsStringAsync(path, json);
      await Sharing.shareAsync(path, { mimeType: "application/json" });
    } catch {
      Alert.alert("导出失败", "无法导出数据，请稍后重试。");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <TouchableOpacity style={styles.row} onPress={handleExport}>
          <Text style={styles.rowText}>导出我的数据</Text>
          <Text style={styles.rowArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.row} onPress={handleClear}>
          <Text style={[styles.rowText, styles.dangerText]}>清除所有记忆</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, padding: 16 },
  section: {
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  rowText: { fontSize: 15, color: Colors.text },
  rowArrow: { fontSize: 20, color: Colors.textMuted },
  dangerText: { color: Colors.danger },
});
```

---

### Task 13: App — Navigation & Root

**Files:**
- Create: `app/src/components/Navigation.tsx`
- Modify: `app/App.tsx`

- [ ] **Step 1: Create bottom tab navigation**

```typescript
// app/src/components/Navigation.tsx
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { Text } from "react-native";
import { ChatScreen } from "../screens/ChatScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { Colors } from "../theme/colors";

const Tab = createBottomTabNavigator();

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.5 }}>
      {emoji}
    </Text>
  );
}

export function Navigation() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: Colors.bgHeader, borderBottomColor: Colors.border, borderBottomWidth: 1 },
          headerTitleStyle: { color: Colors.text, fontWeight: "600" as const, fontSize: 16 },
          tabBarStyle: { backgroundColor: Colors.bgHeader, borderTopColor: Colors.border },
          tabBarActiveTintColor: Colors.accentDark,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: { fontSize: 11, marginTop: -4 },
        }}
      >
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            title: "SoulMate",
            tabBarLabel: "聊天",
            tabBarIcon: ({ focused }) => <TabIcon emoji="💬" label="聊天" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            title: "我们之间",
            tabBarLabel: "我们之间",
            tabBarIcon: ({ focused }) => <TabIcon emoji="🌸" label="我们之间" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: "设置",
            tabBarLabel: "设置",
            tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" label="设置" focused={focused} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

- [ ] **Step 2: Update App.tsx**

```typescript
// app/App.tsx
import React from "react";
import { StatusBar } from "expo-status-bar";
import { Navigation } from "./src/components/Navigation";

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <Navigation />
    </>
  );
}
```

---

### Task 14: Integration — Wire Everything & Test

- [ ] **Step 1: Verify backend compiles and runs**

Run:
```bash
cd F:/sillytavern/emotion--assis/backend && npx tsc --noEmit
```
Expected: No type errors.

Run:
```bash
cd F:/sillytavern/emotion--assis/backend && npx vitest run
```
Expected: All 9 tests pass.

- [ ] **Step 2: Verify app compiles**

Run:
```bash
cd F:/sillytavern/emotion--assis/app && npx tsc --noEmit
```
Expected: No type errors.

- [ ] **Step 3: Start backend and test health endpoint**

Run:
```bash
cd F:/sillytavern/emotion--assis/backend && npx tsx src/index.ts &
sleep 2
curl http://localhost:3000/api/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 4: Test /api/chat/ endpoint (requires real ANTHROPIC_API_KEY in .env)**

Run:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"你好","profile":{},"conversation_summary":"","recent_messages":[]}'
```
Expected: SSE stream with token events.

- [ ] **Step 5: Launch Expo dev server and verify app loads on emulator/device**

Run:
```bash
cd F:/sillytavern/emotion--assis/app && npx expo start
```
Open on Android emulator or scan QR with Expo Go. Verify all three tabs render.

- [ ] **Step 6: Build APK**

Run:
```bash
cd F:/sillytavern/emotion--assis/app && npx eas build -p android --profile preview
```
Expected: APK download URL from Expo.

---

### Task 15: Configure Backend URL for Production

**Files:**
- Modify: `app/src/api/client.ts`

- [ ] **Step 1: Make API base URL configurable**

```typescript
// In app/src/api/client.ts, replace the BASE_URL line with:
import { Platform } from "react-native";

const DEV_URL = Platform.select({
  android: "http://10.0.2.2:3000/api",
  default: "http://localhost:3000/api",
});

const BASE_URL = __DEV__ ? DEV_URL : "https://your-production-server.com/api";
// Replace with your actual production backend URL before building APK
```
