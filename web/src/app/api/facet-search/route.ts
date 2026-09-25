import { NextResponse } from "next/server";
import { CHUNKS_INDEX, meili } from "@/lib/meili";

/** Type-ahead over the ~400 guests, counts reflect the current query. */
export async function POST(req: Request) {
  const { facetQuery, q } = (await req.json()) as { facetQuery: string; q?: string };
  const res = await meili.index(CHUNKS_INDEX).searchForFacetValues({ facetName: "guest", facetQuery, q });
  return NextResponse.json(res.facetHits);
}
