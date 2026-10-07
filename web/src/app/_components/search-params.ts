import type { SearchRequest } from "@/lib/types";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** The search state a URL describes, so a search can be shared and the back button works. */
export function searchFromParams(params: Params): SearchRequest {
  const sort = first(params.sort);
  const speaker = first(params.speaker);
  const page = Number(first(params.page));
  return {
    q: first(params.q) ?? "",
    page: Number.isInteger(page) && page > 1 ? page : 1,
    sort: sort === "newest" || sort === "oldest" ? sort : "relevance",
    speaker: speaker === "lex" || speaker === "guest" ? speaker : "all",
    guests: all(params.guest),
    episodeId: first(params.episode),
    distinct: first(params.grouped) === "1",
  };
}

export function searchToQueryString(s: SearchRequest): string {
  const params = new URLSearchParams();
  if (s.q) params.set("q", s.q);
  if (s.speaker !== "all") params.set("speaker", s.speaker);
  for (const g of s.guests) params.append("guest", g);
  if (s.episodeId) params.set("episode", s.episodeId);
  if (s.distinct) params.set("grouped", "1");
  if (s.sort !== "relevance") params.set("sort", s.sort);
  if (s.page > 1) params.set("page", String(s.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function searchFromQueryString(qs: string): SearchRequest {
  const params = new URLSearchParams(qs);
  return searchFromParams(Object.fromEntries([...new Set(params.keys())].map((k) => [k, params.getAll(k)])));
}
