import { NextResponse } from "next/server";
import { CHAT_MODEL, CHAT_WORKSPACE, CHUNKS_INDEX, EPISODES_INDEX, meili, semanticReady } from "@/lib/meili";

export async function GET() {
  const [chatEnabled, chunks, episodes, semantic] = await Promise.all([
    meili.getChatWorkspace(CHAT_WORKSPACE).then(() => true, () => false),
    meili.index(CHUNKS_INDEX).getStats().catch(() => null),
    meili.index(EPISODES_INDEX).getStats().catch(() => null),
    semanticReady(),
  ]);
  return NextResponse.json({
    chatEnabled,
    chatModel: CHAT_MODEL,
    chunkCount: chunks?.numberOfDocuments ?? 0,
    episodeCount: episodes?.numberOfDocuments ?? 0,
    semanticReady: semantic,
  });
}
