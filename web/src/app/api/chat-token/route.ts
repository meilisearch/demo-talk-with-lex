import { generateTenantToken } from "meilisearch/token";
import { CHAT_MODEL, CHAT_WORKSPACE, chatEnabled, CHUNKS_INDEX, getChatKey, MEILI_PUBLIC_URL, quote } from "@/lib/meili";
import type { ChatSession } from "@/lib/chat-types";

/**
 * Hands the browser what it needs to call Meilisearch `/chats` directly: a
 * short-lived tenant token derived from the chat key. Its search rules restrict
 * the chat to the chunks index and, optionally, to one episode — the LLM can only
 * retrieve those passages. The chat key itself never leaves the server.
 */
export async function POST(req: Request) {
  const { episodeId } = (await req.json()) as { episodeId?: string };

  const chatKey = (await chatEnabled()) ? await getChatKey() : null;
  if (!chatKey) {
    return Response.json(
      { error: "Chat is not configured. Set CHAT_API_KEY in .env and run `pnpm data:setup`." },
      { status: 503 },
    );
  }

  const token = await generateTenantToken({
    apiKey: chatKey.key,
    apiKeyUid: chatKey.uid,
    searchRules: { [CHUNKS_INDEX]: episodeId ? { filter: `episodeId = ${quote(episodeId)}` } : {} },
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  const session: ChatSession = { host: MEILI_PUBLIC_URL, workspace: CHAT_WORKSPACE, model: CHAT_MODEL, token };
  return Response.json(session);
}
