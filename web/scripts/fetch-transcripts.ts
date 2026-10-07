// Builds ../data/episodes.json and ../data/chunks.ndjson from two sources:
//   1. Official transcripts on lexfridman.com (recent episodes, with speaker names + chapters)
//   2. Whispering-GPT/lex-fridman-podcast on HuggingFace (Whisper transcripts of episodes #1-#345)
// Official transcripts win when both exist for the same YouTube video.
//
//   node scripts/fetch-transcripts.ts
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { guestNames } from "../src/lib/guests.ts";
import { type Chunk, type Episode, formatTimestamp, wordCount } from "../src/lib/types.ts";

const DATA = path.resolve(import.meta.dirname, "../../data");
const RAW = path.join(DATA, "raw");
const PARQUET_URL =
  "https://huggingface.co/api/datasets/Whispering-GPT/lex-fridman-podcast/parquet/default/train/0.parquet";
const UA = "Mozilla/5.0 (talk-with-lex Meilisearch demo)";
const LEX = "Lex Fridman";

// Chunks target roughly one minute of speech: long enough to carry an idea, short enough to cite.
const TARGET_WORDS = 110;
const MAX_WORDS = 190;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…" };
const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();

const episodeNumberOf = (title: string) => {
  const m = title.match(/#(\d+)/);
  return m ? Number(m[1]) : null;
};

async function cachedFetch(url: string, file: string): Promise<string> {
  if (existsSync(file)) return readFile(file, "utf8");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const body = await res.text();
      await writeFile(file, body);
      return body;
    }
    if (attempt >= 3) throw new Error(`${url} -> ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

interface Utterance {
  speaker: string | null;
  text: string;
  start: number;
  chapter: string | null;
}

/** Groups utterances into ~1 minute chunks, never mixing two speakers in one chunk. */
function chunkUtterances(ep: Omit<Episode, "chunkCount" | "durationSec" | "speakers">, utterances: Utterance[], end: number) {
  const chunks: Chunk[] = [];
  let buf: Utterance[] = [];

  const flush = (nextStart: number) => {
    if (!buf.length) return;
    const text = buf.map((u) => u.text).join(" ").replace(/\s+/g, " ").trim();
    const first = buf[0];
    buf = [];
    if (wordCount(text) < 4) return;
    chunks.push({
      id: `${ep.id}-${chunks.length}`,
      episodeId: ep.id,
      episodeNumber: ep.episodeNumber,
      episodeTitle: ep.title,
      guest: ep.guest,
      guests: ep.guests,
      speaker: first.speaker,
      isLex: first.speaker ? first.speaker === LEX : null,
      chapter: first.chapter,
      text,
      start: Math.round(first.start),
      end: Math.round(nextStart),
      timestamp: formatTimestamp(first.start),
      position: chunks.length,
      source: ep.source,
      wordCount: wordCount(text),
    });
  };

  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];
    const next = utterances[i + 1]?.start ?? end;
    if (buf.length && (buf[0].speaker !== u.speaker || buf[0].chapter !== u.chapter)) flush(u.start);
    buf.push(u);
    const words = wordCount(buf.map((b) => b.text).join(" "));
    if (words >= MAX_WORDS || (words >= TARGET_WORDS && /[.?!…]["”']?$/.test(u.text.trim()))) flush(next);
  }
  flush(end);
  return chunks;
}

/** Splits a long speaker turn into sentence-aligned pieces, interpolating their start times. */
function splitTurn(u: Utterance, nextStart: number): Utterance[] {
  const total = wordCount(u.text);
  if (total <= MAX_WORDS) return [u];
  const sentences = u.text.match(/[^.?!…]+[.?!…]+["”']?\s*|[^.?!…]+$/g) ?? [u.text];
  const duration = Math.max(0, nextStart - u.start);
  const out: Utterance[] = [];
  let seen = 0;
  for (const s of sentences) {
    out.push({ ...u, text: s.trim(), start: u.start + (duration * seen) / total });
    seen += wordCount(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Official transcripts (lexfridman.com)
// ---------------------------------------------------------------------------
async function fetchOfficial() {
  const dir = path.join(RAW, "official");
  await mkdir(dir, { recursive: true });
  const index = await cachedFetch("https://lexfridman.com/podcast/", path.join(RAW, "podcast.html"));

  const items = index.split('<div class="guest">').slice(1).flatMap((block) => {
    const transcript = block.match(/href="(https:\/\/lexfridman\.com\/([a-z0-9-]+)-transcript)\/?"/);
    const video = block.match(/youtube\.com\/watch\?v=([\w-]{11})/);
    if (!transcript || !video) return [];
    const pick = (cls: string) => decode(block.match(new RegExp(`class="${cls}">([\\s\\S]*?)</div>`))?.[1] ?? "");
    return [{ url: transcript[1], slug: transcript[2], videoId: video[1], guest: pick("vid-person"), topic: pick("vid-title"), tagline: pick("vid-tagline") }];
  });
  console.log(`lexfridman.com: ${items.length} episodes with an official transcript`);

  const episodes: Episode[] = [];
  const chunks: Chunk[] = [];
  let done = 0;
  const queue = [...items];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const html = await cachedFetch(item.url, path.join(dir, `${item.slug}.html`)).catch((e) => {
          console.warn(`  ! ${item.slug}: ${(e as Error).message}`);
          return null;
        });
        done++;
        if (!html) continue;
        const pageTitle = decode(html.match(/<title>([^<]*)/)?.[1] ?? "")
          .replace(/^Transcript for /, "")
          .replace(/ - Lex Fridman$/, "");

        const utterances: Utterance[] = [];
        const chapters: Episode["chapters"] = [];
        let chapter: string | null = null;
        const re = /<h2[^>]*>([\s\S]*?)<\/h2>|<div class="ts-segment">([\s\S]*?)<\/div>/g;
        for (const m of html.matchAll(re)) {
          if (m[1] !== undefined) {
            chapter = decode(m[1]);
            continue;
          }
          const seg = m[2];
          const speaker = decode(seg.match(/class="ts-name">([\s\S]*?)<\/span>/)?.[1] ?? "") || null;
          const t = Number(seg.match(/[?&](?:amp;|#038;)?t=(\d+)/)?.[1] ?? NaN);
          const text = decode(seg.match(/class="ts-text">([\s\S]*?)<\/span>/)?.[1] ?? "");
          if (!text || Number.isNaN(t)) continue;
          if (chapter && chapters.at(-1)?.title !== chapter) chapters.push({ title: chapter, start: t });
          utterances.push({ speaker, text, start: t, chapter });
        }
        if (!utterances.length) {
          console.warn(`  ! ${item.slug}: no transcript segments found`);
          continue;
        }
        // Consecutive segments may repeat the same speaker (their name is only shown once per turn).
        for (let i = 1; i < utterances.length; i++) utterances[i].speaker ??= utterances[i - 1].speaker;

        const end = utterances.at(-1)!.start + 60;
        const split = utterances.flatMap((u, i) => splitTurn(u, utterances[i + 1]?.start ?? end));
        const ep = {
          id: item.videoId,
          episodeNumber: episodeNumberOf(pageTitle),
          title: pageTitle,
          guest: item.guest || pageTitle.split(":")[0],
          guests: guestNames(item.guest || pageTitle.split(":")[0], episodeNumberOf(pageTitle)),
          topic: item.topic,
          tagline: item.tagline,
          source: "official" as const,
          chapters,
        };
        const epChunks = chunkUtterances(ep, split, end);
        const speakers = [...new Set(utterances.map((u) => u.speaker).filter((s): s is string => !!s))];
        episodes.push({ ...ep, durationSec: end, chunkCount: epChunks.length, speakers });
        chunks.push(...epChunks);
        if (done % 10 === 0) console.log(`  … ${done}/${items.length}`);
      }
    }),
  );
  return { episodes, chunks };
}

// ---------------------------------------------------------------------------
// 2. Whisper transcripts (HuggingFace parquet)
// ---------------------------------------------------------------------------
interface WhisperRow {
  id: string;
  title: string;
  description: string;
  segments: string | { start: number; end: number; text: string }[];
}

/** YouTube descriptions carry an OUTLINE block ("1:02:03 - Topic"), which gives us chapters. */
function parseOutline(description: string): Episode["chapters"] {
  const out: Episode["chapters"] = [];
  for (const m of description.matchAll(/^\s*((?:\d+:)?\d+:\d{2})\s*[-–]\s*(.+)$/gm)) {
    const start = m[1].split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
    out.push({ title: m[2].trim(), start });
  }
  return out.sort((a, b) => a.start - b.start);
}

async function fetchWhisper(skip: Set<string>) {
  const file = path.join(RAW, "whisper.parquet");
  if (!existsSync(file)) {
    console.log("Downloading Whispering-GPT/lex-fridman-podcast (57 MB)…");
    const res = await fetch(PARQUET_URL);
    if (!res.ok) throw new Error(`parquet download -> ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  const rows = (await parquetReadObjects({
    file: await asyncBufferFromFile(file),
    columns: ["id", "title", "description", "segments"],
  })) as WhisperRow[];

  const episodes: Episode[] = [];
  const chunks: Chunk[] = [];
  for (const row of rows) {
    if (skip.has(row.id)) continue;
    const segments: { start: number; end: number; text: string }[] =
      typeof row.segments === "string" ? JSON.parse(row.segments) : row.segments;
    if (!segments.length) continue;
    const chapters = parseOutline(row.description);
    const chapterAt = (t: number) => chapters.findLast((c) => c.start <= t)?.title ?? null;
    // "Guest: Topic | Lex Fridman Podcast #N", sometimes "Guest | Topic | Lex Fridman Podcast #N".
    const [guest, rest = ""] = row.title.includes(":") ? row.title.split(/:\s(.+)/) : row.title.split(/\s\|\s(.+)/);
    const guestLabel = guest.replace(/^Lex Fridman Podcast #\d+\s*[–-]\s*/, "").trim();
    const ep = {
      id: row.id,
      episodeNumber: episodeNumberOf(row.title),
      title: row.title,
      guest: guestLabel,
      guests: guestNames(guestLabel, episodeNumberOf(row.title)),
      topic: rest.split("|")[0].replace(/\s*\[Reupload\]/i, "").trim(),
      tagline: row.description.split(/\n|Please support/)[0].trim().slice(0, 240),
      source: "whisper" as const,
      chapters,
    };
    const utterances: Utterance[] = segments.map((s) => ({ speaker: null, text: s.text.trim(), start: s.start, chapter: chapterAt(s.start) }));
    const end = segments.at(-1)!.end;
    const epChunks = chunkUtterances(ep, utterances, end);
    episodes.push({ ...ep, durationSec: Math.round(end), chunkCount: epChunks.length, speakers: [] });
    chunks.push(...epChunks);
  }
  console.log(`HuggingFace Whisper: ${episodes.length} episodes (after de-duplication)`);
  return { episodes, chunks };
}

async function main() {
  await mkdir(RAW, { recursive: true });
  const official = await fetchOfficial();
  const whisper = await fetchWhisper(new Set(official.episodes.map((e) => e.id)));

  const episodes = [...official.episodes, ...whisper.episodes].sort(
    (a, b) => (b.episodeNumber ?? 0) - (a.episodeNumber ?? 0),
  );
  const chunks = [...official.chunks, ...whisper.chunks];
  await writeFile(path.join(DATA, "episodes.json"), JSON.stringify(episodes));
  await writeFile(path.join(DATA, "chunks.ndjson"), chunks.map((c) => JSON.stringify(c)).join("\n") + "\n");

  const words = chunks.reduce((n, c) => n + wordCount(c.text), 0);
  console.log(
    `✓ ${episodes.length} episodes, ${chunks.length.toLocaleString()} chunks, ${(words / 1e6).toFixed(1)}M words ` +
      `(${official.episodes.length} official w/ speakers, ${whisper.episodes.length} Whisper)`,
  );
}

await main();
