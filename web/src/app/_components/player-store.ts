"use client";

import { create } from "zustand";

export interface PlayerVideo {
  videoId: string;
  start: number;
  title: string;
  label: string;
}

interface PlayerState {
  video: PlayerVideo | null;
  play: (video: PlayerVideo) => void;
  close: () => void;
}

/** One YouTube player for the whole app: search hits and chat citations both jump into it. */
export const usePlayer = create<PlayerState>()((set) => ({
  video: null,
  play: (video) => set({ video }),
  close: () => set({ video: null }),
}));
