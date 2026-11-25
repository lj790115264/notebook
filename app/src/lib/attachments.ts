import {
  exists,
  mkdir,
  readDir,
  readFile,
  writeFile,
} from "@tauri-apps/plugin-fs";
import { joinPath } from "./path";

export interface BodyImageRef {
  alt: string;
  /** Path as written in markdown, e.g. ../attachments/task-x/img-001.png */
  mdPath: string;
}

const IMG_RE = /!\[([^\]]*)]\(([^)]+)\)/g;

export function listBodyImages(body: string): BodyImageRef[] {
  const out: BodyImageRef[] = [];
  for (const m of body.matchAll(IMG_RE)) {
    out.push({ alt: m[1] || "image", mdPath: m[2].trim() });
  }
  return out;
}

/** Absolute path for a body-relative attachment path. */
export function resolveAttachmentPath(
  workspacePath: string,
  mdPath: string,
): string {
  // Stored as ../attachments/... relative to days/
  const cleaned = mdPath.replace(/^\.\.\//, "").replace(/\//g, "\\");
  return joinPath(workspacePath, ...cleaned.split(/[\\/]/).filter(Boolean));
}

export async function savePastedImage(
  workspacePath: string,
  taskId: string,
  bytes: Uint8Array,
  ext: string,
): Promise<{ mdSnippet: string; absPath: string }> {
  const safeExt = normalizeExt(ext);
  const dirAbs = joinPath(workspacePath, "attachments", taskId);
  if (!(await exists(dirAbs))) {
    await mkdir(dirAbs, { recursive: true });
  }

  const name = await nextImageName(dirAbs, safeExt);
  const absPath = joinPath(dirAbs, name);
  await writeFile(absPath, bytes);

  const mdPath = `../attachments/${taskId}/${name}`.replace(/\\/g, "/");
  const mdSnippet = `![${name}](${mdPath})`;
  return { mdSnippet, absPath };
}

export async function readAttachmentBytes(
  workspacePath: string,
  mdPath: string,
): Promise<Uint8Array> {
  const abs = resolveAttachmentPath(workspacePath, mdPath);
  return readFile(abs);
}

async function nextImageName(dirAbs: string, ext: string): Promise<string> {
  let max = 0;
  try {
    const entries = await readDir(dirAbs);
    for (const e of entries) {
      const n = e.name ?? "";
      const m = /^img-(\d+)\./i.exec(n);
      if (m) {
        const num = Number(m[1]);
        if (Number.isFinite(num) && num > max) max = num;
      }
    }
  } catch {
    // empty dir
  }
  return `img-${String(max + 1).padStart(3, "0")}.${ext}`;
}

function normalizeExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "jpeg") return "jpg";
  if (e === "png" || e === "jpg" || e === "webp" || e === "gif") return e;
  return "png";
}

export function mimeToExt(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "png";
}
