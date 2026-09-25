"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, MessagesSquare, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { type Chunk, type ChunkHit, youtubeUrl } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Highlight } from "./highlight";
import { usePlayer } from "./player-store";

function SpeakerLabel({ chunk }: { chunk: Chunk }) {
  if (!chunk.speaker) return <span className="text-muted-foreground italic">Speaker unknown</span>;
  return <span className={cn("font-medium", chunk.isLex && "text-[var(--brand)]")}>{chunk.speaker}</span>;
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

export function QuoteCard({ hit, onGuest }: { hit: ChunkHit; onGuest: (guest: string) => void }) {
  const play = usePlayer((s) => s.play);
  const [open, setOpen] = useState(false);
  const label = `${hit.timestamp} · ${hit.speaker ?? hit.guest}`;

  return (
    <article className="group rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
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
        {hit._rankingScore !== undefined && (
          <Badge variant="outline" className="ml-auto font-mono text-[10px]">
            {hit._rankingScore.toFixed(2)}
          </Badge>
        )}
      </div>

      <blockquote className="mt-2.5 font-serif text-[17px] leading-relaxed">
        “<Highlight value={hit._formatted?.text ?? hit.text} />”
      </blockquote>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={hit.episodeTitle}>
          {hit.episodeTitle}
        </span>
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
