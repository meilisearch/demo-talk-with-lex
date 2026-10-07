/**
 * Episodes with several guests are labelled by their title ("Alien Debate", "Cursor Team"), which hides who is in
 * them. These are the people, so each one can be filtered and found on their own.
 */
const GUESTS_BY_EPISODE: Record<number, string[]> = {
  209: ["Luís Batalha", "João Batalha"],
  256: ["Yaron Brook", "Yoram Hazony"],
  279: ["Sara Walker", "Lee Cronin"],
  339: ["Bjørn Lomborg", "Andrew Revkin"],
  410: ["Ben Shapiro", "Destiny"],
  418: ["Norman Finkelstein", "Benny Morris", "Mouin Rabbani", "Destiny"],
  438: ["Elon Musk", "DJ Seo", "Matthew MacDougall", "Bliss Chapman", "Noland Arbaugh"],
  447: ["Michael Truell", "Arvid Lunnemark", "Aman Sanger", "Sualeh Asif"],
};

/** The individual guests of an episode: "Michael Malice and Yaron Brook" -> ["Michael Malice", "Yaron Brook"]. */
export function guestNames(guest: string, episodeNumber: number | null): string[] {
  const known = episodeNumber ? GUESTS_BY_EPISODE[episodeNumber] : undefined;
  if (known) return known;
  return guest
    .split(/,\s*|\s+(?:and|&|vs\.?)\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
}
