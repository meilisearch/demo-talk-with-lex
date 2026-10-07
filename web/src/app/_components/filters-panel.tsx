"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { SearchResponse, SpeakerFilter } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSearch } from "./search-store";

const SPEAKERS: { value: SpeakerFilter; label: string }[] = [
  { value: "all", label: "Anyone" },
  { value: "lex", label: "Lex" },
  { value: "guest", label: "Guests" },
];

/** Guest filter: facet distribution for the current query, plus a type-ahead over every guest. */
function GuestFacet({ distribution }: { distribution?: Record<string, number> }) {
  const selected = useSearch((s) => s.guests);
  const toggle = useSearch((s) => s.toggleGuest);
  const [facetQuery, setFacetQuery] = useState("");
  const deferred = useDeferredValue(facetQuery);
  const [expanded, setExpanded] = useState(false);

  const { data: found } = useQuery({
    queryKey: ["facet-search", deferred],
    queryFn: async (): Promise<{ value: string; count: number }[]> =>
      (await fetch("/api/facet-search", { method: "POST", body: JSON.stringify({ facetQuery: deferred }) })).json(),
    enabled: deferred.length > 0,
  });

  const entries: [string, number][] = deferred
    ? (found ?? []).map((f) => [f.value, f.count])
    : Object.entries(distribution ?? {});
  for (const s of selected) if (!entries.some(([v]) => v === s)) entries.unshift([s, 0]);
  const limit = 10;
  const shown = expanded || deferred ? entries : entries.slice(0, limit);

  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Guest</h4>
      <div className="relative">
        <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={facetQuery}
          onChange={(e) => setFacetQuery(e.target.value)}
          placeholder="Find a guest…"
          className="h-8 pl-7 text-sm"
        />
        {facetQuery && (
          <button onClick={() => setFacetQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2" aria-label="Clear">
            <X className="size-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
      <ul className="space-y-0.5">
        {shown.map(([value, count]) => (
          <li key={value}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-muted">
              <Checkbox checked={selected.includes(value)} onCheckedChange={() => toggle(value)} />
              <span className="flex-1 truncate" title={value}>
                {value}
              </span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{count.toLocaleString()}</span>
            </label>
          </li>
        ))}
        {deferred && found?.length === 0 && <li className="px-1 text-sm text-muted-foreground">No guest found</li>}
      </ul>
      {!deferred && entries.length > limit && (
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : `Show ${entries.length - limit} more`}
        </button>
      )}
    </section>
  );
}

export function FiltersPanel({ data }: { data?: SearchResponse }) {
  const speaker = useSearch((s) => s.speaker);
  const setSpeaker = useSearch((s) => s.setSpeaker);
  const guests = useSearch((s) => s.guests);
  const clear = useSearch((s) => s.clearFilters);
  const isLex = data?.facetDistribution.isLex ?? {};
  const counts: Record<SpeakerFilter, number | undefined> = {
    all: data?.totalHits,
    lex: isLex["true"],
    guest: isLex["false"],
  };

  return (
    <aside className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Who said it</h4>
          {(speaker !== "all" || guests.length > 0) && (
            <button onClick={clear} className="text-xs text-muted-foreground hover:text-foreground">
              Reset filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 rounded-lg border p-0.5">
          {SPEAKERS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSpeaker(s.value)}
              className={cn(
                "rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors",
                speaker === s.value && "bg-muted font-medium text-foreground",
              )}
            >
              {s.label}
              {counts[s.value] !== undefined && s.value !== "all" && (
                <span className="ml-1 font-mono text-[10px] opacity-70">{counts[s.value]}</span>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Speaker names come from the official transcripts (recent episodes). Older episodes are Whisper transcripts
          without speakers, so filtering on Lex or guests only searches the recent ones.
        </p>
      </section>

      <GuestFacet distribution={data?.facetDistribution.guests} />
    </aside>
  );
}
