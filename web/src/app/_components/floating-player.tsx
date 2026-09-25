"use client";

import { ExternalLink, X } from "lucide-react";
import { youtubeUrl } from "@/lib/types";
import { usePlayer } from "./player-store";

export function FloatingPlayer() {
  const video = usePlayer((s) => s.video);
  const close = usePlayer((s) => s.close);
  if (!video) return null;

  return (
    <div className="fixed right-4 bottom-4 z-40 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-card shadow-2xl">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{video.title}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{video.label}</p>
        </div>
        <a
          href={youtubeUrl(video.videoId, video.start)}
          target="_blank"
          rel="noreferrer"
          aria-label="Open on YouTube"
          className="text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-4" />
        </a>
        <button onClick={close} aria-label="Close player" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <iframe
        key={`${video.videoId}-${video.start}`}
        className="aspect-video w-full"
        src={`https://www.youtube-nocookie.com/embed/${video.videoId}?start=${Math.floor(video.start)}&autoplay=1&rel=0`}
        title={video.title}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
