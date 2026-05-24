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
    const updates = { emotional_patterns: { common_moods: ["焦虑"], stress_triggers: [], coping_methods: [], best_response_style: "" } };
    const merged = mergeProfileUpdates(profile, updates);
    expect(merged.emotional_patterns.common_moods).toContain("焦虑");
  });

  it("does not mutate the original profile", () => {
    const profile: UserProfile = { ...DEFAULT_PROFILE };
    const updates = { life_context: { occupation: "设计师", routine: "", important_relationships: [], ongoing_challenges: [] } };
    const merged = mergeProfileUpdates(profile, updates);
    expect(merged.life_context.occupation).toBe("设计师");
    expect(profile.life_context.occupation).toBe("");
  });
});
