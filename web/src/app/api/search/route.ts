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
  const filter = buildFilter(body);
  const episodeQuery = q
    ? [{ indexUid: EPISODES_INDEX, q, limit: 4, attributesToSearchOn: ["guest"], rankingScoreThreshold: 0.9 }]
    : [];
  // With distinct, facets are counted per episode kept: a facet-only query without distinct
  // gives how many passages match in each episode.
  const countQuery =
    body.distinct && q ? [{ indexUid: CHUNKS_INDEX, q, filter, limit: 0, facets: ["episodeId"] }] : [];

  // One round-trip: transcript chunks (+ facets) and the episodes matching the query.
  const res = await meili.multiSearch({
    queries: [
      {
        indexUid: CHUNKS_INDEX,
        q,
        filter,
        distinct: body.distinct ? "episodeId" : undefined,
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
      ...episodeQuery,
      ...countQuery,
    ],
  }).catch((e: { cause?: { code?: string } }) => {
    // The indexes are created by `pnpm data:setup`; until then the archive is still loading.
    if (e.cause?.code === "index_not_found") return null;
    throw e;
  });
  if (!res) return NextResponse.json({ error: "loading" }, { status: 503 });
  const { results } = res as MultiSearchResponse;

  const chunks = results[0];
  const response: SearchResponse & { semantic: boolean } = {
    hits: chunks.hits as ChunkHit[],
    totalHits: chunks.totalHits ?? chunks.estimatedTotalHits ?? 0,
    totalPages: chunks.totalPages ?? 1,
    page: chunks.page ?? 1,
    processingTimeMs: chunks.processingTimeMs,
    facetDistribution: chunks.facetDistribution ?? {},
    semanticHitCount: (chunks as { semanticHitCount?: number }).semanticHitCount,
    episodes: (episodeQuery.length ? results[1].hits : []) as Episode[],
    momentsPerEpisode: countQuery.length ? results.at(-1)?.facetDistribution?.episodeId : undefined,
    semantic: useHybrid,
  };
  return NextResponse.json(response);
}
