"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUp, ChevronDown, ChevronRight, Globe, Loader2, Mic, Play, RotateCcw, Search, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ChatSearchStep, ChatSource, ChatTurn } from "@/lib/chat-types";
import { type Episode, formatTimestamp } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePlayer } from "../../_components/player-store";
import type { Status } from "../../_components/search-page";
import { useMeiliChat } from "./use-meili-chat";

const SUGGESTIONS = {
  all: [
    "What does Lex think love is?",
    "What did Elon Musk say about the future of humanity on Mars?",
    "How do different guests define consciousness?",
    "Which guests talked about Dostoevsky, and what did they say?",
  ],
  episode: [
    "Summarize this conversation in 5 bullet points",
    "What were the most surprising moments?",
    "What did Lex ask about the meaning of life, and what was the answer?",
  ],
};

/** Parses a youtube.com/watch?v=…&t=…s link, so citations play in the in-page player. */
function parseYoutube(href: string | undefined) {
  if (!href) return null;
  try {
    const url = new URL(href);
    const videoId = url.searchParams.get("v");
    if (!url.hostname.endsWith("youtube.com") || !videoId) return null;
    return { videoId, start: Number.parseInt(url.searchParams.get("t") ?? "0", 10) || 0 };
  } catch {
    return null;
  }
}

/** Tool calls folded into one line, like Claude Code: the live query while searching, the full list on click. */
function SearchSteps({ searches, active }: { searches: ChatSearchStep[]; active: boolean }) {
  const last = searches[searches.length - 1];
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex max-w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
        {active ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <Search className="size-3.5 shrink-0" />}
        <span className="shrink-0">
          {active
            ? "Searching the transcripts"
            : `Searched the transcripts ${searches.length} ${searches.length === 1 ? "time" : "times"}`}
        </span>
        {active && last && <span className="truncate font-mono text-xs">{last.q || "(browse)"}</span>}
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 ml-[7px] space-y-1 border-l pl-4">
          {searches.map((s) => (
            <li key={s.callId} className="font-mono text-xs text-muted-foreground">
              {s.q || "(browse)"}
              {s.filter && <span className="text-[var(--brand)]"> · {s.filter}</span>}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Source chips clamped to one line; the rest shows on demand. */
function SourceList({ sources }: { sources: ChatSource[] }) {
  const play = usePlayer((s) => s.play);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Count the chips that wrap past the first line (the layout is the same collapsed or expanded).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const chips = Array.from(el.children) as HTMLElement[];
      const firstTop = chips[0]?.offsetTop ?? 0;
      setHidden(chips.filter((c) => c.offsetTop > firstTop).length);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sources.length]);

  return (
    <div className="space-y-1.5 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Sources · {sources.length} passages retrieved
        </p>
        {hidden > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Show less" : `Show all (+${hidden})`}
            <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      <div ref={listRef} className={cn("flex flex-wrap gap-1.5", !expanded && "max-h-[26px] overflow-hidden")}>
        {sources.map((s) => (
          <button
            key={s.id}
            title={s.text}
            onClick={() =>
              play({
                videoId: s.episodeId,
                start: s.start,
                title: `${s.episodeNumber ? `#${s.episodeNumber} ` : ""}${s.guest}`,
                label: `${s.timestamp} · ${s.speaker ?? s.guest}`,
              })
            }
            className="flex max-w-full items-center gap-1 truncate rounded-md border px-2 py-1 text-xs hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            <Play className="size-3 shrink-0" />
            {s.episodeNumber ? `#${s.episodeNumber} ` : ""}
            {s.guest}
            <span className="font-mono text-muted-foreground">{s.timestamp}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AssistantTurn({ turn, streaming }: { turn: ChatTurn; streaming: boolean }) {
  const play = usePlayer((s) => s.play);
  const components: Components = {
    a: ({ href, children }) => {
      const yt = parseYoutube(href);
      const source = yt && turn.sources.find((s) => s.episodeId === yt.videoId);
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            if (!yt) return;
            e.preventDefault();
            play({
              videoId: yt.videoId,
              start: yt.start,
              title: source ? `${source.episodeNumber ? `#${source.episodeNumber} ` : ""}${source.guest}` : "Lex Fridman Podcast",
              label: formatTimestamp(yt.start),
            });
          }}
        >
          {children}
        </a>
      );
    },
  };

  return (
    <div className="space-y-3">
      {turn.searches.length > 0 && <SearchSteps searches={turn.searches} active={streaming && !turn.content} />}
      {turn.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{turn.error}</p>
      ) : turn.content ? (
        <div className="prose-chat text-[15px] leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {turn.content}
          </ReactMarkdown>
        </div>
      ) : (
        streaming &&
        turn.searches.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Searching Meilisearch…
          </p>
        )
      )}
      {turn.sources.length > 0 && <SourceList sources={turn.sources} />}
    </div>
  );
}

export function ChatPage({ episodeId }: { episodeId?: string }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: async (): Promise<Status> => (await fetch("/api/status")).json(),
  });
  const { data: episode } = useQuery({
    queryKey: ["episode", episodeId],
    queryFn: async (): Promise<Episode> => (await fetch(`/api/episodes/${episodeId}`)).json(),
    enabled: !!episodeId,
  });

  const { turns, isStreaming, send, reset, stop } = useMeiliChat(episodeId);
  const scope = episodeId ? "episode" : "all";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || isStreaming) return;
    setInput("");
    void send(t);
  };

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 py-6 lg:grid-cols-[280px_1fr] lg:gap-8 lg:py-8">
      <aside className="space-y-6">
        <div className="space-y-2">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Chat with</h4>
          <div className="grid gap-1.5">
            <Link
              href="/chat"
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-muted/50",
                scope === "all" && "border-[var(--brand)] bg-muted/40",
              )}
            >
              <Globe className={cn("mt-0.5 size-4", scope === "all" && "text-[var(--brand)]")} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Every episode</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {status ? `${status.episodeCount} episodes · ${status.chunkCount.toLocaleString()} passages` : "…"}
                </span>
              </span>
            </Link>
            {episodeId && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[var(--brand)] bg-muted/40 p-2.5">
                <Mic className="mt-0.5 size-4 text-[var(--brand)]" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {episode?.episodeNumber ? `#${episode.episodeNumber} ` : ""}
                    {episode?.guest ?? "This episode"}
                  </span>
                  <span className="block text-xs text-muted-foreground">{episode?.topic}</span>
                </span>
              </div>
            )}
          </div>
          {!episodeId && (
            <p className="hidden text-xs text-muted-foreground lg:block">
              To chat with a single episode, open a search result and pick “Chat with this episode”.
            </p>
          )}
        </div>

        {/* How it works: desktop only, on a phone it pushes the conversation off the first screen. */}
        <div className="hidden rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground lg:block">
          Answers come from Meilisearch&apos;s <code className="font-mono">/chats</code> API: the LLM calls a hybrid
          search tool on the <code className="font-mono">chunks</code> index and cites the passages it read. Scoping to
          one episode uses a <strong>tenant token</strong> whose search rule filters{" "}
          <code className="font-mono">episodeId = …</code>.
          {status && (
            <span className="mt-1 block">
              Model: <code className="font-mono">{status.chatModel}</code>
            </span>
          )}
        </div>
      </aside>

      <section className="flex min-h-[70vh] min-w-0 flex-col">
        {status && !status.chatEnabled && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            Chat isn&apos;t configured yet: add <code className="font-mono">CHAT_API_KEY</code> to <code>.env</code>, then
            run <code className="font-mono">pnpm data:setup</code>.
          </div>
        )}

        <div className="flex-1 space-y-8">
          {turns.length === 0 ? (
            <div className="pt-8">
              <h1 className="font-serif text-3xl font-semibold tracking-tight">
                {episodeId ? (episode?.title ?? "Chat with this episode") : "Ask anything about the podcast"}
              </h1>
              <p className="mt-1 text-muted-foreground">
                Grounded answers, with a link to the exact moment for every claim.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS[scope].map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="rounded-xl border p-3 text-left text-sm transition-colors hover:border-[var(--brand)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) =>
              t.role === "user" ? (
                <div key={t.id} className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-foreground px-4 py-2.5 text-[15px] text-background">
                    {t.content}
                  </p>
                </div>
              ) : (
                <AssistantTurn key={t.id} turn={t} streaming={isStreaming && i === turns.length - 1} />
              ),
            )
          )}
          <div ref={bottomRef} />
        </div>

        <div className="sticky bottom-4 mt-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-lg"
          >
            {episodeId && (
              <Badge variant="secondary" className="mb-1.5 ml-1 shrink-0">
                1 episode
              </Badge>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              rows={1}
              placeholder="Ask what Lex or a guest said about…"
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none"
            />
            {turns.length > 0 && !isStreaming && (
              <Button type="button" variant="ghost" size="icon" onClick={reset} aria-label="New conversation">
                <RotateCcw />
              </Button>
            )}
            {isStreaming ? (
              <Button type="button" size="icon" onClick={stop} aria-label="Stop">
                <Square />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
                <ArrowUp />
              </Button>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}
