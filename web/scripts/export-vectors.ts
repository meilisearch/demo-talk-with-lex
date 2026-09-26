// Exports every chunk *with its embedding* from a Meilisearch instance that already embedded them
// (e.g. the local Docker one) to ../data/chunks-with-vectors.ndjson. Importing that file elsewhere
// with `regenerate: false` skips the ~80 min CPU embedding pass on the target instance.
//
//   node scripts/export-vectors.ts
import { createWriteStream } from "node:fs";
import path from "node:path";
import { loadEnv } from "./env.ts";

loadEnv();

const host = process.env.MEILI_HOST ?? "http://localhost:7710";
const apiKey = process.env.MEILI_MASTER_KEY ?? "talk-with-lex-master-key-change-me";
const index = process.env.MEILI_CHUNKS_INDEX ?? "chunks";
const EMBEDDER = "default";
const PAGE = 2000;

interface Doc {
  _vectors?: Record<string, { embeddings: number[][]; regenerate: boolean }>;
  [key: string]: unknown;
}

const out = createWriteStream(path.resolve(import.meta.dirname, "../../data/chunks-with-vectors.ndjson"));
let offset = 0;
let total = 0;
for (;;) {
  const res = await fetch(`${host}/indexes/${index}/documents/fetch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ offset, limit: PAGE, retrieveVectors: true }),
  });
  if (!res.ok) throw new Error(`fetch documents -> ${res.status} ${await res.text()}`);
  const { results, total: count } = (await res.json()) as { results: Doc[]; total: number };
  for (const doc of results) {
    const vector = doc._vectors?.[EMBEDDER]?.embeddings?.[0];
    if (!vector) throw new Error(`document ${String(doc.id)} has no "${EMBEDDER}" embedding yet`);
    // 6 decimals is below float32 precision for these unit vectors and halves the file size.
    const rounded = vector.map((x) => Math.round(x * 1e6) / 1e6);
    doc._vectors = { [EMBEDDER]: { embeddings: [rounded], regenerate: false } };
    out.write(JSON.stringify(doc) + "\n");
  }
  total += results.length;
  offset += PAGE;
  process.stdout.write(`\r… ${total.toLocaleString()} / ${count.toLocaleString()}`);
  if (offset >= count) break;
}
await new Promise((resolve) => out.end(resolve));
console.log(`\n✓ ${total.toLocaleString()} chunks with embeddings -> data/chunks-with-vectors.ndjson`);
