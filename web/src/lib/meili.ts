import "server-only";
import { Meilisearch } from "meilisearch";

export const MEILI_HOST = process.env.MEILI_HOST ?? "http://localhost:7710";
// URL the browser uses to reach Meilisearch (the container talks to http://meilisearch:7700).
export const MEILI_PUBLIC_URL = process.env.MEILI_PUBLIC_URL ?? "http://localhost:7710";
// In production this is a read-only key scoped to the two indexes below; locally the master key.
const MEILI_API_KEY =
  process.env.MEILI_API_KEY ?? process.env.MEILI_MASTER_KEY ?? "talk-with-lex-master-key-change-me";

// Configurable so the demo can live next to other indexes on a shared instance.
export const CHUNKS_INDEX = process.env.MEILI_CHUNKS_INDEX ?? "chunks";
export const EPISODES_INDEX = process.env.MEILI_EPISODES_INDEX ?? "episodes";
export const EMBEDDER = "default";
export const CHAT_WORKSPACE = process.env.CHAT_WORKSPACE ?? "lex";
export const CHAT_MODEL = process.env.CHAT_MODEL ?? "gpt-4o-mini";

export const meili = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_API_KEY });

/**
 * The key tenant tokens are derived from (actions: search + chatCompletions).
 * Production passes it explicitly; locally we look up the "Default Chat API Key" with the master key.
 */
let chatKeyCache: { key: string; uid: string } | null = null;
export async function getChatKey(): Promise<{ key: string; uid: string } | null> {
  if (process.env.MEILI_CHAT_KEY && process.env.MEILI_CHAT_KEY_UID) {
    return { key: process.env.MEILI_CHAT_KEY, uid: process.env.MEILI_CHAT_KEY_UID };
  }
  if (chatKeyCache) return chatKeyCache;
  const keys = await meili.getKeys({ limit: 100 }).catch(() => null);
  const key = keys?.results.find((k) => k.actions.includes("chatCompletions") && k.actions.includes("search"));
  if (!key) return null;
  chatKeyCache = { key: key.key, uid: key.uid };
  return chatKeyCache;
}

/** With a dedicated chat key the workspace is configured by deployment; locally we ask Meilisearch. */
export async function chatEnabled(): Promise<boolean> {
  if (process.env.MEILI_CHAT_KEY) return true;
  return meili.getChatWorkspace(CHAT_WORKSPACE).then(() => true, () => false);
}

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
