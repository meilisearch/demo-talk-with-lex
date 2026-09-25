export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** OpenAI-compatible message, as sent to and returned by Meilisearch /chats. */
export interface ChatMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls?: ChatToolCall[] | null;
  tool_call_id?: string | null;
}

/** A transcript chunk Meilisearch retrieved for the LLM (from `_meiliSearchSources`). */
export interface ChatSource {
  id: string;
  episodeId: string;
  episodeNumber: number | null;
  guest: string;
  speaker: string | null;
  start: number;
  timestamp: string;
  text: string;
}

export interface ChatSearchStep {
  callId: string;
  q: string;
  filter?: string;
}

/** A turn rendered in the UI (internal tool messages are kept separately). */
export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  searches: ChatSearchStep[];
  sources: ChatSource[];
  error?: string;
}

/** Credentials for calling Meilisearch /chats straight from the browser. */
export interface ChatSession {
  host: string;
  workspace: string;
  model: string;
  token: string;
}
