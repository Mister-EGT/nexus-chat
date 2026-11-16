export type DiffDecision = "accepted" | "rejected" | "pending";
export type DiffLine = { type: "add" | "remove" | "context" | "note"; text: string };
export type DiffHunk = { oldStart: number | null; newStart: number | null; heading: string; lines: DiffLine[] };
export type DiffFile = { path: string; kind: "modified" | "created" | "deleted"; hunks: DiffHunk[] };

function filePath(header: string, prefix: string) {
  let path = header.slice(4).split("\t", 1)[0].trim();
  if (path.startsWith('"') && path.endsWith('"')) {
    try { path = JSON.parse(path); } catch { path = path.slice(1, -1); }
  }
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function patchLine(text: string): DiffLine | null {
  if (text.startsWith("\\")) return { type: "note", text };
  if (text.startsWith("+")) return { type: "add", text: text.slice(1) };
  if (text.startsWith("-")) return { type: "remove", text: text.slice(1) };
  if (text.startsWith(" ")) return { type: "context", text: text.slice(1) };
  return null;
}

export function parseDiff(patch: string): DiffFile[] | null {
  if (patch.length > 200_000) return null;
  const lines = patch.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  if (lines.length > 2000) return null;
  if (lines[0] === "*** Begin Patch") return parseApplyPatch(lines);

  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index++];
    if (line.startsWith("diff --git ")) {
      file = undefined;
    } else if (line.startsWith("--- ") && lines[index]?.startsWith("+++ ")) {
      const oldPath = filePath(line, "a/");
      const newPath = filePath(lines[index++], "b/");
      if (!oldPath || !newPath || oldPath === "/dev/null" && newPath === "/dev/null") return null;
      file = { path: newPath === "/dev/null" ? oldPath : newPath, kind: oldPath === "/dev/null" ? "created" : newPath === "/dev/null" ? "deleted" : "modified", hunks: [] };
      files.push(file);
    } else if (line.startsWith("@@ ")) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
      if (!match) return null;
      const hunk: DiffHunk = { oldStart: Number(match[1]), newStart: Number(match[3]), heading: match[5].trim(), lines: [] };
      let oldLeft = Number(match[2] ?? 1);
      let newLeft = Number(match[4] ?? 1);
      while ((oldLeft || newLeft) && index < lines.length) {
        const item = patchLine(lines[index++]);
        if (!item) return null;
        if (item.type === "context" || item.type === "remove") oldLeft--;
        if (item.type === "context" || item.type === "add") newLeft--;
        if (oldLeft < 0 || newLeft < 0) return null;
        hunk.lines.push(item);
      }
      if (oldLeft || newLeft) return null;
      if (lines[index]?.startsWith("\\")) hunk.lines.push({ type: "note", text: lines[index++] });
      if (!file) {
        file = { path: "Unbenannter Patch", kind: "modified", hunks: [] };
        files.push(file);
      }
      file.hunks.push(hunk);
    } else if (line.trim() && !/^(?:index |(?:old|new|deleted file|new file) mode |similarity index |rename (?:from|to) )/.test(line)) {
      return null;
    }
  }
  return files.length && files.every((item) => item.hunks.length) ? files : null;
}

function parseApplyPatch(lines: string[]): DiffFile[] | null {
  if (lines.at(-1) !== "*** End Patch") return null;
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let hunk: DiffHunk | undefined;
  for (const line of lines.slice(1, -1)) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(line);
    if (header) {
      const kind = header[1] === "Add" ? "created" : header[1] === "Delete" ? "deleted" : "modified";
      file = { path: header[2], kind, hunks: [] };
      files.push(file);
      hunk = undefined;
      continue;
    }
    if (!file) return null;
    if (line.startsWith("*** Move to: ") && file.kind === "modified") {
      file.path += ` → ${line.slice(13)}`;
      continue;
    }
    if (line === "*** End of File") continue;
    if (line === "@@" || line.startsWith("@@ ")) {
      hunk = { oldStart: null, newStart: null, heading: line.slice(2).trim(), lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    const item = patchLine(line);
    if (!item || file.kind === "deleted" || file.kind === "created" && item.type !== "add") return null;
    if (!hunk) {
      hunk = { oldStart: null, newStart: file.kind === "created" ? 1 : null, heading: "", lines: [] };
      file.hunks.push(hunk);
    }
    hunk.lines.push(item);
  }
  return files.length && files.every((item) => item.kind !== "modified" || item.hunks.some(({ lines: rows }) => rows.length)) ? files : null;
}

export function responsePatch(output: unknown) {
  if (!Array.isArray(output)) return null;
  const operations = output.flatMap((item) => {
    if (item?.type !== "apply_patch_call" || item.status !== "completed") return [];
    const { type, path, diff } = item.operation ?? {};
    if (typeof path !== "string" || !path.trim() || /[\r\n]/.test(path)) return [];
    const kind = type === "create_file" ? "Add" : type === "update_file" ? "Update" : type === "delete_file" ? "Delete" : null;
    if (!kind || kind !== "Delete" && typeof diff !== "string") return [];
    const contents = kind === "Delete" ? "" : diff.replace(/\r\n?/g, "\n").replace(/\n$/, "");
    return [`*** ${kind} File: ${path}`, ...(contents ? [contents] : [])];
  });
  return operations.length ? ["*** Begin Patch", ...operations, "*** End Patch"].join("\n") : null;
}
