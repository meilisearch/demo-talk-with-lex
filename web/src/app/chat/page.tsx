import { ChatPage } from "./_components/chat-page";

export default async function Chat({ searchParams }: PageProps<"/chat">) {
  const params = await searchParams;
  const episodeId = typeof params.episode === "string" ? params.episode : undefined;
  return <ChatPage key={episodeId ?? "all"} episodeId={episodeId} />;
}
