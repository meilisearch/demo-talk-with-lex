"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, MessagesSquare, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { badgeVariants } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Chunk, type ChunkHit, youtubeUrl } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Highlight } from "./highlight";
import { usePlayer } from "./player-store";

function SpeakerLabel({ chunk }: { chunk: Chunk }) {
  if (!chunk.speaker) return <span className="text-muted-foreground italic">Speaker unknown</span>;
  return <span className={cn("font-medium", chunk.isLex && "text-[var(--brand)]")}>{chunk.speaker}</span>;
}

const RULE_LABELS: Record<string, string> = {
  words: "Words",
  typo: "Typos",
  proximity: "Proximity",
  attributeRank: "Attribute",
  wordPosition: "Position",
  exactness: "Exactness",
};

/** In a hybrid search, Meilisearch reports `vectorSort` for the hits its embeddings ranked. */
const rankedByMeaning = (hit: ChunkHit) => !!hit._rankingScoreDetails?.vectorSort;

/** The ranking score, with on hover what produced it (`showRankingScoreDetails`). */
function ScoreBadge({ hit, score }: { hit: ChunkHit; score: number }) {
  const details = hit._rankingScoreDetails;
  const semantic = rankedByMeaning(hit);
  const rules = Object.entries(details ?? {})
    .flatMap(([name, d]) => (d?.score === undefined ? [] : [{ name, order: d.order, score: d.score }]))
    .sort((a, b) => a.order - b.order);

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          badgeVariants({ variant: "outline" }),
          "ml-auto cursor-help font-mono text-[10px]",
          semantic && "border-[var(--brand)]/40 text-[var(--brand)]",
        )}
      >
        {semantic && <Sparkles />}
        {score.toFixed(2)}
      </TooltipTrigger>
      <TooltipContent side="left" className="flex-col items-start gap-1.5 py-2">
        {semantic ? (
          <>
            <span className="font-medium">Ranked by meaning</span>
            <span className="opacity-80">
              AI embeddings found this passage close to your query, even without the exact words.
            </span>
            <span className="font-mono">similarity {details?.vectorSort?.similarity.toFixed(3)}</span>
          </>
        ) : (
          <>
            <span className="font-medium">Ranked by keywords</span>
            {rules.length > 0 && (
              <span className="grid grid-cols-[auto_auto] gap-x-4 font-mono">
                {rules.map((r) => (
                  <span key={r.name} className="contents">
                    <span className="opacity-80">{RULE_LABELS[r.name] ?? r.name}</span>
                    <span className="text-right">{r.score.toFixed(2)}</span>
                  </span>
                ))}
              </span>
            )}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** The passages around a hit, fetched on demand (filter on episodeId + position range). */
function Context({ hit }: { hit: ChunkHit }) {
  const play = usePlayer((s) => s.play);
  const { data, isLoading } = useQuery({
    queryKey: ["context", hit.episodeId, hit.position],
    queryFn: async (): Promise<Chunk[]> =>
      (await fetch(`/api/context?episodeId=${hit.episodeId}&position=${hit.position}&radius=2`)).json(),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading context…</p>;
  return (
    <ol className="space-y-3 border-l-2 pl-4">
      {data?.map((c) => (
        <li key={c.id} className={cn("text-sm leading-relaxed", c.id !== hit.id && "text-muted-foreground")}>
          <button
            onClick={() => play({ videoId: c.episodeId, start: c.start, title: c.episodeTitle, label: `${c.timestamp} · ${c.speaker ?? c.guest}` })}
            className="mr-2 font-mono text-xs text-[var(--brand)] hover:underline"
          >
            {c.timestamp}
          </button>
          <span className="mr-1 text-xs">
            <SpeakerLabel chunk={c} />
          </span>
          {c.text}
        </li>
      ))}
    </ol>
  );
}

export function QuoteCard({
  hit,
  onGuest,
  moreMoments = 0,
  onEpisode,
}: {
  hit: ChunkHit;
  onGuest: (guest: string) => void;
  /** When results are grouped by episode: how many other matching moments this episode has. */
  moreMoments?: number;
  onEpisode?: (episodeId: string) => void;
}) {
  const play = usePlayer((s) => s.play);
  const [open, setOpen] = useState(false);
  const label = `${hit.timestamp} · ${hit.speaker ?? hit.guest}`;

  return (
    <article
      className={cn(
        "group rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20",
        rankedByMeaning(hit) && "border-[var(--brand)]/35 hover:border-[var(--brand)]/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <button
          onClick={() => play({ videoId: hit.episodeId, start: hit.start, title: hit.episodeTitle, label })}
          className="flex items-center gap-1 rounded-full bg-[var(--brand)] px-2 py-0.5 font-mono text-[11px] font-medium text-white transition-opacity hover:opacity-85"
        >
          <Play className="size-3 fill-current" />
          {hit.timestamp}
        </button>
        <SpeakerLabel chunk={hit} />
        <span>·</span>
        <button onClick={() => onGuest(hit.guest)} className="hover:text-foreground hover:underline">
          {hit.episodeNumber ? `#${hit.episodeNumber} ` : ""}
          {hit.guest}
        </button>
        {hit.chapter && (
          <>
            <span>·</span>
            <Highlight value={hit._formatted?.chapter ?? hit.chapter} className="truncate" />
          </>
        )}
        {hit._rankingScore !== undefined && <ScoreBadge hit={hit} score={hit._rankingScore} />}
      </div>

      <blockquote className="mt-2.5 font-serif text-[17px] leading-relaxed">
        “<Highlight value={hit._formatted?.text ?? hit.text} />”
      </blockquote>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={hit.episodeTitle}>
          {hit.episodeTitle}
        </span>
        {moreMoments > 0 && onEpisode && (
          <button onClick={() => onEpisode(hit.episodeId)} className="flex items-center gap-1 font-medium text-[var(--brand)] hover:underline">
            +{moreMoments} more {moreMoments === 1 ? "moment" : "moments"} in this episode
          </button>
        )}
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 hover:text-foreground">
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          Context
        </button>
        <Link href={`/chat?episode=${hit.episodeId}`} className="flex items-center gap-1 hover:text-foreground">
          <MessagesSquare className="size-3.5" />
          Chat with this episode
        </Link>
        <a
          href={youtubeUrl(hit.episodeId, hit.start)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
          YouTube
        </a>
      </div>

      {open && (
        <div className="mt-4">
          <Context hit={hit} />
        </div>
      )}
    </article>
  );
}
