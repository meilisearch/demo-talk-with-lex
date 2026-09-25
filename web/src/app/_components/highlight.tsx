const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Renders Meilisearch `_formatted` text: escapes it, then turns the sentinel tags into <mark>. */
export function Highlight({ value, className }: { value: string | undefined; className?: string }) {
  if (!value) return null;
  const html = escapeHtml(value).replaceAll("__HL__", "<mark>").replaceAll("__/HL__", "</mark>");
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
