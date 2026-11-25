const IMAGE_MD_RE = /!\[[^\]]*]\([^)]*\)/;

/** Body must have non-empty plain text and/or at least one image markdown. */
export function assertBodyRequired(body: string): string {
  const trimmed = body.replace(/\r\n/g, "\n").trim();
  if (!trimmed) {
    throw new Error("正文不能为空");
  }
  const hasText = bodyPlainText(trimmed).length > 0;
  const hasImage = IMAGE_MD_RE.test(trimmed);
  if (!hasText && !hasImage) {
    throw new Error("正文不能为空");
  }
  return trimmed;
}

/**
 * Resolve list title: user title if non-blank, else first 8 Unicode chars of
 * body plain text (ignore image markdown), else 「未命名」.
 */
export function resolveTitle(userTitle: string, body: string): string {
  const explicit = userTitle.trim();
  if (explicit) return explicit;

  const plain = bodyPlainText(body);
  if (!plain) return "未命名";
  return [...plain].slice(0, 8).join("");
}

export function bodyHasImage(body: string): boolean {
  return IMAGE_MD_RE.test(body);
}

function bodyPlainText(body: string): string {
  return body
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .trim();
}
