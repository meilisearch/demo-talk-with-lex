import { NextResponse } from "next/server";
import { EPISODES_INDEX, meili } from "@/lib/meili";
import type { Episode } from "@/lib/types";

export async function GET(_req: Request, ctx: RouteContext<"/api/episodes/[id]">) {
  const { id } = await ctx.params;
  const episode = await meili.index<Episode>(EPISODES_INDEX).getDocument(id).catch(() => null);
  if (!episode) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(episode);
}
