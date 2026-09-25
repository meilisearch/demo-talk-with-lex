import { NextResponse } from "next/server";
import { CHUNKS_INDEX, meili, quote } from "@/lib/meili";
import type { Chunk } from "@/lib/types";

/** The passages around a hit: same episode, neighbouring positions, in order. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const episodeId = url.searchParams.get("episodeId") ?? "";
  const position = Number(url.searchParams.get("position") ?? 0);
  const radius = Math.min(Number(url.searchParams.get("radius") ?? 2), 10);

  const res = await meili.index<Chunk>(CHUNKS_INDEX).search("", {
    filter: [`episodeId = ${quote(episodeId)}`, `position ${position - radius} TO ${position + radius}`],
    sort: ["position:asc"],
    limit: radius * 2 + 1,
  });
  return NextResponse.json(res.hits);
}
