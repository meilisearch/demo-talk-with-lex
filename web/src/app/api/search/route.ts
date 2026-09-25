import { NextResponse } from "next/server";
import type { MultiSearchResponse } from "meilisearch";
import { CHUNKS_INDEX, EMBEDDER, EPISODES_INDEX, meili, quote, semanticReady } from "@/lib/meili";
import type { ChunkHit, Episode, SearchRequest, SearchResponse } from "@/lib/types";

const HITS_PER_PAGE = 15;

const SORTS: Record<SearchRequest["sort"], string[] | undefined> = {
  relevance: undefined,
  newest: ["episodeNumber:desc", "start:asc"],
  oldest: ["episodeNumber:asc", "start:asc"],
};

function buildFilter(body: SearchRequest): string[] {
  const out: string[] = [];
  if (body.speaker === "lex") out.push("isLex = true");
  if (body.speaker === "guest") out.push("isLex = false");
  if (body.guests.length) out.push(`guest IN [${body.guests.map(quote).join(", ")}]`);
  if (body.episodeId) out.push(`episodeId = ${quote(body.episodeId)}`);
  return out;
}

export async function POST(req: Request) {
  const body = (await req.json()) as SearchRequest;
  const q = body.q.trim();
  const useHybrid = !!q && body.semanticRatio > 0 && (await semanticReady());

  // One round-trip: transcript chunks (+ facets) and the episodes matching the query.
  const { results } = (await meili.multiSearch({
    queries: [
      {
        indexUid: CHUNKS_INDEX,
        q,
        filter: buildFilter(body),
        sort: SORTS[body.sort],
        facets: ["guest", "isLex", "source"],
        hitsPerPage: HITS_PER_PAGE,
        page: body.page,
        hybrid: useHybrid ? { embedder: EMBEDDER, semanticRatio: body.semanticRatio } : undefined,
        attributesToHighlight: ["text", "chapter"],
        attributesToCrop: ["text:60"],
        cropMarker: "…",
        highlightPreTag: "__HL__",
        highlightPostTag: "__/HL__",
        showRankingScore: true,
      },
      ...(q
        ? [{ indexUid: EPISODES_INDEX, q, limit: 4, attributesToSearchOn: ["guest"], rankingScoreThreshold: 0.9 }]
        : []),
    ],
  })) as MultiSearchResponse;

  const chunks = results[0];
  const response: SearchResponse & { semantic: boolean } = {
    hits: chunks.hits as ChunkHit[],
    totalHits: chunks.totalHits ?? chunks.estimatedTotalHits ?? 0,
    totalPages: chunks.totalPages ?? 1,
    page: chunks.page ?? 1,
    processingTimeMs: chunks.processingTimeMs,
    facetDistribution: chunks.facetDistribution ?? {},
    semanticHitCount: (chunks as { semanticHitCount?: number }).semanticHitCount,
    episodes: (results[1]?.hits ?? []) as Episode[],
    semantic: useHybrid,
  };
  return NextResponse.json(response);
}
