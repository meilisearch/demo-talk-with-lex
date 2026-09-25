// Meilisearch-specific tools: progress, sources, and internal conversation messages.
export const MEILI_TOOLS = [
  {
    type: "function",
    function: {
      name: "_meiliSearchProgress",
      description: "Provides information about the current Meilisearch search operation",
      parameters: {
        type: "object",
        properties: {
          call_id: { type: "string" },
          function_name: { type: "string" },
          function_parameters: { type: "string" },
        },
        required: ["call_id", "function_name", "function_parameters"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function",
    function: {
      name: "_meiliSearchSources",
      description: "Provides sources of the search",
      parameters: {
        type: "object",
        properties: { call_id: { type: "string" }, documents: { type: "array", items: { type: "object" } } },
        required: ["call_id", "documents"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
  {
    type: "function",
    function: {
      name: "_meiliAppendConversationMessage",
      description: "Append a new message to the conversation based on what happened internally",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string" },
          content: { type: "string" },
          tool_calls: { type: ["array", "null"] },
          tool_call_id: { type: ["string", "null"] },
        },
        required: ["role", "content", "tool_calls", "tool_call_id"],
        additionalProperties: false,
      },
      strict: true,
    },
  },
];
