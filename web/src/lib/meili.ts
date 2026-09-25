import "server-only";
import { Meilisearch } from "meilisearch";

export const MEILI_HOST = process.env.MEILI_HOST ?? "http://localhost:7710";
// URL the browser uses to reach Meilisearch (the container talks to http://meilisearch:7700).
export const MEILI_PUBLIC_URL = process.env.MEILI_PUBLIC_URL ?? "http://localhost:7710";
export const MEILI_MASTER_KEY = process.env.MEILI_MASTER_KEY ?? "talk-with-lex-master-key-change-me";

export const CHUNKS_INDEX = "chunks";
export const EPISODES_INDEX = "episodes";
export const EMBEDDER = "default";
export const CHAT_WORKSPACE = "lex";
export const CHAT_MODEL = process.env.CHAT_MODEL ?? "gpt-4o-mini";

export const meili = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_MASTER_KEY });

export const quote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

let semanticCache: { value: boolean; at: number } | null = null;

/** True once the embedder exists and no settings/embedding task is still running on the chunks index. */
export async function semanticReady(): Promise<boolean> {
  if (semanticCache && (semanticCache.value || Date.now() - semanticCache.at < 10_000)) return semanticCache.value;
  const [embedders, tasks] = await Promise.all([
    meili.index(CHUNKS_INDEX).getEmbedders().catch(() => null),
    meili.tasks.getTasks({ indexUids: [CHUNKS_INDEX], statuses: ["enqueued", "processing"], limit: 1 }).catch(() => null),
  ]);
  const value = !!embedders?.[EMBEDDER] && (tasks?.results.length ?? 0) === 0;
  semanticCache = { value, at: Date.now() };
  return value;
}
