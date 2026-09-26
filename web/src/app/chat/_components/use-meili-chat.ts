"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessage, ChatSearchStep, ChatSession, ChatSource, ChatTurn } from "@/lib/chat-types";
import { MEILI_TOOLS } from "@/lib/meili-chat-tools";

interface PendingToolCall {
  name: string;
  args: string;
}

interface StreamChunk {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
  error?: { message?: string };
}

const uid = () => Math.random().toString(36).slice(2);

/**
 * Streams answers straight from Meilisearch `/chats/{workspace}/chat/completions`
 * (the browser calls Meilisearch with a tenant token) and keeps the OpenAI-format
 * history, including the internal search messages Meilisearch hands back via
 * `_meiliAppendConversationMessage`.
 */
export function useMeiliChat(episodeId: string | undefined) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const history = useRef<ChatMessage[]>([]);
  const abort = useRef<AbortController | null>(null);

  const patchLast = useCallback((fn: (t: ChatTurn) => ChatTurn) => {
    setTurns((ts) => [...ts.slice(0, -1), fn(ts[ts.length - 1])]);
  }, []);

  const send = useCallback(
    async (text: string) => {
      history.current.push({ role: "user", content: text });
      setTurns((ts) => [
        ...ts,
        { id: uid(), role: "user", content: text, searches: [], sources: [] },
        { id: uid(), role: "assistant", content: "", searches: [], sources: [] },
      ]);
      setIsStreaming(true);
      abort.current = new AbortController();

      let answer = "";
      try {
        // 1. Our server mints a tenant token scoped to the current chat scope (all episodes or one).
        const tokenRes = await fetch("/api/chat-token", {
          method: "POST",
          body: JSON.stringify({ episodeId }),
          signal: abort.current.signal,
        });
        if (!tokenRes.ok) {
          const err = (await tokenRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Could not start chat (${tokenRes.status})`);
        }
        const session = (await tokenRes.json()) as ChatSession;

        // 2. The browser talks to Meilisearch's OpenAI-compatible /chats endpoint directly.
        const res = await fetch(`${session.host}/chats/${session.workspace}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: session.model, stream: true, messages: history.current, tools: MEILI_TOOLS }),
          signal: abort.current.signal,
        });
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(err.message ?? `Meilisearch chat failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const pending: Record<number, PendingToolCall> = {};

        const flushToolCall = (call: PendingToolCall): boolean => {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(call.args);
          } catch {
            return false;
          }
          if (call.name === "_meiliSearchProgress") {
            // Meilisearch 1.54 sends `function_arguments`; older docs call it `function_parameters`.
            const raw = args.function_arguments ?? args.function_parameters ?? "{}";
            const params = JSON.parse(String(raw)) as { q?: string; filter?: string };
            const step: ChatSearchStep = { callId: String(args.call_id), q: params.q ?? "", filter: params.filter };
            patchLast((t) => ({ ...t, searches: [...t.searches, step] }));
          } else if (call.name === "_meiliSearchSources") {
            // Same story: `sources` in 1.54, `documents` in older docs.
            const docs = (args.sources ?? args.documents ?? []) as ChatSource[];
            patchLast((t) => {
              const seen = new Set(t.sources.map((s) => s.id));
              return { ...t, sources: [...t.sources, ...docs.filter((d) => d.id && !seen.has(d.id))] };
            });
          } else if (call.name === "_meiliAppendConversationMessage") {
            history.current.push(args as unknown as ChatMessage);
          }
          return true;
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
            const chunk = JSON.parse(line.slice(6)) as StreamChunk;
            if (chunk.error) throw new Error(chunk.error.message ?? "LLM error");
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
              answer += delta.content;
              patchLast((t) => ({ ...t, content: answer }));
            }
            for (const tc of delta?.tool_calls ?? []) {
              if (tc.id) pending[tc.index] = { name: tc.function?.name ?? "", args: "" };
              const call = pending[tc.index];
              if (call && tc.function?.arguments) {
                call.args += tc.function.arguments;
                // Surface search progress/sources as soon as the arguments are complete JSON.
                if (flushToolCall(call)) delete pending[tc.index];
              }
            }
          }
        }
        Object.values(pending).forEach(flushToolCall);
        history.current.push({ role: "assistant", content: answer });
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          patchLast((t) => ({ ...t, error: (e as Error).message }));
          history.current.pop();
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [patchLast, episodeId],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    history.current = [];
    setTurns([]);
  }, []);

  const stop = useCallback(() => abort.current?.abort(), []);

  return { turns, isStreaming, send, reset, stop };
}
