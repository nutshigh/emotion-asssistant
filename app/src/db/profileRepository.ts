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
