"use client";

import { create } from "zustand";
import type { SearchRequest, SortOption, SpeakerFilter } from "@/lib/types";

interface SearchState extends SearchRequest {
  setQ: (q: string) => void;
  setSemanticRatio: (r: number) => void;
  setSort: (s: SortOption) => void;
  setPage: (p: number) => void;
  setSpeaker: (s: SpeakerFilter) => void;
  toggleGuest: (guest: string) => void;
  clearFilters: () => void;
}

export const useSearch = create<SearchState>()((set) => ({
  q: "",
  semanticRatio: 0.3,
  page: 1,
  sort: "relevance",
  speaker: "all",
  guests: [],
  setQ: (q) => set({ q, page: 1 }),
  setSemanticRatio: (semanticRatio) => set({ semanticRatio, page: 1 }),
  setSort: (sort) => set({ sort, page: 1 }),
  setPage: (page) => set({ page }),
  setSpeaker: (speaker) => set({ speaker, page: 1 }),
  toggleGuest: (guest) =>
    set((s) => ({
      guests: s.guests.includes(guest) ? s.guests.filter((g) => g !== guest) : [...s.guests, guest],
      page: 1,
    })),
  clearFilters: () => set({ speaker: "all", guests: [], page: 1 }),
}));
