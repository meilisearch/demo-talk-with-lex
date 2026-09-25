"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, Mic, Search, Sparkles, Type } from "lucide-react";
import { useDeferredValue } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import type { SearchResponse, SortOption } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FiltersPanel } from "./filters-panel";
import { QuoteCard } from "./quote-card";
import { useSearch } from "./search-store";

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

function modeLabel(ratio: number) {
  if (ratio === 0) return "Keyword";
  if (ratio === 1) return "Semantic";
  return "Hybrid";
}

export function SearchPage() {
  const state = useSearch();
  const request = useDeferredValue({
    q: state.q,
    semanticRatio: state.semanticRatio,
    page: state.page,
    sort: state.sort,
    speaker: state.speaker,
    guests: state.guests,
  });

  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: async (): Promise<Status> => (await fetch("/api/status")).json(),
    refetchInterval: (query) => (query.state.data?.semanticReady ? false : 15_000),
  });
  const { data, isFetching, isError } = useQuery({
    queryKey: ["search", request],
    queryFn: async (): Promise<SearchResponse & { semantic: boolean }> => {
      const res = await fetch("/api/search", { method: "POST", body: JSON.stringify(request) });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    placeholderData: keepPreviousData,
  });

  // Semantic search ranks every chunk, so the total count isn't meaningful: cap paging instead.
  const semantic = !!data?.semantic;
  const totalPages = data ? (semantic ? Math.min(data.totalPages, 10) : data.totalPages) : 0;

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
          <div className="flex min-w-72 items-center gap-3">
            <Type className="size-4 text-muted-foreground" />
            <Slider
              className="w-40"
              min={0}
              max={1}
              step={0.1}
              disabled={status && !status.semanticReady}
              value={[state.semanticRatio]}
              onValueChange={(v) => state.setSemanticRatio((v as number[])[0])}
            />
            <Sparkles className="size-4 text-[var(--brand)]" />
            {status && !status.semanticReady ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Embeddings are still computing: keyword search for now
              </span>
            ) : (
              <span className="text-sm">
                <span className="font-medium">{modeLabel(state.semanticRatio)}</span>
                <span className="ml-1 font-mono text-xs text-muted-foreground">
                  semanticRatio={state.semanticRatio.toFixed(1)}
                </span>
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
        <FiltersPanel data={data} />

        <section className="min-w-0 space-y-4">
          {data && data.episodes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
              <span className="text-xs text-muted-foreground">Episodes with “{state.q}”</span>
              {data.episodes.map((e) => (
                <button
                  key={e.id}
                  onClick={() => state.toggleGuest(e.guest)}
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
                semantic ? (
                  <>
                    Best matches, ranked by meaning + keywords
                    {data.semanticHitCount !== undefined && <> · {data.semanticHitCount} on this page found by meaning only</>}
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">{data.totalHits.toLocaleString()}</span>{" "}
                    {state.q ? "moments" : "passages"}
                  </>
                )
              ) : (
                "Searching…"
              )}
            </p>
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

          {isError && <p className="text-sm text-destructive">Search failed. Is Meilisearch running?</p>}

          <div className={cn("grid gap-3 transition-opacity", isFetching && "opacity-60")}>
            {!data
              ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
              : data.hits.map((hit) => <QuoteCard key={hit.id} hit={hit} onGuest={state.toggleGuest} />)}
            {data && data.hits.length === 0 && (
              <p className="py-12 text-center text-muted-foreground">
                Nothing found. Try fewer words, or move the slider towards semantic.
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
