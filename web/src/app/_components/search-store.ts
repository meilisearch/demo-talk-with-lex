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
  setEpisode: (episodeId?: string) => void;
  setDistinct: (distinct: boolean) => void;
  clearFilters: () => void;
}

export const useSearch = create<SearchState>()((set) => ({
  q: "",
  semanticRatio: 0.3,
  page: 1,
  sort: "relevance",
  speaker: "all",
  guests: [],
  episodeId: undefined,
  distinct: false,
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
  // Opening one episode shows all its moments, so grouping by episode no longer makes sense.
  setEpisode: (episodeId) => set((s) => ({ episodeId, distinct: episodeId ? false : s.distinct, page: 1 })),
  setDistinct: (distinct) => set({ distinct, page: 1 }),
  clearFilters: () => set({ speaker: "all", guests: [], episodeId: undefined, page: 1 }),
}));
