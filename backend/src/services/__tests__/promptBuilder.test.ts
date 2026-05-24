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
