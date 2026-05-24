import type { UserProfile } from "../../../shared/types";

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
  return merged;
}
