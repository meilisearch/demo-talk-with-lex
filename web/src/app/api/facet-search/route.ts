import { NextResponse } from "next/server";
import { CHUNKS_INDEX, meili } from "@/lib/meili";

// NFD strips accents (é, ã) but leaves letters like ø and ß whole.
const LETTERS: Record<string, string> = { ø: "o", æ: "ae", œ: "oe", ß: "ss", ł: "l", đ: "d" };

/** "Bjørn St-Pierre" -> ["bjorn", "st", "pierre"] */
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[øæœßłđ]/g, (c) => LETTERS[c])
    .split(/[\s.-]+/)
    .filter(Boolean);

/**
 * Type-ahead over every guest. Meilisearch facet search only matches from the start of a value ("Sam" finds
 * "Sam Altman", "Altman" finds nothing), and the ~380 guests fit in one facet distribution, so we match any word
 * of the name here: "musk", "lecun", "bjorn" all work.
 */
export async function POST(req: Request) {
  const { facetQuery } = (await req.json()) as { facetQuery: string };
  const res = await meili.index(CHUNKS_INDEX).search("", { limit: 0, facets: ["guests"] });
  const typed = words(facetQuery);
  const hits = Object.entries(res.facetDistribution?.guests ?? {})
    .filter(([value]) => {
      const name = words(value);
      return typed.every((w) => name.some((part) => part.startsWith(w)));
    })
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
  return NextResponse.json(hits);
}
