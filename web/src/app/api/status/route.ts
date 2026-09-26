import { NextResponse } from "next/server";
import { CHAT_MODEL, chatEnabled, CHUNKS_INDEX, EPISODES_INDEX, meili, semanticReady } from "@/lib/meili";

export async function GET() {
  const [chat, chunks, episodes, semantic] = await Promise.all([
    chatEnabled(),
    meili.index(CHUNKS_INDEX).getStats().catch(() => null),
    meili.index(EPISODES_INDEX).getStats().catch(() => null),
    semanticReady(),
  ]);
  return NextResponse.json({
    chatEnabled: chat,
    chatModel: CHAT_MODEL,
    chunkCount: chunks?.numberOfDocuments ?? 0,
    episodeCount: episodes?.numberOfDocuments ?? 0,
    semanticReady: semantic,
  });
}
