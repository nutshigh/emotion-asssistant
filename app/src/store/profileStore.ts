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
