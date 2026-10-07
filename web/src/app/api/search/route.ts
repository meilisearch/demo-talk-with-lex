import { NextResponse } from "next/server";
import type { MultiSearchResponse } from "meilisearch";
import { CHUNKS_INDEX, EMBEDDER, EPISODES_INDEX, meili, quote, semanticReady } from "@/lib/meili";
import {
  type ChunkHit,
  type Episode,
  isExactPhrase,
  isQuestion,
  MIN_QUESTION_WORDS,
  QUESTION_SEMANTIC_RATIO,
  SEMANTIC_RATIO,
  type SearchRequest,
  type SearchResponse,
} from "@/lib/types";

const HITS_PER_PAGE = 15;

// In a question, Meilisearch also highlights "what", "is", "does"… wherever they appear: unmark them.
const FILLER = new Set(
  "a an the is are was were be been am do does did of to in on at for with by from as and or but if so that this it its what which who how why when where about there just can could would should will has have had he she his her him they them their we us our i me my you your".split(" "),
);
const unmarkFiller = (s: string | undefined) =>
  s?.replace(/__HL__([^_]+?)__\/HL__/g, (m, word: string) => (FILLER.has(word.toLowerCase()) ? word : m));

const SORTS: Record<SearchRequest["sort"], string[] | undefined> = {
  relevance: undefined,
  newest: ["episodeNumber:desc", "start:asc"],
  oldest: ["episodeNumber:asc", "start:asc"],
};

function buildFilter(body: SearchRequest): string[] {
  const out: string[] = [];
  if (body.speaker === "lex") out.push("isLex = true");
  if (body.speaker === "guest") out.push("isLex = false");
  if (body.guests.length) out.push(`guests IN [${body.guests.map(quote).join(", ")}]`);
  if (body.episodeId) out.push(`episodeId = ${quote(body.episodeId)}`);
  return out;
}

export async function POST(req: Request) {
  const body = (await req.json()) as SearchRequest;
  const q = body.q.trim();
  // The semantic half of a hybrid search ignores quotes and would fill the page with passages that don't contain
  // the phrase, so phrase searches are keyword-only.
  const useHybrid = !!q && !isExactPhrase(q) && (await semanticReady());
  const question = useHybrid && isQuestion(q);
  const semanticRatio = question ? QUESTION_SEMANTIC_RATIO : SEMANTIC_RATIO;
  const filter = buildFilter(body);
  if (question) filter.push(`wordCount >= ${MIN_QUESTION_WORDS}`);
  const episodeQuery = q
    ? [{ indexUid: EPISODES_INDEX, q, limit: 4, attributesToSearchOn: ["guests", "guest"], rankingScoreThreshold: 0.9 }]
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
        facets: ["guests", "isLex", "source"],
        hitsPerPage: HITS_PER_PAGE,
        page: body.page,
        hybrid: useHybrid ? { embedder: EMBEDDER, semanticRatio } : undefined,
        attributesToHighlight: ["text", "chapter"],
        attributesToCrop: ["text:60"],
        cropMarker: "…",
        highlightPreTag: "__HL__",
        highlightPostTag: "__/HL__",
        showRankingScore: true,
        // Tells, per hit, whether keywords or embeddings ranked it (shown on hover in the UI).
        showRankingScoreDetails: true,
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
  if (question) {
    for (const hit of chunks.hits as ChunkHit[]) {
      if (hit._formatted) hit._formatted.text = unmarkFiller(hit._formatted.text);
    }
  }
  const response: SearchResponse = {
    hits: chunks.hits as ChunkHit[],
    totalHits: chunks.totalHits ?? chunks.estimatedTotalHits ?? 0,
    totalPages: chunks.totalPages ?? 1,
    page: chunks.page ?? 1,
    processingTimeMs: chunks.processingTimeMs,
    facetDistribution: chunks.facetDistribution ?? {},
    semanticHitCount: (chunks as { semanticHitCount?: number }).semanticHitCount,
    semanticRatio: useHybrid ? semanticRatio : undefined,
    episodes: (episodeQuery.length ? results[1].hits : []) as Episode[],
    momentsPerEpisode: countQuery.length ? results.at(-1)?.facetDistribution?.episodeId : undefined,
  };
  return NextResponse.json(response);
}
