type ImportedMessage = { role: "user" | "assistant"; content: string; reasoning?: string; ts?: number };
type ExportedChat = Record<string, unknown> & { messages: unknown[] };

function isExportedChat(value: unknown): value is ExportedChat {
  return !!value && typeof value === "object" && "messages" in value && Array.isArray(value.messages);
}

export function readNexusExport(source: string, filename: string): object[] {
  if (filename.toLowerCase().endsWith(".md")) return [parseMarkdownExport(source)];
  let payload;
  try {
    payload = JSON.parse(source);
  } catch {
    throw new Error("Die Datei enthält kein gültiges Nexus-JSON.");
  }
  const chats: unknown[] = Array.isArray(payload) ? payload : Array.isArray(payload?.chats) ? payload.chats : [payload];
  if (!chats.length || !chats.every(isExportedChat)) {
    throw new Error("Die Datei enthält keine Nexus-Chats.");
  }
  return chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map((message: unknown) => sanitizeRecord(message)).filter(Boolean),
  }));
}

function sanitizeRecord(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  const safe = { ...message };
  for (const key of ["tool_calls", "generatedImages", "sources", "followups", "annotations", "images"] as const) {
    if (Array.isArray(message[key])) {
      safe[key] = (message[key] as unknown[]).filter((entry) => key === "followups" || key === "images"
        ? typeof entry === "string"
        : entry !== null && typeof entry === "object");
    } else {
      delete safe[key];
    }
  }
  if (safe.audio && (typeof safe.audio !== "object" || Array.isArray(safe.audio))) delete safe.audio;
  return safe;
}

function parseMarkdownExport(source: string) {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const title = /^# (.+)$/.exec(lines[0] ?? "")?.[1];
  const model = /^\*\*Modell:\*\* (\S+)$/.exec(lines.find((line) => line.startsWith("**Modell:** ")) ?? "")?.[1];
  if (!title || !model) throw new Error("Erwartet wird ein mit Nexus exportierter Markdown-Chat.");

  const messages: ImportedMessage[] = [];
  let current: ImportedMessage | undefined;
  let body: string[] = [];
  let fence = "";
  let pendingReasoning: string | undefined;
  let reasoning: string[] | undefined;
  function finishMessage() {
    if (current) {
      while (body.at(-1)?.trim() === "") body.pop();
      if (body.at(-1) === "---") body.pop();
      current.content = body.join("\n").trim();
      messages.push(current);
    }
    body = [];
    current = undefined;
  }

  for (const line of lines.slice(1)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = "";
    } else if (marker) {
      fence = marker[1];
    } else if (line === "<details><summary>Denkprozess</summary>") {
      finishMessage();
      reasoning = [];
      continue;
    } else if (line === "</details>" && reasoning) {
      pendingReasoning = reasoning.join("\n").trim();
      reasoning = undefined;
      continue;
    } else if (!reasoning && (line === "### Du" || line === "### Assistent")) {
      finishMessage();
      const role = line === "### Du" ? "user" : "assistant";
      current = { role, content: "", ...(role === "assistant" && pendingReasoning ? { reasoning: pendingReasoning } : {}) };
      pendingReasoning = undefined;
      continue;
    }
    if (reasoning) reasoning.push(line);
    else if (current) body.push(line);
  }
  finishMessage();
  if (!messages.length) throw new Error("Der Markdown-Export enthält keine Nachrichten.");
  return { title, model, messages };
}
