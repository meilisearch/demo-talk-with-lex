"use client";

import { createContext, createElement, type ReactNode, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import type { SearchRequest, SortOption, SpeakerFilter } from "@/lib/types";

interface SearchState extends SearchRequest {
  setQ: (q: string) => void;
  setSort: (s: SortOption) => void;
  setPage: (p: number) => void;
  setSpeaker: (s: SpeakerFilter) => void;
  toggleGuest: (guest: string) => void;
  setEpisode: (episodeId?: string) => void;
  setDistinct: (distinct: boolean) => void;
  clearFilters: () => void;
}

const makeStore = (initial: SearchRequest) =>
  createStore<SearchState>()((set) => ({
    ...initial,
    setQ: (q) => set({ q, page: 1 }),
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

// One store per page render, seeded from the URL on the server so the first HTML already shows the shared search.
const SearchStoreContext = createContext<StoreApi<SearchState> | null>(null);

export function SearchStoreProvider({ initial, children }: { initial: SearchRequest; children: ReactNode }) {
  const [store] = useState(() => makeStore(initial));
  return createElement(SearchStoreContext.Provider, { value: store }, children);
}

export function useSearchStore(): StoreApi<SearchState> {
  const store = useContext(SearchStoreContext);
  if (!store) throw new Error("useSearch must be used inside <SearchStoreProvider>");
  return store;
}

export function useSearch(): SearchState;
export function useSearch<T>(selector: (s: SearchState) => T): T;
export function useSearch<T>(selector?: (s: SearchState) => T) {
  return useStore(useSearchStore(), selector ?? ((s) => s as T));
}
