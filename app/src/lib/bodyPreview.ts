/** First N non-empty body lines for list cards (images stripped). */
export function bodyListPreview(body: string, maxLines = 2): string {
  const lines = body
    .replace(/\r\n/g, "\n")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "（图片）";
  return lines.slice(0, maxLines).join("\n");
}
