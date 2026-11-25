/** Simple join for Windows / Unix paths from dialog. */
export function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes("\\") ? "\\" : "/";
  let out = base.replace(/[\\/]+$/, "");
  for (const part of parts) {
    out += sep + part.replace(/^[\\/]+/, "");
  }
  return out;
}
