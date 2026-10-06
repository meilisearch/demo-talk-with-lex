export type TranscriptSource = "official" | "whisper";

/** One podcast episode (`episodes` index). `id` is the YouTube video id. */
export interface Episode {
  id: string;
  episodeNumber: number | null;
  title: string;
  guest: string;
  topic: string;
  tagline: string;
  source: TranscriptSource;
  durationSec: number;
  chunkCount: number;
  speakers: string[];
  chapters: { title: string; start: number }[];
}

/** A ~1 minute passage of a transcript (`chunks` index), the unit we search and cite. */
export interface Chunk {
  id: string;
  episodeId: string;
  episodeNumber: number | null;
  episodeTitle: string;
  guest: string;
  /** Who is talking. Only known for official transcripts (lexfridman.com). */
  speaker: string | null;
  isLex: boolean | null;
  chapter: string | null;
  text: string;
  start: number;
  end: number;
  timestamp: string;
  position: number;
  source: TranscriptSource;
}

/**
 * Meilisearch `showRankingScoreDetails`. In a hybrid search each hit carries the details of the side
 * that ranked it: `vectorSort` when it came from the embeddings, the keyword ranking rules otherwise.
 */
export interface RankingScoreDetails {
  vectorSort?: { order: number; similarity: number };
  words?: { order: number; score: number; matchingWords: number; maxMatchingWords: number };
  typo?: { order: number; score: number; typoCount: number; maxTypoCount: number };
  exactness?: { order: number; score: number; matchType: string };
  [rule: string]: { order: number; score?: number } | undefined;
}

export interface ChunkHit extends Chunk {
  _formatted?: Partial<Record<keyof Chunk, string>>;
  _rankingScore?: number;
  _rankingScoreDetails?: RankingScoreDetails;
}

/** Hybrid search weight: 0 is keywords only, 1 is meaning only. */
export const SEMANTIC_RATIO = 0.5;

export type SpeakerFilter = "all" | "lex" | "guest";
export type SortOption = "relevance" | "newest" | "oldest";

export interface SearchRequest {
  q: string;
  page: number;
  sort: SortOption;
  speaker: SpeakerFilter;
  guests: string[];
  episodeId?: string;
  /** One result per episode (Meilisearch `distinct` on `episodeId`). */
  distinct: boolean;
}

export interface SearchResponse {
  hits: ChunkHit[];
  totalHits: number;
  totalPages: number;
  page: number;
  processingTimeMs: number;
  facetDistribution: Record<string, Record<string, number>>;
  semanticHitCount?: number;
  episodes: Episode[];
  /** Matching passages per episode, so a grouped result can say how many more moments it hides. */
  momentsPerEpisode?: Record<string, number>;
}

export const formatTimestamp = (sec: number) => {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

export const youtubeUrl = (videoId: string, start: number) =>
  `https://www.youtube.com/watch?v=${videoId}&t=${Math.max(0, Math.floor(start))}s`;
