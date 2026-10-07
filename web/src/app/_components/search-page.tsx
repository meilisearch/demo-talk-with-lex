"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Layers, Loader2, Mic, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isExactPhrase,
  isQuestion,
  QUESTION_SEMANTIC_RATIO,
  SEMANTIC_RATIO,
  type SearchResponse,
  type SortOption,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { FiltersPanel } from "./filters-panel";
import { QuoteCard } from "./quote-card";
import { searchFromQueryString, searchToQueryString } from "./search-params";
import { useSearch, useSearchStore } from "./search-store";

export interface Status {
  chatEnabled: boolean;
  chatModel: string;
  chunkCount: number;
  episodeCount: number;
  semanticReady: boolean;
}

const SORTS: { value: SortOption; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

const EXAMPLES = [
  '"love is the answer"',
  "meaning of life",
  "fear of death",
  "is AGI going to kill us",
  "jiu jitsu teaches humility",
  "Dostoevsky", // typo-tolerant too: try "Dostoyevski"
];

/** The value once it has stopped changing for `ms`: one search per pause in typing, not one per keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** Mirrors the search in the URL: typing replaces the history entry, every other change adds one for Back. */
function useUrlSync() {
  const store = useSearchStore();
  useEffect(() => {
    const unsubscribe = store.subscribe((next, prev) => {
      const qs = searchToQueryString(next);
      if (qs === window.location.search) return;
      const typing = next.q !== prev.q && prev.q !== "";
      window.history[typing ? "replaceState" : "pushState"](null, "", qs || window.location.pathname);
    });
    const onPopState = () => store.setState(searchFromQueryString(window.location.search));
    window.addEventListener("popstate", onPopState);
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPopState);
    };
  }, [store]);
}

export function SearchPage() {
  const state = useSearch();
  useUrlSync();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const q = useDebounced(state.q, 250);
  const request = useDeferredValue({
    q,
    page: state.page,
    sort: state.sort,
    speaker: state.speaker,
    guests: state.guests,
    episodeId: state.episodeId,
    distinct: state.distinct,
  });

  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: async (): Promise<Status> => (await fetch("/api/status")).json(),
    refetchInterval: (query) => (query.state.data?.semanticReady ? false : 15_000),
  });
  const { data, isFetching, isError, error } = useQuery({
    queryKey: ["search", request],
    queryFn: async (): Promise<SearchResponse> => {
      const res = await fetch("/api/search", { method: "POST", body: JSON.stringify(request) });
      if (res.status === 503) throw new Error("loading");
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    placeholderData: keepPreviousData,
    // While the archive is loading, retry every 20 s so the page comes alive on its own.
    refetchInterval: (query) => (query.state.error ? 20_000 : false),
    retry: (count, error) => error.message !== "loading" && count < 2,
  });

  // Semantic search ranks every chunk, so the total count isn't meaningful: cap paging instead.
  const semantic = data?.semanticRatio !== undefined;
  // Every hit came from the embeddings, for keywords that no passage contains together (a typo, gibberish, an idea).
  // Questions are meant to be answered by meaning, so they don't get the warning.
  const onlyByMeaning =
    semantic && !isQuestion(request.q) && !!data?.hits.length && data.semanticHitCount === data.hits.length;
  const mode = isExactPhrase(state.q)
    ? { label: "Exact phrase", detail: "keywords only" }
    : isQuestion(state.q)
      ? { label: "Hybrid search", detail: "a question: meaning leads", ratio: QUESTION_SEMANTIC_RATIO }
      : { label: "Hybrid search", detail: "keywords + meaning", ratio: SEMANTIC_RATIO };
  const grouped = request.distinct;
  const focused = data?.hits[0] && state.episodeId ? data.hits[0] : undefined;
  const totalPages = data ? (semantic ? Math.min(data.totalPages, 10) : data.totalPages) : 0;
  const activeFilters = (state.speaker !== "all" ? 1 : 0) + state.guests.length;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24">
      <section className="py-8">
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Where did Lex say that?</h1>
        <p className="mt-1 text-muted-foreground">
          Search {status ? status.episodeCount.toLocaleString() : "…"} episodes of the Lex Fridman Podcast, cut into{" "}
          {status ? status.chunkCount.toLocaleString() : "…"} one-minute passages, and jump straight to the moment.
        </p>

        <div className="relative mt-5">
          <Search className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={state.q}
            onChange={(e) => state.setQ(e.target.value)}
            placeholder='A quote, an idea, a name… use "double quotes" for an exact phrase'
            className="h-12 rounded-xl pl-12 text-base shadow-sm md:text-base"
          />
          {data && (
            <span className="absolute top-1/2 right-4 -translate-y-1/2 font-mono text-xs text-muted-foreground">
              {data.processingTimeMs} ms
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[var(--brand)]" />
            {status && !status.semanticReady ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Embeddings are still computing: keyword search for now
              </span>
            ) : (
              <span className="text-sm">
                <span className="font-medium">{mode.label}</span>
                <span className="ml-1 text-muted-foreground">{mode.detail}</span>
                {mode.ratio !== undefined && (
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">semanticRatio={mode.ratio}</span>
                )}
              </span>
            )}
          </div>
          {!state.q && (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => state.setQ(ex)}
                  className="rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
        <div className="hidden lg:block">
          <FiltersPanel data={data} />
        </div>
        {/* On a phone the filters would push the results two screens down: they open in a sheet instead. */}
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl p-4 pb-8">
            <SheetHeader className="p-0">
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <FiltersPanel data={data} />
          </SheetContent>
        </Sheet>

        <section className="min-w-0 space-y-4">
          {data && data.episodes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
              <span className="text-xs text-muted-foreground">Episodes with “{state.q}”</span>
              {data.episodes.map((e) => (
                <button
                  key={e.id}
                  onClick={() => state.setEpisode(e.id)}
                  className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs hover:bg-muted/70"
                >
                  <Mic className="size-3" />
                  {e.episodeNumber ? `#${e.episodeNumber} ` : ""}
                  {e.guest}
                  <span className="max-w-48 truncate text-muted-foreground">{e.topic}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {data ? (
                onlyByMeaning ? (
                  <>None of these passages contain all your words: they are the closest by meaning</>
                ) : semantic ? (
                  <>
                    {grouped ? "Best moment of each episode" : "Best matches"}, ranked by meaning + keywords
                    {!!data.semanticHitCount && (
                      <>
                        {" "}·{" "}
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block size-3 rounded-[4px] border-2 border-[var(--brand)]/35" />
                          {data.semanticHitCount} found by meaning
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">{data.totalHits.toLocaleString()}</span>{" "}
                    {(grouped ? "episode" : request.q ? "moment" : "passage") + (data.totalHits === 1 ? "" : "s")}
                  </>
                )
              ) : (
                "Searching…"
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFiltersOpen(true)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground lg:hidden",
                activeFilters > 0 && "border-[var(--brand)] bg-[var(--brand)]/10 text-foreground",
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              Filters{activeFilters > 0 && ` · ${activeFilters}`}
            </button>
            <button
              onClick={() => state.setDistinct(!state.distinct)}
              aria-pressed={state.distinct}
              title="Meilisearch distinct on episodeId: keep only the best moment of each episode"
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
                state.distinct && "border-[var(--brand)] bg-[var(--brand)]/10 text-foreground",
              )}
            >
              <Layers className="size-3.5" />
              One per episode
            </button>
            <div className="flex rounded-lg border p-0.5">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => state.setSort(s.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors",
                    state.sort === s.value && "bg-muted text-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            </div>
          </div>

          {state.episodeId && (
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-1.5 rounded-full bg-muted py-1 pr-1.5 pl-3">
                Only in {focused ? `${focused.episodeNumber ? `#${focused.episodeNumber} ` : ""}${focused.guest}` : "this episode"}
                <button onClick={() => state.setEpisode(undefined)} aria-label="Search every episode">
                  <X className="size-3.5" />
                </button>
              </span>
            </div>
          )}

          {isError &&
            (error?.message === "loading" ? (
              <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <Loader2 className="size-4 animate-spin" />
                The transcripts are being loaded into Meilisearch. This page will work in a few minutes.
              </p>
            ) : (
              <p className="text-sm text-destructive">Search failed. Is Meilisearch running?</p>
            ))}

          {/* minmax(0, 1fr): an auto column grows to the card's widest unwrapped line and overflows a phone screen. */}
          <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-3 transition-opacity", isFetching && "opacity-60")}>
            {!data
              ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
              : data.hits.map((hit) => <QuoteCard
                    key={hit.id}
                    hit={hit}
                    onGuest={state.toggleGuest}
                    moreMoments={grouped ? (data.momentsPerEpisode?.[hit.episodeId] ?? 1) - 1 : 0}
                    onEpisode={state.setEpisode}
                  />)}
            {data && data.hits.length === 0 && (
              <p className="py-12 text-center text-muted-foreground">
                Nothing found. Try fewer words, or describe the idea in your own words.
              </p>
            )}
          </div>

          {data && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" disabled={state.page <= 1} onClick={() => state.setPage(state.page - 1)}>
                <ChevronLeft /> Previous
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                {data.page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={state.page >= totalPages}
                onClick={() => state.setPage(state.page + 1)}
              >
                Next <ChevronRight />
              </Button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
