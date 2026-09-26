# Talk with Lex — the Lex Fridman Podcast on Meilisearch

Demo: every Lex Fridman Podcast transcript cut into one-minute passages. Find *where* someone said
something (and jump to that second on YouTube), or chat with the whole show, or with one episode.

**Data:** 414 episodes · 97,512 chunks · 9.9M words

| Source | Episodes | Speakers | Chapters |
|---|---|---|---|
| Official transcripts on [lexfridman.com](https://lexfridman.com/podcast/) | 71 (mostly #387–#502) | ✅ | ✅ |
| [Whispering-GPT/lex-fridman-podcast](https://huggingface.co/datasets/Whispering-GPT/lex-fridman-podcast) (Whisper) | 343 (#1–#345) | — | ✅ from the YouTube outline |

Episodes #346–#386 (roughly) are missing: neither source covers them.

| Feature | Meilisearch capability |
|---|---|
| `"love is the answer"` finds the exact moments | **Phrase search**, highlighting + cropping |
| Keyword ↔ semantic slider ("fear of death" finds "afraid to die") | **Hybrid search** with a local **HuggingFace embedder** (`BAAI/bge-small-en-v1.5`) or OpenAI |
| "Who said it: Lex / Guests" | **Filter** on `isLex`, counts from **facets** |
| Guest list with type-ahead | **Facets** + **facet search** |
| "Episodes with …" chips above the results | **Multi-search** (`chunks` + `episodes` in one request) |
| Newest / oldest | **Sort** on `episodeNumber` |
| "One per episode" toggle, "+N more moments in this episode" | **`distinct`** on `episodeId`, plus a facet-only query for per-episode counts |
| "Context" under a hit | Filter `episodeId = … AND position X TO Y` + sort |
| Chat page with a timestamped link for every claim | **`/chats` conversational search** (LLM calls a hybrid-search tool, streams progress + sources) |
| Chat with a single episode | **Tenant token** with a search rule `episodeId = …` |

## Run it

Requires Docker (OrbStack) and Node 24.

```bash
cp .env.example .env              # add CHAT_API_KEY for the chat page
docker compose up -d meilisearch
cd web && pnpm install
pnpm data:fetch                    # lexfridman.com + HuggingFace -> data/*.json(l) (~2 min, cached in data/raw)
pnpm data:setup                    # settings, import (~20 s), chat workspace, then embeddings in the background
cd .. && docker compose watch      # web app with live sync
```

- App: http://localhost:3110 (or `http://web.talk-with-lex.orb.local:3000`)
- Meilisearch: http://localhost:7710 (or `http://meilisearch.talk-with-lex.orb.local:7700`), master key in `.env`

Keyword search works as soon as the import finishes. Semantic search and hybrid chat turn on when
the embedding task is done. With the local HuggingFace model that takes about 80 min on CPU for ~100k chunks.
For a faster setup, set `EMBEDDER_SOURCE=openAi` and `EMBEDDER_API_KEY` (text-embedding-3-small, ~13M tokens ≈ $0.30).

### Chat LLM

The `/chats` workspace needs an LLM provider. Set these in `.env`, then re-run `pnpm data:setup`:

```
CHAT_SOURCE=openAi        # openAi | mistral | gemini | azureOpenAi | vLlm
CHAT_API_KEY=sk-...
CHAT_MODEL=gpt-4o-mini
CHAT_BASE_URL=            # required for mistral (https://api.mistral.ai/v1) and vLlm
```

Re-running setup re-sends the documents and settings. Meilisearch only re-embeds a document when its
rendered embedder template changes, so a second run should not redo the whole embedding pass.

## Production

| Piece | Where |
|---|---|
| Front end | Vercel, team `meili`, project `talk-with-lex`: https://talk-with-lex.vercel.app |
| Data | `search.hackersearch.meilisearch.com` (qdq-server box), indexes `lex-chunks` + `lex-episodes`, chat workspace `talk-with-lex` |
| Chat LLM | `claude-sonnet-4-5` through LUMEN on the same box, via its public URL `https://lumen.meilisearch.com/v1`, virtual key `talk-with-lex-demo` with a $20 hard budget and 60 requests/minute. Workspace source is `vLlm` (generic OpenAI-compatible) |

Keys (no master key leaves the box):

| Key | Actions | Indexes | Used by |
|---|---|---|---|
| `talk-with-lex-server` | `search`, `documents.get`, `settings.get`, `stats.get`, `tasks.get` | `lex-chunks`, `lex-episodes` | Vercel API routes (`MEILI_API_KEY`) |
| `talk-with-lex-chat` | `search`, `chatCompletions` | `lex-chunks` | parent of the 30-min tenant tokens the browser uses for `/chats` (`MEILI_CHAT_KEY`) |

The LUMEN key is stored on the box only, in `/etc/talk-with-lex/lumen-key.json` (root, 0600).

### Re-deploying the data

Embeddings are computed once locally and shipped with the documents (`regenerate: false`),
so the production instance never runs the ~80 min embedding pass next to live traffic.

```bash
cd web
pnpm data:export-vectors            # local instance -> data/chunks-with-vectors.ndjson (~450 MB)
ssh -N -L 7799:127.0.0.1:7700 root@62.210.158.50 &
MEILI_HOST=http://127.0.0.1:7799 \
MEILI_MASTER_KEY="$(ssh root@62.210.158.50 'sed -n "s/^MEILI_MASTER_KEY=//p" /etc/meilisearch/meilisearch.env')" \
CHAT_API_KEY="$(ssh root@62.210.158.50 'python3 -c "import json; print(json.load(open(\"/etc/talk-with-lex/lumen-key.json\"))[\"key\"])"')" \
CHAT_SOURCE=vLlm CHAT_BASE_URL=https://lumen.meilisearch.com/v1 CHAT_MODEL=claude-sonnet-4-5 \
MEILI_CHUNKS_INDEX=lex-chunks MEILI_EPISODES_INDEX=lex-episodes CHAT_WORKSPACE=talk-with-lex \
node scripts/setup-meilisearch.ts
```

Tasks queue behind the `hn` indexer, so expect a wait before the import starts.

Gotchas that cost time on this box:
- **Meilisearch refuses private/loopback LLM URLs** ("Rejected IP"), so the workspace calls LUMEN through its public
  hostname rather than `127.0.0.1:8080`.
- **Use `CHAT_SOURCE=vLlm`, not `openAi`, for non-OpenAI models.** With `openAi`, Meilisearch sends the system prompt
  with the `developer` role for any model not named like an older GPT (`gpt-4o`, `gpt-4.1`…); Anthropic and Mistral
  reject it (HTTP 400 / 422 through LUMEN). `vLlm` uses the plain `system` role.
- **IPv6 egress from the box does not work.** A HuggingFace embedder downloads its model on first use and hangs on
  IPv6, which blocks the whole task queue until it gives up. It happened to the `papers` index for ~3.5 h.

### Re-deploying the front end

```bash
cd web && vercel deploy --prod --scope meili
```

## Demo script

1. `"love is the answer"` → 7 exact moments across episodes; press ▶ to play the exact second.
2. `meaning of life` + **Who said it: Lex** → only Lex's own questions (recent episodes).
3. Type `Dostoyevski` (typo) → still finds Dostoevsky.
4. Slide to semantic, search `afraid to die` → passages about death and mortality that never use those words.
5. Open **Context** under a hit, then **Chat with this episode** → "Summarize this conversation in 5 bullet points".
6. Chat page, all episodes: "What does Lex think love is?" → answer with clickable timestamp citations.

## Layout

```
compose.yaml                        meilisearch + web (Next.js dev server, compose watch)
data/                               generated dataset (git-ignored); data/raw caches downloads
web/scripts/fetch-transcripts.ts    scrape + parse + chunk (≈110–190 words, never mixing speakers)
web/scripts/setup-meilisearch.ts    all Meilisearch configuration lives here
web/src/app/api/*                   search (multi-search), context, facet-search, episodes/[id], status,
                                    chat-token (tenant token; the browser calls /chats directly)
web/src/app/                        UI: search page, floating YouTube player, chat page
```
