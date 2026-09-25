// Configures Meilisearch (indexes, settings, embedder, chat workspace) and imports
// ../data/episodes.json + ../data/chunks.ndjson.
//
//   node scripts/setup-meilisearch.ts            # embeddings keep computing in the background
//   node scripts/setup-meilisearch.ts --wait     # wait until every chunk is embedded
import { Meilisearch } from "meilisearch";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import type { Chunk, Episode } from "../src/lib/types.ts";
import { loadEnv } from "./env.ts";

loadEnv();

const host = process.env.MEILI_HOST ?? "http://localhost:7710";
const apiKey = process.env.MEILI_MASTER_KEY ?? "talk-with-lex-master-key-change-me";
const client = new Meilisearch({ host, apiKey });
const DATA = path.resolve(import.meta.dirname, "../../data");

const CHUNKS = "chunks";
const EPISODES = "episodes";
const EMBEDDER = "default";
const WORKSPACE = "lex";
const BATCH = 10_000;

async function meili(pathname: string, init: RequestInit = {}) {
  const res = await fetch(`${host}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function waitTask(taskUid: number, label: string) {
  const started = Date.now();
  const task = await client.tasks.waitForTask(taskUid, { timeout: 6 * 60 * 60 * 1000, interval: 2000 });
  if (task.status !== "succeeded") throw new Error(`${label} failed: ${JSON.stringify(task.error)}`);
  console.log(`✓ ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

function embedderSettings() {
  const source = process.env.EMBEDDER_SOURCE ?? "huggingFace";
  // The speaker + chapter give the vector some context beyond the raw words.
  const documentTemplate =
    "{% if doc.speaker %}{{doc.speaker}}: {% endif %}{{doc.text}}{% if doc.chapter %} (topic: {{doc.chapter}}){% endif %}";
  if (source === "openAi") {
    if (!process.env.EMBEDDER_API_KEY) throw new Error("EMBEDDER_SOURCE=openAi requires EMBEDDER_API_KEY");
    return {
      source: "openAi",
      apiKey: process.env.EMBEDDER_API_KEY,
      model: "text-embedding-3-small",
      dimensions: 1536,
      documentTemplate,
      documentTemplateMaxBytes: 2000,
    };
  }
  return { source: "huggingFace", model: "BAAI/bge-small-en-v1.5", documentTemplate, documentTemplateMaxBytes: 2000 };
}

const CHAT_DESCRIPTION =
  "Chunked transcripts of the Lex Fridman Podcast (≈400 long-form conversations about AI, science, history, politics, philosophy, sports and more). Each document is ~1 minute of the conversation with the episode title, guest, speaker (when known), chapter and timestamp.";

const CHAT_TEMPLATE =
  "Episode: {{doc.episodeTitle}}\nGuest: {{doc.guest}}\n{% if doc.speaker %}Speaker: {{doc.speaker}}\n{% endif %}{% if doc.chapter %}Chapter: {{doc.chapter}}\n{% endif %}Timestamp: {{doc.timestamp}}\nLink: https://www.youtube.com/watch?v={{doc.episodeId}}&t={{doc.start}}s\nTranscript: {{doc.text}}";

async function main() {
  const episodes: Episode[] = JSON.parse(await readFile(path.join(DATA, "episodes.json"), "utf8"));

  await meili("/experimental-features", { method: "PATCH", body: JSON.stringify({ chatCompletions: true }) });
  console.log("✓ experimental feature: chatCompletions");

  // ---- chunks index: settings without the embedder first, so keyword search works right away
  await client.createIndex(CHUNKS, { primaryKey: "id" }).waitTask().catch(() => undefined);
  const chunks = client.index<Chunk>(CHUNKS);
  const baseSettings = {
    searchableAttributes: ["text", "speaker", "guest", "chapter", "episodeTitle"],
    displayedAttributes: ["*"],
    filterableAttributes: ["episodeId", "episodeNumber", "guest", "speaker", "isLex", "source", "position", "start"],
    sortableAttributes: ["episodeNumber", "start", "position"],
    rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
    typoTolerance: { minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 } },
    synonyms: {
      agi: ["artificial general intelligence"],
      "artificial general intelligence": ["agi"],
      ai: ["artificial intelligence"],
      llm: ["large language model"],
      llms: ["large language models"],
      bjj: ["jiu jitsu"],
      "jiu jitsu": ["bjj", "jiu-jitsu"],
      ussr: ["soviet union"],
      "soviet union": ["ussr"],
    },
    faceting: { maxValuesPerFacet: 500, sortFacetValuesBy: { "*": "count" } },
    pagination: { maxTotalHits: 1000 },
    chat: {
      description: CHAT_DESCRIPTION,
      documentTemplate: CHAT_TEMPLATE,
      documentTemplateMaxBytes: 2000,
      searchParameters: { limit: 12 },
    },
  };
  await waitTask(
    (await chunks.updateSettings(baseSettings as Parameters<typeof chunks.updateSettings>[0])).taskUid,
    "chunks settings",
  );

  // ---- import chunks in batches (the NDJSON file is ~90 MB) --------------
  let batch: Chunk[] = [];
  let total = 0;
  let lastTask = 0;
  const lines = createInterface({ input: createReadStream(path.join(DATA, "chunks.ndjson")) });
  for await (const line of lines) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    if (batch.length === BATCH) {
      lastTask = (await chunks.addDocuments(batch)).taskUid;
      total += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    lastTask = (await chunks.addDocuments(batch)).taskUid;
    total += batch.length;
  }
  await waitTask(lastTask, `chunks documents (${total.toLocaleString()})`);

  // ---- episodes index (multi-search + guest lookup) -----------------------
  await client.createIndex(EPISODES, { primaryKey: "id" }).waitTask().catch(() => undefined);
  const episodesIndex = client.index<Episode>(EPISODES);
  await waitTask(
    (
      await episodesIndex.updateSettings({
        searchableAttributes: ["guest", "topic", "title", "tagline", "chapters.title"],
        filterableAttributes: ["id", "source", "episodeNumber", "guest"],
        sortableAttributes: ["episodeNumber"],
        displayedAttributes: ["id", "episodeNumber", "title", "guest", "topic", "tagline", "source", "durationSec", "chunkCount", "speakers"],
      })
    ).taskUid,
    "episodes settings",
  );
  await waitTask((await episodesIndex.addDocuments(episodes)).taskUid, `episodes documents (${episodes.length})`);

  // ---- chat workspace ----------------------------------------------------
  const chatKey = process.env.CHAT_API_KEY;
  const source = process.env.CHAT_SOURCE ?? "openAi";
  if (chatKey || source === "vLlm") {
    await meili(`/chats/${WORKSPACE}/settings`, {
      method: "PATCH",
      body: JSON.stringify({
        source,
        apiKey: chatKey || undefined,
        baseUrl: process.env.CHAT_BASE_URL || undefined,
        prompts: {
          system: [
            "You are an expert on the Lex Fridman Podcast. Answer using ONLY the transcript excerpts returned by your search tool; never rely on outside knowledge about what someone said.",
            "Every claim must be cited with a Markdown link to the exact moment, using the Link field of the excerpt, e.g. [Elon Musk, #400 at 1:02:03](https://www.youtube.com/watch?v=ID&t=3723s).",
            "Quote short verbatim fragments when the user asks what someone said. Excerpts without a Speaker field come from automatic transcripts where the speaker is unknown: say so if it matters.",
            "Search several times with different phrasings when the first search is not conclusive. If the excerpts do not contain the answer, say you could not find it in the transcripts. Use concise Markdown.",
          ].join(" "),
          searchDescription:
            "Search the Lex Fridman Podcast transcripts. Use it for any question about what Lex or a guest said, which episode discussed a topic, or opinions expressed on the show.",
          searchQParam:
            "Search query: the key words or a short paraphrase of what was said (e.g. `meaning of life`, `love is the answer`). Not a full question.",
          searchFilterParam:
            "Optional Meilisearch filter. Examples: `isLex = true` (only Lex's own words, recent episodes), `guest = \"Elon Musk\"`, `speaker = \"Elon Musk\"`, `episodeNumber >= 400`. Leave empty unless the user explicitly restricts who spoke or which episode.",
          searchIndexUidParam: "Index to search. Always use `chunks`.",
        },
      }),
    });
    console.log(`✓ chat workspace "${WORKSPACE}" (${source})`);
  } else {
    console.log("! CHAT_API_KEY not set: chat workspace skipped (search still works)");
  }

  // ---- embedder last: it re-embeds every chunk, which is the long part ---
  const embedder = embedderSettings();
  const embedTask = await chunks.updateSettings({
    embedders: { [EMBEDDER]: embedder },
    chat: { ...baseSettings.chat, searchParameters: { limit: 12, hybrid: { embedder: EMBEDDER, semanticRatio: 0.6 } } },
  } as Parameters<typeof chunks.updateSettings>[0]);
  console.log(`… embedding ${total.toLocaleString()} chunks with ${embedder.source} ${embedder.model} (task ${embedTask.taskUid})`);
  if (process.argv.includes("--wait")) {
    await waitTask(embedTask.taskUid, "embeddings");
  } else {
    console.log("  Keyword search works now; semantic search and chat turn on when the task finishes.");
    console.log(`  Follow it with: curl -s -H 'Authorization: Bearer $MEILI_MASTER_KEY' ${host}/tasks/${embedTask.taskUid}`);
  }
}

await main();
