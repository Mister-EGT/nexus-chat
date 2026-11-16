import { openNativeDialog } from "./overlay";
import { applyDocumentTheme, platformModifier } from "./theme";
import { collectActivity, mergeActivity } from "./activity.ts";
import { createStreamPresenter, patchMarkdown, promoteMessageShell, createScrollFollower, scrollImmediately, preserveCompletedScroll } from "./stream-presentation.ts";
import { tokenPrices, compareTokenPrices, distinctAnswer } from "./pricing.ts";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { marked } from "marked";
import { responsePatch } from "./diff.ts";
import { citationSources, normalizeCitations } from "./openrouter-sources.ts";

let studioViews;
let welcomeCleanup;
let composerCleanup;
let messageCleanups = [];
let activityView;
let streamPresenter;
let streamScroll;
let completionScrollCleanup;
let streamFinishing = false;
let contextView;
let activity;
let liveBeforeDemo;

// src/core/utils.js
var $ = (s, p) => (p || document).querySelector(s);
var $$ = (s, p) => [...(p || document).querySelectorAll(s)];
var uuid = () => window.crypto && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
  const r = Math.random() * 16 | 0;
  const v = c === "x" ? r : r & 3 | 8;
  return v.toString(16);
});
var esc = (s) => {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
};
var escAttr = (s) => esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") e.className = v;
    else if (k === "innerHTML") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === "string") e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}
function formatCost(n) {
  if (!n || n <= 0) return "$0.00";
  if (n < 1e-4) return "< $0.0001";
  return "$" + n.toFixed(4);
}
function formatTokens(n) {
  if (!n) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}
function formatDate(ts) {
  const d = new Date(ts);
  const now = /* @__PURE__ */ new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("de", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("de", { day: "numeric", month: "short" });
}
function toast(msg, type = "info") {
  const c = document.getElementById("toasts");
  const t = el("div", {
    className: `toast ${type}`,
    role: type === "error" ? "alert" : "status",
    "aria-live": type === "error" ? "assertive" : "polite"
  });
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(10px)";
    setTimeout(() => t.remove(), 300);
  }, 3500);
}
function isQuotaExceededError(err) {
  return err && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" || err.code === 22 || err.code === 1014);
}
function notifyStorageError(err) {
  const message = isQuotaExceededError(err) ? "Speicher ist voll. Lösche alte Chats oder entferne große Anhänge." : "Speichern fehlgeschlagen. Lokale Browserdaten konnten nicht aktualisiert werden.";
  toast(message, "error");
}
function showConfirmModal({ title, message, confirmText = "OK", danger = false, onConfirm }) {
  const modal = el("dialog", {
    className: "modal",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "confirm-title",
    tabIndex: "-1"
  });
  modal.innerHTML = `
  <h2 id="confirm-title">${esc(title)}</h2>
  <p class="modal-desc">${esc(message)}</p>
  <div class="modal-btns">
    <button class="btn-cancel" type="button">Abbrechen</button>
    <button class="${danger ? "btn-danger" : "btn-confirm"}" type="button">${esc(confirmText)}</button>
  </div>
`;
  document.body.appendChild(modal);
  let restoreFocus = () => {
  };
  const close = () => {
    restoreFocus();
    modal.remove();
  };
  const controller = openNativeDialog(modal, close);
  restoreFocus = () => controller.dispose();
  modal.querySelector(".btn-cancel").onclick = close;
  modal.querySelector(danger ? ".btn-danger" : ".btn-confirm").onclick = () => {
    close();
    if (onConfirm) onConfirm();
  };
  setTimeout(() => {
    const target = danger ? modal.querySelector(".btn-cancel") : modal.querySelector(".btn-confirm");
    (target || modal).focus();
  }, 30);
}
function isMobile() {
  return window.innerWidth <= 768;
}
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}
function isNearBottom(elem, threshold = 120) {
  if (!elem) return true;
  return elem.scrollHeight - elem.scrollTop - elem.clientHeight < threshold;
}
function scrollToBottom(elem, smooth = false) {
  if (!elem) return;
  if (smooth) elem.scrollTo({ top: elem.scrollHeight, behavior: "smooth" });
  else elem.scrollTop = elem.scrollHeight;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 200);
}
function storageArea(area) {
  try {
    return typeof area === "string" ? window[area] : area;
  } catch {
    return null;
  }
}
function storageGet(area, key) {
  try {
    return storageArea(area)?.getItem(key) || "";
  } catch {
    return "";
  }
}
function storageSet(area, key, value) {
  try {
    storageArea(area)?.setItem(key, value);
    return true;
  } catch (err) {
    notifyStorageError(err);
    return false;
  }
}
function storageRemove(area, key) {
  try {
    storageArea(area)?.removeItem(key);
  } catch {
  }
}
function safeJson(key, fallback) {
  try {
    const raw = storageGet("localStorage", key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Ungültige lokale Daten in ${key}:`, err);
    storageRemove("localStorage", key);
    return fallback;
  }
}
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (err) {
    console.error("Kopieren fehlgeschlagen:", err);
    return false;
  }
}

// src/api/models.js
var API_BASE = "https://openrouter.ai/api/v1";
var STANDARD_CHAT_PARAMS = /* @__PURE__ */ new Set([
  "temperature",
  "top_p",
  "max_tokens",
  "presence_penalty",
  "frequency_penalty"
]);
var REASONING_PARAMS = /* @__PURE__ */ new Set(["reasoning", "include_reasoning", "reasoning_effort", "reasoning_tokens"]);
var KNOWN_REASONING_MODEL_RE = /\b(o1|o3|o4|gpt-5|gpt-4\.1|claude-3\.7|claude-4|gemini-2\.5|deepseek-r1|qwq|qwen3|grok-3|reasoning)\b/i;
async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15e3) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = response.ok ? await response.json() : null;
    return { response, data };
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("OpenRouter antwortet nicht rechtzeitig. Bitte erneut versuchen.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
async function fetchModels() {
  if (store.demoMode) return store.models;
  const { response: r, data: j } = await fetchJsonWithTimeout(`${API_BASE}/models`);
  if (!r.ok) throw new Error(`Fehler ${r.status}: ${r.statusText}`);
  const catalogue = j.data || [];
  store.models = catalogue.filter((m) => store.settings.showFreeModels || !isFreeModel(m));
  store.modelMap = {};
  catalogue.forEach((m) => store.modelMap[m.id] = m);
  store.favModels = store.favModels.filter((id) => store.modelMap[id]);
  return store.models;
}
function modelEndpointPath(modelId) {
  return String(modelId || "").split("/").map(encodeURIComponent).join("/");
}
function normalizeEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== "object") return null;
  const tag = String(endpoint.tag || endpoint.provider_slug || endpoint.provider || "").trim();
  if (!tag) return null;
  return {
    ...endpoint,
    tag,
    provider_name: String(endpoint.provider_name || endpoint.providerName || endpoint.name || tag),
    name: String(endpoint.name || endpoint.model_name || endpoint.provider_name || tag),
    status: Number.isFinite(Number(endpoint.status)) ? Number(endpoint.status) : 0
  };
}
async function fetchModelEndpoints(modelId, force = false) {
  if (!modelId) return [];
  if (!force && Array.isArray(store.endpointMap[modelId])) return store.endpointMap[modelId];
  delete store.endpointErrors[modelId];
  const headers = store.apiKey ? { "Authorization": `Bearer ${store.apiKey}` } : {};
  const { response: r, data: j } = await fetchJsonWithTimeout(`${API_BASE}/models/${modelEndpointPath(modelId)}/endpoints`, { headers });
  if (!r.ok) throw new Error(`Fehler ${r.status}: ${r.statusText}`);
  const endpoints = (j.data?.endpoints || []).map(normalizeEndpoint).filter(Boolean).sort((a, b) => {
    const sa = a.status || 0;
    const sb = b.status || 0;
    if (sa !== sb) return sa - sb;
    return a.provider_name.localeCompare(b.provider_name);
  });
  store.endpointMap[modelId] = endpoints;
  return endpoints;
}
function isFreeModel(model) {
  if (!model) return false;
  const id = String(model.id || "").toLowerCase();
  const name = String(model.name || "").toLowerCase();
  const prompt = Number.parseFloat(model.pricing?.prompt);
  const completion = Number.parseFloat(model.pricing?.completion);
  const explicitlyFree = id.endsWith(":free") || /\bfree\b/.test(name);
  const pricedAsFree = Number.isFinite(prompt) && Number.isFinite(completion) && prompt === 0 && completion === 0;
  return explicitlyFree || pricedAsFree;
}
function pickDefaultModel() {
  return store.models.find((m) => m.id === "openai/gpt-4o-mini")?.id || store.models[0]?.id || "openrouter/auto";
}
function ensureChatModelAvailable(chat) {
  if (!chat) return null;
  if (!store.models.length) return store.modelMap[chat.model] || null;
  if (!store.modelMap[chat.model]) {
    chat.model = pickDefaultModel();
    chat.providerTag = null;
    chat.providerName = null;
  }
  return store.modelMap[chat.model] || null;
}
async function validateKey(key) {
  try {
    const { response: r } = await fetchJsonWithTimeout(`${API_BASE}/key`, { headers: { "Authorization": `Bearer ${key}` } });
    if (r.ok) return true;
    return r.status === 401 ? false : null;
  } catch {
    return null;
  }
}

// src/api/options.js
var OPENROUTER_DEFAULTS = {
  webSearch: false,
  webEngine: "auto",
  webResults: 5,
  searchContext: "medium",
  allowedDomains: "",
  excludedDomains: "",
  webFetch: false,
  datetime: false,
  output: "text",
  schema: '{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}',
  healing: false,
  pdfEngine: "auto",
  outputMedia: "text",
  imageConfig: "{}",
  audioVoice: "alloy",
  audioFormat: "mp3",
  providerSort: "auto",
  allowFallbacks: true,
  requireParameters: false,
  zdr: false,
  dataCollection: "allow",
  providerOrder: "",
  providerOnly: "",
  providerIgnore: "",
  quantizations: "",
  maxPromptPrice: "",
  maxCompletionPrice: "",
  fallbackModels: "",
  reasoningBudget: 0,
  reasoningExclude: false,
  reasoningSummary: "auto",
  seed: "",
  topK: "",
  minP: "",
  topA: "",
  repetitionPenalty: "",
  stop: "",
  logprobs: false,
  topLogprobs: "",
  serviceTier: "auto",
  tools: "[]",
  toolChoice: "auto",
  parallelTools: true,
  maxToolCalls: 5,
  extra: "{}"
};
function normalizeOpenRouterSettings(raw) {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(Object.entries(OPENROUTER_DEFAULTS).map(([key, fallback]) => {
    const input = value[key];
    return [key, typeof input === typeof fallback && (typeof input !== "number" || Number.isFinite(input)) ? input : fallback];
  }));
}
var splitList = (value) => String(value || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
function parseJSON(value, label, expected = "object") {
  let parsed;
  try {
    parsed = typeof value === "string" ? JSON.parse(value || (expected === "array" ? "[]" : "{}")) : value;
  } catch {
    throw new Error(`${label}: ungültiges JSON.`);
  }
  if (expected === "array" ? !Array.isArray(parsed) : !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label}: ${expected === "array" ? "eine Liste" : "ein Objekt"} erwartet.`);
  }
  return parsed;
}
function supportsOutput(model, kind) {
  return (model?.architecture?.output_modalities || ["text"]).includes(kind);
}
function buildOpenRouterOptions(raw, model, { providerTag = "", sessionId = "" } = {}) {
  const s = normalizeOpenRouterSettings(raw);
  const body = {};
  const supported = model?.supported_parameters;
  const supports = (name) => !Array.isArray(supported) || supported.includes(name);
  const tools = parseJSON(s.tools, "Werkzeuge", "array");
  if (tools.some((tool) => !tool || typeof tool.type !== "string")) throw new Error("Jedes Werkzeug braucht einen gültigen Typ.");
  if (s.webSearch && !tools.some((tool) => tool.type === "openrouter:web_search")) {
    const allowed = splitList(s.allowedDomains);
    const excluded = splitList(s.excludedDomains);
    const engine = s.webEngine === "auto" && allowed.length && excluded.length ? "exa" : s.webEngine;
    if (allowed.length && excluded.length && engine !== "exa") throw new Error("Diese Suchmaschine unterstützt nur eine Domain-Liste gleichzeitig. Wähle Auto oder Exa, um beide zu verwenden.");
    tools.push({ type: "openrouter:web_search", parameters: {
      engine,
      max_results: Math.min(engine === "perplexity" ? 20 : 25, Math.max(1, Math.trunc(s.webResults))),
      search_context_size: s.searchContext,
      ...(allowed.length ? { allowed_domains: allowed } : {}),
      ...(excluded.length ? { excluded_domains: excluded } : {})
    } });
  }
  if (s.webFetch) tools.push({ type: "openrouter:web_fetch" });
  if (s.datetime) tools.push({ type: "openrouter:datetime" });
  const hasFunctions = tools.some((tool) => tool.type === "function");
  if (hasFunctions && !supports("tools")) throw new Error("Das Modell unterstützt keine eigenen Funktionswerkzeuge. Bitte ein Modell mit Tool Calling wählen.");
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = s.toolChoice;
    if (hasFunctions) body.parallel_tool_calls = s.parallelTools;
    body.max_tool_calls = Math.max(1, Math.min(100, Math.trunc(s.maxToolCalls)));
  }
  if (s.output !== "text") {
    if (!supports("response_format")) throw new Error("Das Modell unterstützt keine strukturierten Antworten.");
    body.response_format = s.output === "json_schema" ? { type: "json_schema", json_schema: { name: "nexus_response", strict: true, schema: parseJSON(s.schema, "Antwortschema") } } : { type: "json_object" };
  }
  const plugins = [];
  if (s.healing && s.output !== "text") plugins.push({ id: "response-healing" });
  if (s.pdfEngine !== "auto") plugins.push({ id: "file-parser", pdf: { engine: s.pdfEngine } });
  if (plugins.length) body.plugins = plugins;
  if (s.outputMedia !== "text") {
    if (!supportsOutput(model, s.outputMedia)) throw new Error(`Das gewählte Modell liefert keine ${s.outputMedia === "image" ? "Bilder" : "Audioantworten"}.`);
    body.modalities = ["text", s.outputMedia];
    if (s.outputMedia === "image") body.image_config = parseJSON(s.imageConfig, "Bildeinstellungen");
    if (s.outputMedia === "audio") body.audio = { voice: s.audioVoice, format: s.audioFormat };
  }
  const provider = {};
  if (s.providerSort !== "auto") provider.sort = s.providerSort;
  if (!s.allowFallbacks) provider.allow_fallbacks = false;
  if (s.requireParameters) provider.require_parameters = true;
  if (s.zdr) provider.zdr = true;
  if (s.dataCollection === "deny") provider.data_collection = "deny";
  for (const [key, value] of [["order", s.providerOrder], ["only", s.providerOnly], ["ignore", s.providerIgnore], ["quantizations", s.quantizations]]) {
    const list = splitList(value);
    if (list.length) provider[key] = list;
  }
  if (s.maxPromptPrice !== "" || s.maxCompletionPrice !== "") {
    provider.max_price = {};
    for (const [key, value] of [["prompt", s.maxPromptPrice], ["completion", s.maxCompletionPrice]]) {
      if (value !== "") {
        if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error("Preisgrenzen müssen positive Zahlen oder null sein.");
        provider.max_price[key] = String(value);
      }
    }
  }
  if (providerTag) Object.assign(provider, { order: [providerTag], only: [providerTag], allow_fallbacks: false });
  if (Object.keys(provider).length) body.provider = provider;
  const fallback = splitList(s.fallbackModels);
  if (fallback.length) body.models = [model?.id, ...fallback].filter(Boolean);
  if (sessionId) body.session_id = sessionId;
  for (const [name, value, min, max, integer] of [
    ["seed", s.seed, -2147483648, 2147483647, true],
    ["top_k", s.topK, 0, 1e5, true],
    ["min_p", s.minP, 0, 1],
    ["top_a", s.topA, 0, 1],
    ["repetition_penalty", s.repetitionPenalty, 0, 2],
    ["top_logprobs", s.topLogprobs, 0, 20, true]
  ]) {
    if (value === "" || !supports(name)) continue;
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max || integer && !Number.isInteger(number)) throw new Error(`Ungültiger Wert für ${name}.`);
    body[name] = number;
  }
  const stop = String(s.stop || "").split("\n").filter(Boolean);
  if (stop.length > 4) throw new Error("Maximal vier Stoppsequenzen sind erlaubt.");
  if (stop.length && supports("stop")) body.stop = stop;
  if (s.logprobs && supports("logprobs")) body.logprobs = true;
  if (s.serviceTier !== "auto") body.service_tier = s.serviceTier;
  const extra = parseJSON(s.extra, "Zusätzliche Optionen");
  const protectedKeys = /* @__PURE__ */ new Set(["messages", "model", "stream", "authorization", "apiKey", "__proto__", "constructor", "prototype"]);
  for (const key of Object.keys(extra)) if (protectedKeys.has(key)) throw new Error(`${key} wird von Nexus verwaltet und kann hier nicht überschrieben werden.`);
  return { ...body, ...extra };
}

// src/core/media-store.js
var databasePromise;
function database() {
  return databasePromise || (databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("nexus-media", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("attachments");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    databasePromise = null;
    throw error;
  }));
}
async function persistAttachment(attachment, field = "data") {
  if (!attachment[field]) return attachment;
  const db = await database();
  const id = crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("attachments", "readwrite");
    tx.objectStore("attachments").put(attachment[field], id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return { ...attachment, storageId: id, ...field === "url" ? { storageField: "url" } : {} };
}
function chatStorageJSON(chats) {
  return JSON.stringify(chats, (_, value) => value && typeof value === "object" && value.storageId ? { ...value, [value.storageField === "url" ? "url" : "data"]: void 0 } : value);
}
async function hydrateChatMedia(chats) {
  const attachments = chats.flatMap((chat) => chat.messages.flatMap((message) => [...message.attachments || [], ...(message.generatedImages || []).map((image) => image.image_url), ...message.audio ? [message.audio] : []])).filter((file) => file?.storageId && !file[file.storageField === "url" ? "url" : "data"]);
  if (!attachments.length) return;
  const db = await database();
  await Promise.all(attachments.map(async (attachment) => {
    const data = await new Promise((resolve, reject) => {
      const request = db.transaction("attachments").objectStore("attachments").get(attachment.storageId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (data) attachment[attachment.storageField === "url" ? "url" : "data"] = data;
  }));
}
function exportableChats(chats) {
  return JSON.parse(JSON.stringify(chats, (_, value) => value && typeof value === "object" && value.storageId ? { ...value, storageId: void 0, storageField: void 0 } : value));
}
async function persistMessageMedia(message) {
  for (const image of message.generatedImages || []) if (image.image_url?.url?.startsWith("data:") && !image.image_url.storageId) image.image_url = await persistAttachment(image.image_url, "url");
  if (message.audio?.data && !message.audio.storageId) message.audio = await persistAttachment(message.audio);
  for (let i = 0; i < (message.attachments || []).length; i++) {
    const file = message.attachments[i];
    if (file.data && !file.storageId) message.attachments[i] = await persistAttachment(file);
  }
  return message;
}

// src/core/store.js
var DEFAULT_SETTINGS = {
  systemPrompt: "",
  temperature: 1,
  topP: 1,
  maxTokens: 0,
  presencePenalty: 0,
  frequencyPenalty: 0,
  streaming: true,
  autoScroll: true,
  theme: "system",
  keyStorage: "session",
  showDebug: false,
  showTokens: true,
  showCosts: true,
  sidebarOpen: true,
  reasoningEnabled: false,
  reasoningEffort: "medium",
  reasoningMode: "off",
  modelSort: "name",
  showFreeModels: false,
  openrouter: normalizeOpenRouterSettings()
};
var CONTEXT_SAFETY_RATIO = 0.82;
var CONTEXT_TOKEN_RESERVE = 1200;
var REASONING_MODES = ["off", "auto", "minimal", "low", "medium", "high", "xhigh", "max"];
var REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];
var REASONING_TAG_NAMES = ["think", "thinking", "thought", "thoughts", "reasoning", "analysis"];
var REASONING_OPEN_TAGS = REASONING_TAG_NAMES.map((name) => `<${name}>`);
var REASONING_CLOSE_TAGS = REASONING_TAG_NAMES.map((name) => `</${name}>`);
function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...raw && typeof raw === "object" ? raw : {} };
  s.temperature = clampNumber(s.temperature, DEFAULT_SETTINGS.temperature, 0, 2);
  s.topP = clampNumber(s.topP, DEFAULT_SETTINGS.topP, 0, 1);
  s.maxTokens = Math.round(clampNumber(s.maxTokens, DEFAULT_SETTINGS.maxTokens, 0, 16384));
  s.presencePenalty = clampNumber(s.presencePenalty, DEFAULT_SETTINGS.presencePenalty, -2, 2);
  s.frequencyPenalty = clampNumber(s.frequencyPenalty, DEFAULT_SETTINGS.frequencyPenalty, -2, 2);
  s.streaming = Boolean(s.streaming);
  s.autoScroll = Boolean(s.autoScroll);
  s.showDebug = Boolean(s.showDebug);
  s.showTokens = Boolean(s.showTokens);
  s.showCosts = Boolean(s.showCosts);
  s.sidebarOpen = s.sidebarOpen !== false;
  s.showFreeModels = Boolean(s.showFreeModels);
  if (!["system", "dark", "light"].includes(s.theme)) s.theme = DEFAULT_SETTINGS.theme;
  if (!["session", "local"].includes(s.keyStorage)) s.keyStorage = DEFAULT_SETTINGS.keyStorage;
  if (!["low", "medium", "high"].includes(s.reasoningEffort)) s.reasoningEffort = DEFAULT_SETTINGS.reasoningEffort;
  const rawReasoningMode = raw && Object.prototype.hasOwnProperty.call(raw, "reasoningMode") ? raw.reasoningMode : null;
  s.reasoningMode = REASONING_MODES.includes(rawReasoningMode) ? rawReasoningMode : Boolean(raw?.reasoningEnabled) ? ["low", "medium", "high"].includes(raw?.reasoningEffort) ? raw.reasoningEffort : DEFAULT_SETTINGS.reasoningEffort : DEFAULT_SETTINGS.reasoningMode;
  s.reasoningEnabled = s.reasoningMode !== "off";
  s.reasoningEffort = REASONING_EFFORTS.includes(s.reasoningMode) ? s.reasoningMode : DEFAULT_SETTINGS.reasoningEffort;
  if (s.modelSort === "cost") s.modelSort = "price-asc";
  if (s.modelSort === "context") s.modelSort = "ctx-desc";
  if (!["name", "price-asc", "price-desc", "ctx-desc", "newest"].includes(s.modelSort)) s.modelSort = DEFAULT_SETTINGS.modelSort;
  s.systemPrompt = String(s.systemPrompt || "");
  s.openrouter = normalizeOpenRouterSettings(s.openrouter);
  return s;
}
function normalizeStringArray(value) {
  return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
}
function normalizeReasoningDetails(value) {
  const details = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return details.map((detail) => {
    if (!detail || typeof detail !== "object") return null;
    try {
      return JSON.parse(JSON.stringify(detail));
    } catch {
      return null;
    }
  }).filter(Boolean);
}
function stringifyUnknownContent(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyUnknownContent).filter(Boolean).join("");
  if (typeof value === "object") {
    if (value.text != null) return stringifyUnknownContent(value.text);
    if (value.content != null) return stringifyUnknownContent(value.content);
    if (value.message != null) return stringifyUnknownContent(value.message);
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}
function normalizeMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  const role = ["user", "assistant", "system", "tool"].includes(msg.role) ? msg.role : "assistant";
  const normalized = {
    ...msg,
    id: msg.id || uuid(),
    role,
    model: typeof msg.model === "string" ? msg.model : undefined,
    content: stringifyUnknownContent(msg.content),
    ts: Number.isFinite(Number(msg.ts)) ? Number(msg.ts) : Date.now()
  };
  if (msg.reasoning != null) normalized.reasoning = stringifyUnknownContent(msg.reasoning);
  const reasoningDetails = normalizeReasoningDetails(msg.reasoning_details || msg.reasoningDetails);
  if (reasoningDetails.length) normalized.reasoning_details = reasoningDetails;
  if (msg.providerTag || msg.provider) normalized.providerTag = String(msg.providerTag || msg.provider);
  if (msg.providerName) normalized.providerName = String(msg.providerName);
  if (msg.images) normalized.images = Array.isArray(msg.images) ? msg.images.filter(Boolean) : [];
  if (msg.attachments) normalized.attachments = Array.isArray(msg.attachments) ? msg.attachments.filter((att) => att && typeof att === "object").map((att) => ({
    kind: ["image", "pdf", "audio", "video"].includes(att.kind) ? att.kind : "text",
    name: String(att.name || "Datei"),
    type: String(att.type || ""),
    size: Math.max(0, Number(att.size) || 0),
    data: att.data ? String(att.data) : void 0,
    text: att.text ? String(att.text) : void 0,
    truncated: Boolean(att.truncated),
    format: att.format ? String(att.format) : void 0,
    storageId: att.storageId ? String(att.storageId) : void 0
  })) : [];
  return normalized;
}
function normalizeChats(value) {
  if (!Array.isArray(value)) return [];
  return value.map((chat) => {
    if (!chat || typeof chat !== "object") return null;
    const messages = Array.isArray(chat.messages) ? chat.messages.map(normalizeMessage).filter(Boolean) : [];
    return {
      ...chat,
      id: chat.id || uuid(),
      title: String(chat.title || "Neuer Chat"),
      model: String(chat.model || "openrouter/auto"),
      messages,
      createdAt: Number.isFinite(Number(chat.createdAt)) ? Number(chat.createdAt) : Date.now(),
      updatedAt: Number.isFinite(Number(chat.updatedAt)) ? Number(chat.updatedAt) : Date.now(),
      fav: Boolean(chat.fav),
      archived: Boolean(chat.archived),
      tokens: Math.max(0, Number(chat.tokens) || 0),
      cost: Math.max(0, Number(chat.cost) || 0),
      draft: String(chat.draft || ""),
      providerTag: chat.providerTag ? String(chat.providerTag) : null,
      providerName: chat.providerName ? String(chat.providerName) : null
    };
  }).filter(Boolean);
}
var store = {
  apiKey: "",
  demoMode: false,
  models: [],
  modelMap: {},
  endpointMap: {},
  endpointErrors: {},
  favModels: normalizeStringArray(safeJson("nx_fav_models", [])),
  chats: normalizeChats(safeJson("nx_chats", [])),
  activeChatId: null,
  settings: normalizeSettings(safeJson("nx_settings", {})),
  isStreaming: false,
  abortCtrl: null,
  totalCost: Math.max(0, Number(storageGet("localStorage", "nx_total_cost")) || 0),
  _saveTimer: null,
  _saveIdle: null,
  save() {
    if (this.demoMode) return;
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._saveIdle && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(this._saveIdle);
      this._saveIdle = null;
    }
    try {
      localStorage.setItem("nx_chats", chatStorageJSON(this.chats));
      localStorage.setItem("nx_settings", JSON.stringify(this.settings));
      localStorage.setItem("nx_fav_models", JSON.stringify(this.favModels));
      localStorage.setItem("nx_total_cost", String(this.totalCost));
    } catch (err) {
      console.error("Speichern fehlgeschlagen:", err);
      notifyStorageError(err);
    }
  },
  saveDebounced(ms = 400) {
    clearTimeout(this._saveTimer);
    if (this._saveIdle && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(this._saveIdle);
      this._saveIdle = null;
    }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      const runSave = () => {
        this._saveIdle = null;
        this.save();
      };
      if (typeof requestIdleCallback === "function") {
        this._saveIdle = requestIdleCallback(runSave, { timeout: 1200 });
      } else {
        this._saveTimer = setTimeout(runSave, 0);
      }
    }, ms);
  },
  getChat() {
    return this.chats.find((c) => c.id === this.activeChatId) || null;
  },
  newChat(model) {
    const c = { id: uuid(), title: "Neuer Chat", model: model || this.getChat()?.model || pickDefaultModel(), providerTag: null, providerName: null, messages: [], createdAt: Date.now(), updatedAt: Date.now(), fav: false, archived: false, tokens: 0, cost: 0, draft: "" };
    this.chats.unshift(c);
    this.activeChatId = c.id;
    this.save();
    return c;
  },
  deleteChat(id) {
    this.chats = this.chats.filter((c) => c.id !== id);
    if (this.activeChatId === id) this.activeChatId = this.chats[0]?.id || null;
    this.save();
  }
};

// src/api/capabilities.js
function modelSupportsReasoning(model) {
  if (!model) return false;
  const sp = Array.isArray(model.supported_parameters) ? model.supported_parameters : null;
  if (sp) {
    return sp.some((param) => REASONING_PARAMS.has(param));
  }
  const haystack = [
    model.id,
    model.name,
    model.description,
    model.architecture?.modality
  ].map((v) => String(v || "").toLowerCase()).join(" ");
  return KNOWN_REASONING_MODEL_RE.test(haystack);
}
function modelSupportsImages(model) {
  if (!model) return false;
  const inputs = model.architecture?.input_modalities ?? model.input_modalities;
  if (Array.isArray(inputs)) return inputs.includes("image");
  const [input] = String(model.architecture?.modality || "").toLowerCase().split("->");
  return /\b(image|vision|multimodal)\b/.test(input);
}
function modelCapabilityText(model) {
  if (!model) return "";
  return [
    model.id,
    model.name,
    model.description,
    model.architecture?.modality,
    model.architecture?.input_modalities,
    model.input_modalities,
    model.supported_parameters
  ].map((part) => Array.isArray(part) ? part.join(" ") : String(part || "")).join(" ").toLowerCase();
}
function modelSupportsTextInput(model) {
  if (!model) return false;
  const explicitInputs = [
    model.architecture?.input_modalities,
    model.input_modalities
  ].filter(Boolean);
  if (explicitInputs.length) {
    return explicitInputs.some((part) => {
      const value = Array.isArray(part) ? part.join(" ").toLowerCase() : String(part || "").toLowerCase();
      return /\b(text|prompt|language)\b/.test(value);
    });
  }
  const text = modelCapabilityText(model);
  if (/\b(audio|video)\b/.test(text) && !/\b(text|prompt|language)\b/.test(text)) return false;
  return !text || /\b(text|chat|language|prompt|instruct|llm)\b/.test(text) || !/\b(image|audio|video)\b/.test(text);
}
function getAttachmentCapabilities(model) {
  const text = modelSupportsTextInput(model);
  const image = modelSupportsImages(model);
  const inputs = model?.architecture?.input_modalities ?? model?.input_modalities ?? [];
  return {
    text,
    image,
    pdf: text || inputs.includes("file"),
    audio: inputs.includes("audio"),
    video: inputs.includes("video"),
    any: text || image || inputs.includes("audio") || inputs.includes("video") || inputs.includes("file")
  };
}
function attachmentAcceptForCapabilities(caps) {
  const accepts = [];
  if (caps?.text) {
    accepts.push(
      "text/*",
      "application/json",
      "application/xml",
      "application/yaml",
      ".txt",
      ".md",
      ".markdown",
      ".csv",
      ".tsv",
      ".json",
      ".jsonl",
      ".xml",
      ".yaml",
      ".yml",
      ".html",
      ".htm",
      ".css",
      ".js",
      ".mjs",
      ".cjs",
      ".ts",
      ".tsx",
      ".jsx",
      ".py",
      ".java",
      ".c",
      ".cpp",
      ".h",
      ".hpp",
      ".cs",
      ".go",
      ".rs",
      ".php",
      ".rb",
      ".swift",
      ".kt",
      ".kts",
      ".sql",
      ".sh",
      ".bash",
      ".ps1",
      ".bat",
      ".ini",
      ".conf",
      ".cfg",
      ".log"
    );
  }
  if (caps?.image) {
    accepts.push("image/*", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp");
  }
  if (caps?.pdf) accepts.push("application/pdf", ".pdf");
  if (caps?.audio) accepts.push("audio/*", ".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".aiff");
  if (caps?.video) accepts.push("video/*", ".mp4", ".webm", ".mov");
  return [...new Set(accepts)].join(",");
}
function unsupportedAttachmentForModel(files, model) {
  const caps = getAttachmentCapabilities(model);
  return (files || []).find(
    (file) => file.kind === "image" && !caps.image || file.kind === "pdf" && !caps.pdf || file.kind === "audio" && !caps.audio || file.kind === "video" && !caps.video || file.kind === "text" && !caps.text
  ) || null;
}
function modelSupportsParam(model, param) {
  const sp = Array.isArray(model?.supported_parameters) ? model.supported_parameters : null;
  if (sp) return sp.includes(param);
  if (REASONING_PARAMS.has(param)) return modelSupportsReasoning(model);
  return STANDARD_CHAT_PARAMS.has(param);
}
function legacyReasoningEffort(mode) {
  if (mode === "minimal") return "low";
  if (mode === "xhigh") return "high";
  return ["low", "medium", "high"].includes(mode) ? mode : "medium";
}
function buildReasoningRequest(model, mode) {
  if (!modelSupportsReasoning(model)) return {};
  if (mode === "off") return modelSupportsParam(model, "reasoning") ? { reasoning: { enabled: false } } : {};
  const reasoningMode = REASONING_MODES.includes(mode) ? mode : "off";
  if (reasoningMode === "off") return {};
  if (modelSupportsParam(model, "reasoning")) {
    return {
      reasoning: reasoningMode === "auto" ? { enabled: true, exclude: false } : { effort: reasoningMode, exclude: false }
    };
  }
  if (reasoningMode === "auto") {
    if (modelSupportsParam(model, "include_reasoning")) return { include_reasoning: true };
    return {};
  }
  if (modelSupportsParam(model, "reasoning_effort")) {
    const effort = legacyReasoningEffort(reasoningMode);
    return modelSupportsParam(model, "include_reasoning") ? { reasoning_effort: effort, include_reasoning: true } : { reasoning_effort: effort };
  }
  if (modelSupportsParam(model, "include_reasoning")) return { include_reasoning: true };
  return {};
}

// src/core/icons.js
function svgIcon(name, svg) {
  return `<span class="nx-icon fluent-icon svg-icon" data-icon="${name}" aria-hidden="true">${svg}</span>`;
}
var IC = {
  logo: svgIcon("logo", `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1c1.4 6.2 4.8 9.6 11 11-6.2 1.4-9.6 4.8-11 11C10.6 16.8 7.2 13.4 1 12 7.2 10.6 10.6 7.2 12 1Z"/></svg>`),
  plus: svgIcon("plus", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`),
  send: svgIcon("send", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`),
  stop: svgIcon("stop", `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`),
  copy: svgIcon("copy", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`),
  check: svgIcon("check", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`),
  edit: svgIcon("edit", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`),
  trash: svgIcon("trash", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`),
  star: svgIcon("star", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`),
  starFill: svgIcon("starFill", `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`),
  settings: svgIcon("settings", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`),
  menu: svgIcon("menu", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`),
  x: svgIcon("x", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`),
  chat: svgIcon("chat", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`),
  eye: svgIcon("eye", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`),
  eyeOff: svgIcon("eyeOff", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`),
  shield: svgIcon("shield", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`),
  refresh: svgIcon("refresh", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>`),
  download: svgIcon("download", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`),
  cpu: svgIcon("cpu", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>`),
  key: svgIcon("key", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`),
  moon: svgIcon("moon", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`),
  sun: svgIcon("sun", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`),
  archive: svgIcon("archive", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`),
  chevDown: svgIcon("chevDown", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`),
  more: svgIcon("more", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`),
  arrowDown: svgIcon("arrowDown", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`),
  search: svgIcon("search", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`),
  bug: svgIcon("bug", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 116 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M6 17l-4 1M17.47 9c1.93-.2 3.53-1.9 3.53-4M18 13h4M18 17l4 1"/></svg>`),
  paperclip: svgIcon("paperclip", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`),
  dollar: svgIcon("dollar", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`),
  think: svgIcon("think", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><line x1="10" y1="22" x2="14" y2="22"/><line x1="11" y1="20" x2="13" y2="20"/></svg>`),
  external: svgIcon("external", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5"/></svg>`),
  mic: svgIcon("mic", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0M12 17v5M8 22h8"/></svg>`),
  globe: svgIcon("globe", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"/></svg>`),
  file: svgIcon("file", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`)
};

// src/ui/markdown.js
var markedConfigured = false;
function configureMarkdownRenderer() {
  if (markedConfigured) return;
  marked.use({ breaks: true, gfm: true });
  markedConfigured = true;
}
function renderMd(text) {
  const source = text || "";
  const fallback = `<p>${esc(source).replace(/\n/g, "<br>")}</p>`;
  configureMarkdownRenderer();
  let html;
  try {
    const raw = marked.parse(source);
    html = DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
      SANITIZE_NAMED_PROPS: true,
      ADD_ATTR: ["target", "rel"],
      FORBID_TAGS: ["style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select"],
      FORBID_ATTR: ["style", "onerror", "onclick"]
    });
  } catch (err) {
    if (store.settings.showDebug) console.warn("Markdown konnte nicht sicher gerendert werden:", err);
    return fallback;
  }
  html = html.replace(
    /<pre><code class="language-([\w+-]+)">/g,
    (match, lang) => `<pre><div class="code-header"><span>${esc(lang)}</span><button onclick="nxCopyCode(this)">${IC.copy} Kopieren</button></div><code tabindex="0" aria-label="Codeblock ${esc(lang)}" class="language-${esc(lang)}">`
  );
  html = html.replace(
    /<pre><code>(?!<\/code>)/g,
    `<pre><div class="code-header"><span>code</span><button onclick="nxCopyCode(this)">${IC.copy} Kopieren</button></div><code tabindex="0" aria-label="Codeblock">`
  );
  return html;
}
function hardenLinks(root) {
  if (!root) return;
  root.querySelectorAll("a[href]").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
}
function closeOpenCodeFence(text) {
  const source = text || "";
  const lines = source.split("\n");
  let openFence = null;
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (!m) continue;
    const marker = m[1];
    const char = marker[0];
    const len = marker.length;
    if (!openFence) {
      openFence = { char, len };
    } else if (char === openFence.char && len >= openFence.len) {
      openFence = null;
    }
  }
  return openFence ? `${source}
${openFence.char.repeat(openFence.len)}` : source;
}
function renderStreamingMd(text) {
  return renderMd(closeOpenCodeFence(text));
}
function highlightCode(container) {
  if (!container) return;
  container.querySelectorAll("pre code").forEach((block) => {
    if (block.dataset.highlighted) return;
    try {
      hljs.highlightElement(block);
    } catch (err) {
      block.removeAttribute("class");
      block.dataset.highlighted = "yes";
      if (store.settings.showDebug) console.warn("Syntax-Highlighting fehlgeschlagen:", err);
    }
  });
}
window.nxCopyCode = function(btn) {
  const code = btn.closest("pre")?.querySelector("code");
  if (!code) return;
  copyText(code.textContent).then((ok) => {
    const orig = btn.innerHTML;
    btn.innerHTML = ok ? `${IC.check} Kopiert!` : "Fehler";
    setTimeout(() => {
      btn.innerHTML = orig;
    }, 1500);
  });
};
window.nxToggleReasoning = function(btn) {
  const hdr = btn;
  const wrap = hdr.parentElement.querySelector(".reasoning-body-wrap");
  const chev = hdr.querySelector(".r-chevron");
  const isExpanded = hdr.classList.contains("expanded");
  if (isExpanded) {
    hdr.classList.remove("expanded");
    hdr.setAttribute("aria-expanded", "false");
    if (wrap) wrap.classList.remove("expanded");
    if (chev) chev.classList.remove("expanded");
  } else {
    hdr.classList.add("expanded");
    hdr.setAttribute("aria-expanded", "true");
    if (wrap) wrap.classList.add("expanded");
    if (chev) chev.classList.add("expanded");
  }
};

// src/api/response.js
function collectTextFragments(value, keys, options = {}) {
  const { joiner = "", seen = /* @__PURE__ */ new WeakSet() } = options;
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => collectTextFragments(item, keys, { joiner, seen })).filter(Boolean).join(joiner);
  }
  if (typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);
  for (const key of keys) {
    if (value[key] != null) {
      const extracted = collectTextFragments(value[key], keys, { joiner, seen });
      if (extracted) return extracted;
    }
  }
  return "";
}
function extractReasoningText(value) {
  return collectTextFragments(value, [
    "reasoning",
    "reasoning_content",
    "reasoning_details",
    "thinking",
    "thinking_content",
    "thought",
    "thoughts",
    "analysis",
    "analysis_content",
    "chain_of_thought",
    "summary",
    "summaries",
    "text",
    "content",
    "output_text",
    "message"
  ], { joiner: "\n" });
}
function extractContentText(value) {
  return collectTextFragments(value, [
    "text",
    "content",
    "output_text",
    "message",
    "refusal"
  ], { joiner: "" });
}
function isReasoningPart(part) {
  return part && typeof part === "object" && /reason|think|thought|analysis/i.test(String(part.type || part.name || ""));
}
function extractVisibleContentText(value) {
  if (Array.isArray(value)) return value.filter((part) => !isReasoningPart(part)).map(extractContentText).join("");
  if (isReasoningPart(value)) return "";
  return extractContentText(value);
}
function extractAssistantText(msg) {
  return extractVisibleContentText(msg.content) || extractVisibleContentText(msg.output) || extractContentText(msg.output_text) || extractContentText(msg.text) || extractContentText(msg.refusal);
}
function extractReasoningFromMessage(msg) {
  if (!msg || typeof msg !== "object") return "";
  return extractReasoningText(msg.reasoning) || extractReasoningText(msg.reasoning_content) || extractReasoningText(msg.reasoning_details) || extractReasoningText(msg.thinking) || extractReasoningText(msg.thinking_content) || extractReasoningText(msg.thoughts) || extractReasoningText(msg.analysis) || extractReasoningText(msg.analysis_content) || extractReasoningText(msg.output?.filter?.((part) => /reason|think|thought|analysis/i.test(part?.type || ""))) || extractReasoningText(msg.content?.filter?.((part) => /reason|think|thought|analysis/i.test(part?.type || "")));
}
function extractReasoningDetailsFromMessage(msg) {
  if (!msg || typeof msg !== "object") return [];
  return normalizeReasoningDetails(msg.reasoning_details || msg.reasoningDetails);
}
function extractReasoningPayloadFromMessage(msg) {
  return {
    text: extractReasoningFromMessage(msg),
    details: extractReasoningDetailsFromMessage(msg)
  };
}
function extractProviderInfo(payload) {
  if (!payload || typeof payload !== "object") return {};
  const choice = payload.choices?.[0] || {};
  const provider = payload.provider || payload.provider_tag || payload.providerTag || choice.provider || choice.provider_tag;
  if (typeof provider === "string") return { providerTag: provider };
  if (provider && typeof provider === "object") {
    return {
      providerTag: provider.tag || provider.slug || provider.id || provider.name || "",
      providerName: provider.name || provider.provider_name || provider.label || ""
    };
  }
  return {};
}
function apiErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  const err = payload.error || payload;
  return extractContentText(err.message) || extractContentText(err.detail) || extractContentText(err.details) || extractContentText(err) || fallback;
}
function createApiError(message, details = {}) {
  const err = new Error(message || "Unbekannter API-Fehler.");
  Object.assign(err, details);
  return err;
}
function classifyApiError(err) {
  const status = Number(err?.status) || 0;
  const msg = String(err?.message || "").toLowerCase();
  const payloadText = JSON.stringify(err?.payload || {}).toLowerCase();
  const text = `${msg} ${payloadText}`;
  if (err?.name === "AbortError") {
    return {
      title: "Generierung gestoppt",
      summary: "Die Antwort wurde abgebrochen.",
      suggestions: ["Sende die Nachricht erneut, wenn du die Antwort vollständig brauchst."]
    };
  }
  if (status === 401 || status === 403 || /api.?key|auth|unauthori[sz]ed|forbidden|invalid key|token/.test(text)) {
    return {
      title: "API-Key ungültig oder ohne Zugriff",
      summary: "OpenRouter hat die Anfrage wegen Authentifizierung oder Berechtigungen abgelehnt.",
      suggestions: ["Prüfe den API-Key in den Einstellungen.", "Erstelle bei OpenRouter ggf. einen neuen Key.", "Wenn das Modell kostenpflichtig ist, prüfe auch Guthaben und Modellzugriff."]
    };
  }
  if (status === 429 || /rate.?limit|too many requests|quota|throttle/.test(text)) {
    return {
      title: "Rate Limit erreicht",
      summary: "Zu viele Anfragen wurden in kurzer Zeit gesendet.",
      suggestions: ["Warte kurz und versuche es erneut.", "Wechsle auf ein anderes Modell oder einen anderen Anbieter.", "Reduziere parallele oder sehr lange Anfragen."]
    };
  }
  if (status === 402 || /credit|balance|payment|insufficient/.test(text)) {
    return {
      title: "Guthaben oder Zahlungsstatus prüfen",
      summary: "Der Anbieter meldet fehlendes Guthaben oder ein Zahlungsproblem.",
      suggestions: ["Prüfe dein OpenRouter-Guthaben.", "Wähle ein kostenloses oder günstigeres Modell.", "Prüfe, ob dein Account für das Modell freigeschaltet ist."]
    };
  }
  if (status === 404 || /model.*(not found|unavailable|not available)|no endpoints|provider.*unavailable/.test(text)) {
    return {
      title: "Modell nicht verfügbar",
      summary: "Das gewählte Modell ist aktuell nicht erreichbar oder existiert nicht mehr unter dieser ID.",
      suggestions: ["Wähle ein anderes Modell im Modelle-Panel.", "Lade die Modellliste neu, indem du die Seite aktualisierst.", "Falls es ein temporärer Anbieterfehler ist, versuche es später erneut."]
    };
  }
  if (status === 400 && /context|token|too long|maximum context|context length|max_tokens|prompt/.test(text)) {
    return {
      title: "Kontext zu lang",
      summary: "Der Chatverlauf oder die Eingabe überschreitet das Kontextfenster des Modells.",
      suggestions: ["Starte einen neuen Chat oder kürze ältere Nachrichten.", "Wähle ein Modell mit größerem Kontextfenster.", "Reduziere Max Tokens in den Einstellungen."]
    };
  }
  if (err instanceof TypeError || /failed to fetch|network|cors|internet|offline|dns/.test(text)) {
    return {
      title: "Netzwerkfehler",
      summary: "Die Verbindung zu OpenRouter konnte nicht stabil aufgebaut werden.",
      suggestions: ["Prüfe Internetverbindung, VPN, Firewall oder Browser-Erweiterungen.", "Versuche die Anfrage erneut.", "Wenn du die Datei lokal öffnest, prüfe, ob der Browser externe API-Aufrufe erlaubt."]
    };
  }
  if (status >= 500 || /server error|bad gateway|service unavailable|overloaded|timeout/.test(text)) {
    return {
      title: "Anbieter oder OpenRouter gerade gestört",
      summary: "Der Server hat die Anfrage nicht zuverlässig verarbeiten können.",
      suggestions: ["Versuche es in einigen Sekunden erneut.", "Wechsle temporär auf ein anderes Modell.", "Reduziere Eingabelänge oder deaktivere Zusatzparameter wie Reasoning."]
    };
  }
  return {
    title: "Anfrage fehlgeschlagen",
    summary: err?.message || "Die Antwort konnte nicht erzeugt werden.",
    suggestions: ["Versuche es erneut.", "Wechsle testweise das Modell.", "Aktiviere Debug, wenn du die Rohantwort prüfen möchtest."]
  };
}
function formatErrorForUser(err) {
  const info = classifyApiError(err);
  const items = info.suggestions.map((s) => `- ${s}`).join("\n");
  return `**${info.title}**

${info.summary}

**Lösungsvorschläge:**
${items}`;
}

// src/api/media.js
function attachmentPart(file) {
  if (!file?.data) return null;
  if (file.kind === "image") return { type: "image_url", image_url: { url: file.data } };
  if (file.kind === "pdf") return { type: "file", file: { filename: file.name, file_data: file.data } };
  if (file.kind === "audio") return { type: "input_audio", input_audio: { data: file.data.includes(",") ? file.data.split(",")[1] : file.data, format: file.format || file.name.split(".").pop().toLowerCase() } };
  if (file.kind === "video") return { type: "video_url", video_url: { url: file.data } };
  return null;
}
function joinBase64Chunks(chunks) {
  const binary = chunks.map((chunk) => atob(chunk));
  return btoa(binary.join(""));
}
function safeMediaURL(value, kind = "image") {
  const url = String(value || "");
  if (/^https?:\/\//i.test(url)) return url;
  if (/^blob:/i.test(url)) return url;
  if (new RegExp(`^data:${kind}/[a-z0-9.+-]+;base64,`, "i").test(url)) return url;
  return "";
}

// src/api/context-window.js
function selectContextHistory(history, { budget, used = 0, maxSingle, estimate, limit }) {
  const groups2 = [];
  let truncated = 0, clipped = 0;
  for (let i = 0; i < history.length; i++) {
    const message = history[i];
    if (message.role === "tool") {
      truncated++;
      continue;
    }
    const group = [message];
    if (message.tool_calls?.length) {
      const ids = new Set(message.tool_calls.map((call) => call.id));
      while (history[i + 1]?.role === "tool") {
        const result = history[++i];
        if (ids.delete(result.tool_call_id)) group.push(result);
        else truncated++;
      }
      if (ids.size) {
        truncated += group.length;
        continue;
      }
    }
    groups2.push(group);
  }
  const selected = [];
  for (let i = groups2.length - 1; i >= 0; i--) {
    let group = groups2[i];
    const latest = i === groups2.length - 1;
    let cost = group.reduce((sum, msg) => sum + estimate(msg), 0);
    if (latest && (cost > budget - used || group.some((msg) => estimate(msg) > maxSingle))) {
      const allowance = Math.max(0, budget - used);
      group = group.map((message) => {
        const share = Math.min(maxSingle, Math.floor(allowance * estimate(message) / Math.max(1, cost)));
        const result = limit(message, share);
        if (result.truncated) clipped++;
        return result.message;
      });
      cost = group.reduce((sum, msg) => sum + estimate(msg), 0);
    }
    if (cost > budget - used || !latest && group.some((msg) => estimate(msg) > maxSingle)) {
      if (latest) throw new Error("Die letzte Nachricht mit ihren Werkzeugdaten passt nicht ins Kontextfenster. Wähle ein Modell mit größerem Kontext oder kürze die Eingabe.");
      truncated += group.length;
      continue;
    }
    selected.unshift(...group);
    used += cost;
  }
  return { selected, truncated, clipped };
}

// src/api/context.js
function getMessageAttachments(m) {
  const attachments = Array.isArray(m?.attachments) ? m.attachments : [];
  const legacyImages = Array.isArray(m?.images) ? m.images.map((img) => ({ kind: "image", name: img.name || "Bild", type: img.type || "image/*", size: img.size || 0, data: img.data })) : [];
  return [...attachments, ...legacyImages].filter((att) => att && typeof att === "object");
}
function buildAttachmentPrompt(attachments) {
  const textFiles = attachments.filter((att) => att.kind === "text" && att.text);
  if (!textFiles.length) return "";
  return textFiles.map((att) => {
    const suffix = att.truncated ? "\n[Hinweis: Datei wurde gekürzt.]" : "";
    return `Dateianhang: ${att.name}${att.type ? ` (${att.type})` : ""}

${att.text}${suffix}`;
  }).join("\n\n---\n\n");
}
function messageToApiMessage(m, currentModel) {
  if (!m || m.error) return null;
  if (m.role === "user") {
    const attachments = getMessageAttachments(m);
    const attachmentText = buildAttachmentPrompt(attachments);
    const textContent = [m.content || "", attachmentText].filter(Boolean).join("\n\n");
    const media = attachments.filter((att) => att.kind !== "text").map(attachmentPart).filter(Boolean);
    if (media.length) {
      return {
        role: "user",
        content: [
          ...textContent ? [{ type: "text", text: textContent }] : [],
          ...media
        ]
      };
    }
    return { role: "user", content: textContent };
  }
  if (m.role === "assistant") {
    const assistantContent = String(m.content || "").trim();
    const reasoning = stringifyUnknownContent(m.reasoning).trim();
    const reasoningDetails = normalizeReasoningDetails(m.reasoning_details || m.reasoningDetails);
    if (!assistantContent && !reasoning && !reasoningDetails.length && !m.tool_calls?.length) return null;
    const apiMsg = { role: "assistant", content: assistantContent };
    if (m.tool_calls?.length) apiMsg.tool_calls = m.tool_calls;
    if (m.annotations?.length) apiMsg.annotations = m.annotations;
    if (m.audio?.id && (!m.audio.expires_at || Number(m.audio.expires_at) > Date.now() / 1e3) && currentModel?.architecture?.output_modalities?.includes("audio")) apiMsg.audio = { id: m.audio.id };
    if (modelSupportsReasoning(currentModel)) {
      if (reasoningDetails.length) apiMsg.reasoning_details = reasoningDetails;
      else if (reasoning) apiMsg.reasoning = reasoning;
    }
    return apiMsg;
  }
  if (m.role === "system" && m.content) return { role: "system", content: m.content };
  if (m.role === "tool" && m.tool_call_id) return { role: "tool", tool_call_id: m.tool_call_id, content: m.content || "" };
  return null;
}
function estimateApiMessageTokens(msg) {
  if (!msg) return 0;
  let total = 0;
  if (typeof msg.content === "string") {
    total += estimateTokens(msg.content);
  } else if (Array.isArray(msg.content)) {
    total += msg.content.reduce((sum, part) => {
      if (["image_url", "file", "input_audio", "video_url"].includes(part?.type)) return sum + (part.type === "file" ? 4e3 : 1e3);
      return sum + estimateTokens(extractContentText(part));
    }, 0);
  } else {
    total += estimateTokens(extractContentText(msg.content));
  }
  if (msg.reasoning) total += estimateTokens(extractReasoningText(msg.reasoning));
  if (msg.reasoning_details) total += estimateTokens(extractReasoningText(msg.reasoning_details));
  if (msg.tool_calls) total += estimateTokens(JSON.stringify(msg.tool_calls));
  return total;
}
function truncateTextToTokens(text, maxTokens) {
  const source = String(text || "");
  if (estimateTokens(source) <= maxTokens) return { text: source, truncated: false };
  const suffix = "\n\n[Hinweis: Inhalt wurde wegen des Kontextlimits gekürzt.]";
  const maxChars = Math.max(0, Math.floor(maxTokens * 3.8));
  return {
    text: maxChars >= suffix.length ? source.slice(0, maxChars - suffix.length) + suffix : source.slice(0, maxChars),
    truncated: true
  };
}
function limitApiMessageContent(msg, maxTokens) {
  if (!msg || estimateApiMessageTokens(msg) <= maxTokens) return { message: msg, truncated: false };
  const role = msg.role;
  if (typeof msg.content === "string") {
    const result2 = truncateTextToTokens(msg.content, Math.max(0, maxTokens - (msg.tool_calls ? estimateTokens(JSON.stringify(msg.tool_calls)) : 0) - estimateTokens(extractReasoningText(msg.reasoning_details || msg.reasoning))));
    return { message: { ...msg, content: result2.text }, truncated: result2.truncated };
  }
  if (Array.isArray(msg.content)) {
    const content = [];
    let remaining = maxTokens;
    let truncated = false;
    for (const part of msg.content) {
      if (["image_url", "file", "input_audio", "video_url"].includes(part?.type)) {
        const mediaBudget = part.type === "file" ? 4e3 : 1e3;
        if (remaining >= mediaBudget) {
          content.push(part);
          remaining -= mediaBudget;
        } else {
          truncated = true;
        }
        continue;
      }
      const text2 = extractContentText(part);
      if (!text2) continue;
      const result2 = truncateTextToTokens(text2, remaining);
      if (result2.text) content.push({ type: "text", text: result2.text });
      if (result2.truncated) truncated = true;
      remaining -= estimateTokens(result2.text);
      if (remaining <= 0) break;
    }
    if (!content.length) content.push({ type: "text", text: "[Hinweis: Anhänge wurden wegen des Kontextlimits ausgelassen.]" });
    return { message: { role, content }, truncated };
  }
  const text = extractContentText(msg.content);
  const result = truncateTextToTokens(text, maxTokens);
  return { message: { role, content: result.text }, truncated: result.truncated };
}
function buildApiMessagesForChat(chat, currentModel) {
  const base = [];
  if (store.settings.systemPrompt) base.push({ role: "system", content: store.settings.systemPrompt });
  const history = [];
  for (const m of chat.messages) {
    const apiMsg = messageToApiMessage(m, currentModel);
    if (apiMsg) history.push(apiMsg);
  }
  const ctx = Number(currentModel?.context_length) || 0;
  if (!ctx) return { messages: [...base, ...history], truncated: 0, clipped: 0 };
  const maxOutput = store.settings.maxTokens > 0 ? store.settings.maxTokens : CONTEXT_TOKEN_RESERVE;
  const budget = Math.max(1200, Math.floor(ctx * CONTEXT_SAFETY_RATIO) - maxOutput);
  const maxSingleHistoryMessageTokens = Math.max(600, Math.floor(budget * 0.45));
  let used = base.reduce((sum, msg) => sum + estimateApiMessageTokens(msg), 0);
  const { selected, truncated, clipped } = selectContextHistory(history, {
    budget,
    used,
    maxSingle: maxSingleHistoryMessageTokens,
    estimate: estimateApiMessageTokens,
    limit: limitApiMessageContent
  });
  return { messages: [...base, ...selected], truncated, clipped };
}

// src/ui/attachments.js
var MAX_TEXT_ATTACHMENT_BYTES = 1024 * 1024;
var MAX_TEXT_ATTACHMENT_CHARS = 18e4;
var MAX_IMAGE_ATTACHMENT_BYTES = 4 * 1024 * 1024;
var SENSITIVE_FILE_EXTS = /* @__PURE__ */ new Set(["env", "pem", "key", "crt", "p12", "pfx", "kubeconfig", "npmrc", "yarnrc"]);
var TEXT_ATTACHMENT_EXTS = /* @__PURE__ */ new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "xml",
  "yaml",
  "yml",
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "go",
  "rs",
  "php",
  "rb",
  "swift",
  "kt",
  "kts",
  "sql",
  "sh",
  "bash",
  "ps1",
  "bat",
  "ini",
  "conf",
  "cfg",
  "log"
]);
var IMAGE_ATTACHMENT_EXTS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
function fileExt(name) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}
function isSensitiveFilename(name) {
  const lower = String(name || "").toLowerCase().replace(/\\/g, "/");
  if (lower === ".env" || lower.endsWith("/.env")) return true;
  const clean = lower.startsWith(".") ? lower.slice(1) : lower;
  const ext = clean.split(".").pop();
  return SENSITIVE_FILE_EXTS.has(ext);
}
function isTextLikeFile(file) {
  const type = String(file.type || "").toLowerCase();
  return type.startsWith("text/") || /json|xml|yaml|csv|javascript|typescript|x-sh|sql/.test(type) || TEXT_ATTACHMENT_EXTS.has(fileExt(file.name));
}
function isImageFile(file) {
  const type = String(file.type || "").toLowerCase();
  return type.startsWith("image/") || IMAGE_ATTACHMENT_EXTS.has(fileExt(file.name));
}
function readFileAs(file, mode) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Datei konnte nicht gelesen werden."));
    if (mode === "data") reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}
async function handleFileAttach(e) {
  const chat = store.getChat();
  const currentModel = ensureChatModelAvailable(chat);
  const caps = getAttachmentCapabilities(currentModel);
  const files = Array.from(e.target.files || []);
  const chatId = store.activeChatId;
  const add = async (attachment) => {
    const saved = attachment.data && !store.demoMode ? await persistAttachment(attachment) : attachment;
    if (!e.target.isConnected || store.activeChatId !== chatId || store.isStreaming) return;
    uiState.attachedFiles.push(saved);
  };
  for (const file of files) {
    try {
      if (isSensitiveFilename(file.name)) {
        toast(`"${file.name}" kann Secrets enthalten und wurde nicht angehängt.`, "error");
        continue;
      }
      const kind = file.type === "application/pdf" || fileExt(file.name) === "pdf" ? "pdf" : file.type.startsWith("audio/") || ["mp3", "wav", "flac", "m4a", "aac", "ogg", "aiff"].includes(fileExt(file.name)) ? "audio" : file.type.startsWith("video/") || ["mp4", "webm", "mov"].includes(fileExt(file.name)) ? "video" : null;
      if (kind) {
        if (!caps[kind]) {
          toast(`"${file.name}" wird vom aktuellen Modell nicht unterstützt.`, "error");
          continue;
        }
        if (file.size > 20 * 1024 * 1024) {
          toast("Maximal 20 MB pro PDF-, Audio- oder Videodatei.", "error");
          continue;
        }
        const data = await readFileAs(file, "data");
        const attachment = { kind, name: file.name, type: file.type, size: file.size, format: fileExt(file.name), data };
        await add(attachment);
        continue;
      }
      if (isImageFile(file)) {
        if (!caps.image) {
          toast(`Bild "${file.name}" braucht ein multimodales Modell.`, "error");
          continue;
        }
        if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
          toast(`"${file.name}" ist zu groß. Maximal 4 MB pro Bild.`, "error");
          continue;
        }
        const data = await readFileAs(file, "data");
        const attachment = { kind: "image", name: file.name, type: file.type, size: file.size, data };
        await add(attachment);
        continue;
      }
      if (!caps.text) {
        toast(`"${file.name}" wird vom aktuellen Modell nicht als Textdatei unterstützt.`, "error");
        continue;
      }
      if (!isTextLikeFile(file)) {
        toast(`"${file.name}" wird noch nicht unterstützt. Nutze Text, Code, CSV oder JSON.`, "error");
        continue;
      }
      if (file.size > MAX_TEXT_ATTACHMENT_BYTES) {
        toast(`"${file.name}" ist zu groß. Maximal 1 MB pro Textdatei.`, "error");
        continue;
      }
      const rawText = String(await readFileAs(file, "text") || "");
      const truncated = rawText.length > MAX_TEXT_ATTACHMENT_CHARS;
      await add({
        kind: "text",
        name: file.name,
        type: file.type || fileExt(file.name) || "text/plain",
        size: file.size,
        text: truncated ? rawText.slice(0, MAX_TEXT_ATTACHMENT_CHARS) : rawText,
        truncated
      });
    } catch (err) {
      console.error("Datei konnte nicht angehängt werden:", err);
      toast(`"${file.name}" konnte nicht gelesen werden.`, "error");
    }
  }
  updateAttachedPreview();
  updateSendBtn();
  updateInputTokenCount();
  e.target.value = "";
}
function updateAttachedPreview() {
  const preview = document.getElementById("attached-preview");
  if (!preview) return;
  if (!uiState.attachedFiles.length) {
    preview.style.display = "none";
    preview.innerHTML = "";
    return;
  }
  preview.style.display = "flex";
  preview.innerHTML = uiState.attachedFiles.map((file, i) => `
  <div class="attached-chip">
    ${file.kind === "image" ? `<img src="${escAttr(file.data)}" alt="${escAttr(file.name)}">` : `<span class="file-icon">${esc(fileExt(file.name).slice(0, 3).toUpperCase() || "TXT")}</span>`}
    <span title="${escAttr(file.name)}">${esc(file.name)}</span>
    <button data-remove="${i}" title="Entfernen" aria-label="Anhang entfernen">${IC.x}</button>
  </div>
`).join("");
  preview.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      uiState.attachedFiles.splice(parseInt(btn.dataset.remove), 1);
      updateAttachedPreview();
      updateSendBtn();
      updateInputTokenCount();
    });
  });
}

// src/api/sse.js
async function* readSSE(body) {
  if (!body) throw new Error("Keine Streaming-Antwort erhalten.");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data = [];
  let event = "message";
  function process(line) {
    if (line === "") {
      if (!data.length) {
        event = "message";
        return null;
      }
      const result = { event, data: data.join("\n") };
      data = [];
      event = "message";
      return result;
    }
    if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    if (line.startsWith("event:")) event = line.slice(6).trim();
    return null;
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        const result = process(line);
        if (result) yield result;
      }
      if (done) break;
    }
    if (buffer) {
      const result = process(buffer.replace(/\r$/, ""));
      if (result) yield result;
    }
    const final = process("");
    if (final) yield final;
  } finally {
    await reader.cancel().catch(() => {
    });
    reader.releaseLock();
  }
}
function mergeToolCalls(existing, incoming = []) {
  for (const fragment of incoming) {
    const index = Number.isInteger(fragment.index) ? fragment.index : existing.findIndex((t) => t.id === fragment.id);
    const at = index < 0 ? existing.length : index;
    const current = existing[at] || { id: "", type: "function", function: { name: "", arguments: "" } };
    if (fragment.id) current.id = fragment.id;
    if (fragment.type) current.type = fragment.type;
    if (fragment.function?.name) current.function.name += fragment.function.name;
    if (fragment.function?.arguments) current.function.arguments += fragment.function.arguments;
    existing[at] = current;
  }
  return existing;
}

// src/api/http.js
var OPENROUTER_BASE = "https://openrouter.ai/api/v1";
function applicationHeaders() {
  const headers = { "X-OpenRouter-Title": "Nexus Chat Studio" };
  const origin = globalThis.location?.origin;
  if (/^https?:\/\//i.test(origin || "")) headers["HTTP-Referer"] = origin;
  return headers;
}
async function requestOpenRouter(endpoint, { method = "GET", key = "", body, form, query = {}, headers: extraHeaders = {}, signal, onEvent, timeout = 12e4 } = {}) {
  if (!endpoint.startsWith("/") || endpoint.startsWith("//") || /[?#]/.test(endpoint)) throw new Error("Ungültiger API-Pfad.");
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Zeitlimit für die API-Anfrage erreicht.")), timeout);
  const headers = applicationHeaders();
  if (key) headers.Authorization = `Bearer ${key}`;
  if (body !== void 0 && !form) headers["Content-Type"] = "application/json";
  for (const [name, value] of Object.entries(extraHeaders)) if (!/^(authorization|content-type|cookie|host|origin|referer)$/i.test(name)) headers[name] = String(value);
  const parameters = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) if (item !== void 0 && item !== "") parameters.append(name, String(item));
  }
  try {
    const response = await fetch(OPENROUTER_BASE + endpoint + (parameters.size ? "?" + parameters : ""), {
      method,
      headers,
      body: form || (body !== void 0 ? JSON.stringify(body) : void 0),
      signal: controller.signal
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data.error?.message || data.message || `OpenRouter: HTTP ${response.status}`);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    const mime = response.headers.get("content-type") || "";
    if (mime.includes("text/event-stream")) {
      const events = [];
      for await (const event of readSSE(response.body)) {
        if (event.data === "[DONE]") break;
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          data = event.data;
        }
        if (data?.error) throw new Error(data.error.message || "Streaming-Fehler");
        events.push(data);
        onEvent?.(data, event.event);
      }
      return { kind: "events", data: events };
    }
    if (mime.includes("json")) return { kind: "json", data: await response.json() };
    if (response.status === 204) return { kind: "json", data: { success: true } };
    return { kind: "blob", data: await response.blob() };
  } catch (error) {
    if (controller.signal.aborted) throw signal?.aborted ? new DOMException("Anfrage abgebrochen.", "AbortError") : new Error("OpenRouter antwortet nicht rechtzeitig. Bitte erneut versuchen.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

// src/ui/api-result.js
function showAPIResult(container, result, { endpoint = "", key = "", body = {}, signal } = {}) {
  container.replaceChildren();
  const urls = [];
  let disposeDiff;
  const objectURL = (blob) => {
    const url = URL.createObjectURL(blob);
    urls.push(url);
    return url;
  };
  const media = (src, kind, caption) => {
    const url = safeMediaURL(src, kind);
    if (!url) return;
    const node = el(kind === "image" ? "img" : kind, { ...kind === "image" ? { alt: caption || "Generiertes Bild" } : { controls: "", preload: "metadata" }, className: "api-media" });
    node.src = url;
    container.append(node);
    const link = el("a", { href: url, target: "_blank", rel: "noopener noreferrer", className: "feature-secondary" }, "Öffnen / speichern");
    container.append(link);
  };
  if (result.kind === "blob") {
    const blob = result.data;
    const kind = endpoint.includes("/speech") ? body.response_format === "pcm" ? null : "audio" : endpoint.includes("/videos/") ? "video" : blob.type.startsWith("image/") ? "image" : null;
    const mime = kind === "audio" && body.response_format === "mp3" ? "audio/mpeg" : kind === "video" ? "video/mp4" : blob.type;
    const output = mime ? new Blob([blob], { type: mime }) : blob;
    if (kind) media(objectURL(output), kind);
    else {
      const save = el("button", { className: "feature-secondary", type: "button" }, body.response_format === "pcm" ? "PCM-Audiodatei speichern" : "Datei speichern");
      save.onclick = () => downloadBlob(blob, body.response_format === "pcm" ? "openrouter-audio.pcm" : "openrouter-result");
      container.append(save);
    }
  } else {
    let data = result.data;
    if (result.kind === "events") {
      const completed = data.findLast?.((event) => event.response?.status === "completed");
      if (completed) data = completed.response;
      else {
        const text2 = data.map((event) => event.choices?.[0]?.delta?.content || event.delta || "").filter((value) => typeof value === "string").join("");
        const images = data.flatMap((event) => event.b64_json ? [{ b64_json: event.b64_json, media_type: event.media_type }] : event.data || []).filter((item) => item?.b64_json);
        data = { ...images.length ? { data: images } : {}, ...text2 ? { text: text2 } : {}, events: data };
      }
    }
    if (endpoint === "/credits" && data?.data) {
      const remaining = Number(data.data.total_credits) - Number(data.data.total_usage);
      if (Number.isFinite(remaining)) container.append(el("p", { className: "api-answer" }, `Verfügbares Guthaben: $${remaining.toFixed(4)}`));
    }
    const text = data?.text || data?.choices?.[0]?.message?.content || data?.output_text;
    if (typeof text === "string") container.append(el("p", { className: "api-answer" }, text));
    if (Array.isArray(data?.output)) {
      for (const item of data.output) for (const part of item.content || []) if (part.text) container.append(el("p", { className: "api-answer" }, part.text));
      const patch = endpoint === "/responses" ? responsePatch(data.output) : null;
      if (patch) {
        const note = el("p", { className: "feature-note" }, "Patch-Vorschlag aus der Responses API. Entscheidungen gelten für diese Vorschau.");
        const review = el("div", { className: "msg-content" });
        const pre = el("pre", {});
        pre.append(el("code", { className: "language-diff" }, patch));
        review.append(pre);
        container.append(note, review);
        disposeDiff = studioViews.mountDiffs(review);
      }
    }
    for (const item of Array.isArray(data?.data) ? data.data : []) if (item.b64_json) media(`data:${item.media_type || "image/" + (body.output_format || "png")};base64,${item.b64_json}`, "image");
    for (const image of data?.choices?.[0]?.message?.images || []) media(image.image_url?.url, "image");
    if (endpoint === "/videos" && data?.id) {
      const status = el("p", { role: "status" }, "Videoauftrag: " + data.status);
      container.append(status);
      const poll = el("button", { className: "feature-secondary", type: "button" }, "Videostatus aktualisieren");
      poll.onclick = async () => {
        poll.disabled = true;
        try {
          const response = await requestOpenRouter("/videos/" + encodeURIComponent(data.id), { key, signal });
          status.textContent = "Videoauftrag: " + response.data.status;
          if (response.data.error) status.textContent += " · " + response.data.error;
          if (response.data.status === "completed") {
            const video = await requestOpenRouter("/videos/" + encodeURIComponent(data.id) + "/content", { key, signal });
            if (video.kind === "blob") media(objectURL(video.data), "video");
            else for (const url of video.data?.urls || response.data.unsigned_urls || []) media(url, "video");
          }
        } catch (error) {
          status.textContent = error.message;
        } finally {
          poll.disabled = false;
        }
      };
      container.append(poll);
    }
    const details = el("details", { className: "api-json", ...!text && !container.children.length ? { open: "" } : {} });
    details.append(el("summary", {}, "Vollständige Antwort"), el("pre", {}, JSON.stringify(data, null, 2)));
    container.append(details);
    const save = el("button", { className: "feature-secondary", type: "button" }, "Antwort speichern");
    save.onclick = () => downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "openrouter-result.json");
    container.append(save);
  }
  return () => {
    disposeDiff?.();
    urls.forEach((url) => URL.revokeObjectURL(url));
  };
}

// src/ui/dialog.js
function openFeaturePanel(title, { wide = false, onClose } = {}) {
  document.querySelector("[data-feature-overlay]")?.dispatchEvent(new Event("nexus-close"));
  const panel = el("dialog", { className: `feature-panel${wide ? " feature-wide" : ""}`, "data-feature-overlay": "", "aria-label": title });
  const header = el("header", { className: "feature-head" });
  const closeButton = el("button", { type: "button", className: "btn-icon", "aria-label": title + " schließen", innerHTML: IC.x });
  header.append(el("h2", {}, title), closeButton);
  const content = el("div", { className: "feature-content" });
  const actions = el("footer", { className: "feature-actions" });
  const formId = "feature-form-" + uuid();
  panel.append(header, content, actions); document.body.append(panel);
  let controller, closed = false;
  const close = () => { if (closed) return; closed = true; onClose?.(); controller?.dispose(); panel.remove(); };
  controller = openNativeDialog(panel, close, ".feature-head button");
  closeButton.onclick = close; panel.addEventListener("nexus-close", close);
  return { panel, content, close, actions, formId };
}

// src/ui/tool-results.js
function pendingTools(chat) {
  const last = [...chat?.messages || []].reverse().find((message) => message.role === "assistant");
  return (last?.tool_calls || []).filter((call) => !chat.messages.some((message) => message.role === "tool" && message.tool_call_id === call.id));
}
function showToolResults(message, chat) {
  const pending = (message.tool_calls || []).filter((call) => !chat.messages.some((result) => result.role === "tool" && result.tool_call_id === call.id));
  if (!pending.length) {
    toast("Alle Werkzeugergebnisse sind bereits eingetragen.", "info");
    return;
  }
  const { content, close, actions, formId } = openFeaturePanel("Werkzeugergebnisse");
  content.append(el("p", { className: "feature-intro" }, "Führe die vorgeschlagenen Funktionen in deinem eigenen System aus und trage ihre Ergebnisse ein. Nexus führt eigenen Funktionscode nicht selbst aus."));
  const form = el("form", { className: "feature-form", id: formId }), inputs = [];
  for (const call of pending) {
    const section = el("section", { className: "feature-section" });
    section.append(el("h3", {}, call.function?.name || "Werkzeug"), el("pre", { className: "tool-arguments" }, call.function?.arguments || "{}"));
    const input = el("textarea", { rows: "5", required: "", "aria-label": "Ergebnis für " + (call.function?.name || call.id) });
    section.append(input);
    inputs.push({ call, input });
    form.append(section);
  }
  const button = el("button", { type: "submit", form: formId, className: "feature-primary" }, "Ergebnisse senden und fortfahren");
  actions.append(button);
  form.onsubmit = (event) => {
    event.preventDefault();
    if (store.isStreaming) {
      toast("Bitte warte auf die laufende Antwort.", "info");
      return;
    }
    if (store.getChat()?.id !== chat.id) {
      toast("Bitte öffne zuerst den zugehörigen Chat.", "info");
      return;
    }
    for (const { call, input } of inputs) chat.messages.push({ id: uuid(), role: "tool", tool_call_id: call.id, content: input.value, ts: Date.now() });
    store.save();
    close();
    sendChatMessage("", true);
  };
  content.append(form);
}

// src/api/schema.js
function dereference(spec, schema = {}, depth = 0) {
  if (depth > 12) return schema;
  if (schema.$ref) {
    const value = schema.$ref.replace(/^#\//, "").split("/").reduce((value2, key) => value2?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], spec);
    return dereference(spec, { ...value, ...Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$ref")) }, depth + 1);
  }
  if (schema.allOf) {
    const parts = schema.allOf.map((part) => dereference(spec, part, depth + 1));
    const merged = { ...schema, properties: {}, required: [] };
    delete merged.allOf;
    for (const part of parts) {
      Object.assign(merged, part, { properties: { ...merged.properties, ...part.properties }, required: [.../* @__PURE__ */ new Set([...merged.required, ...part.required || []])] });
    }
    return merged;
  }
  return schema;
}
function fieldSchema(spec, raw) {
  const schema = dereference(spec, raw);
  const variants = schema.anyOf || schema.oneOf;
  if (variants) {
    const variant = variants.map((s) => dereference(spec, s)).find((s) => s.type !== "null");
    return { ...fieldSchema(spec, variant || {}), ...Object.fromEntries(Object.entries(schema).filter(([key]) => !["anyOf", "oneOf"].includes(key))) };
  }
  return schema;
}
function schemaType(schema) {
  return (Array.isArray(schema.type) ? schema.type.find((x) => x !== "null") : schema.type) || (schema.properties ? "object" : schema.items ? "array" : "string");
}
function listOperations(spec) {
  const operations = [];
  for (const [path, item] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method) || !operation.operationId) continue;
      operations.push({ ...operation, path, method: method.toUpperCase(), id: method.toUpperCase() + " " + path, parameters: [...item.parameters || [], ...operation.parameters || []].map((p) => dereference(spec, p)) });
    }
  }
  return operations;
}
function validateSchema(spec, raw, value, label = "Anfrage", depth = 0) {
  if (depth > 18) return;
  const schema = dereference(spec, raw);
  const variants = schema.anyOf || schema.oneOf;
  if (variants) {
    if (variants.some((variant) => {
      try {
        validateSchema(spec, variant, value, label, depth + 1);
        return true;
      } catch {
        return false;
      }
    })) return;
    throw new Error(label + ": Wert passt zu keiner erlaubten Variante.");
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (value === null && types.includes("null")) return;
  const type = schemaType(schema);
  const valid = type === "object" ? value && typeof value === "object" && !Array.isArray(value) : type === "array" ? Array.isArray(value) : type === "integer" ? Number.isInteger(value) : type === "number" ? typeof value === "number" && Number.isFinite(value) : type === "boolean" ? typeof value === "boolean" : type === "null" ? value === null : typeof value === "string";
  if (schema.type && !valid) throw new Error(`${label}: ${type} erwartet.`);
  if (schema.enum && !schema.enum.includes(value) && !schema["x-speakeasy-unknown-values"]) throw new Error(label + ": Nicht erlaubter Wert.");
  if (typeof value === "number") {
    if (schema.minimum !== void 0 && value < schema.minimum) throw new Error(`${label}: mindestens ${schema.minimum}.`);
    if (schema.maximum !== void 0 && value > schema.maximum) throw new Error(`${label}: höchstens ${schema.maximum}.`);
  }
  if (typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength) throw new Error(label + ": Eingabe ist zu kurz.");
    if (schema.maxLength && value.length > schema.maxLength) throw new Error(label + ": Eingabe ist zu lang.");
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) throw new Error(label + ": Liste ist zu kurz.");
    if (schema.maxItems && value.length > schema.maxItems) throw new Error(label + ": Liste ist zu lang.");
    if (schema.items) value.forEach((item, i) => validateSchema(spec, schema.items, item, `${label}[${i}]`, depth + 1));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (value[key] === void 0) throw new Error(`${label}: ${key} fehlt.`);
    for (const [key, item] of Object.entries(value)) if (schema.properties?.[key]) validateSchema(spec, schema.properties[key], item, `${label}.${key}`, depth + 1);
  }
}
function sampleValue(spec, raw, depth = 0) {
  const schema = fieldSchema(spec, raw);
  if (schema.example !== void 0) return schema.example;
  if (schema.default !== void 0) return schema.default;
  if (schema.enum?.length) return schema.enum.find((x) => x !== null);
  const type = schemaType(schema);
  if (type === "array") return depth > 3 ? [] : [sampleValue(spec, schema.items || {}, depth + 1)];
  if (type === "object") return depth > 3 ? {} : Object.fromEntries((schema.required || []).map((key) => [key, sampleValue(spec, schema.properties?.[key] || {}, depth + 1)]));
  return type === "boolean" ? false : ["integer", "number"].includes(type) ? schema.minimum ?? 1 : "";
}
function buildOperationPath(template, values) {
  return template.replace(/\{([^}]+)\}/g, (_, name) => {
    if (!String(values[name] ?? "").trim()) throw new Error(`Pfadfeld ${name} fehlt.`);
    return encodeURIComponent(String(values[name]));
  });
}

// src/ui/api-fields.js
var names = { model: "Modell", prompt: "Beschreibung", input: "Eingabe", messages: "Nachrichten", voice: "Stimme", response_format: "Antwortformat", file: "Datei", source_url: "Dateiadresse", language: "Sprache", duration: "Dauer in Sekunden", aspect_ratio: "Seitenverhältnis", resolution: "Auflösung", background: "Hintergrund", quality: "Qualität", name: "Name", limit: "Limit", user: "Nutzerkennung", stream: "Antwort streamen", instructions: "Anweisungen", n: "Anzahl", size: "Größe", max_tokens: "Maximale Antwortlänge", max_completion_tokens: "Maximale Antwortlänge", temperature: "Kreativität", speed: "Sprechgeschwindigkeit" };
function makeAPIField(spec, name, raw, { required = false, initial, modelList = "api-model-options" } = {}) {
  const schema = fieldSchema(spec, raw), type = schemaType(schema);
  const label = names[name] || name.replace(/_/g, " ");
  const wrap = el("label", { className: "feature-field" + (["object", "array"].includes(type) ? " field-wide" : "") });
  wrap.append(el("span", {}, label + (required ? " *" : "")));
  let control;
  if (schema.format === "binary") control = el("input", { type: "file" });
  else if (schema.enum?.length || type === "boolean") {
    control = el("select", {});
    if (!required) control.append(el("option", { value: "" }, "Standard"));
    for (const option of type === "boolean" ? [true, false] : schema.enum.filter((x) => x !== null)) control.append(el("option", { value: String(option) }, type === "boolean" ? option ? "Ja" : "Nein" : String(option)));
  } else if (["object", "array"].includes(type) || ["input", "prompt", "instructions", "description"].includes(name)) control = el("textarea", { rows: ["object", "array"].includes(type) ? "5" : "3", className: ["object", "array"].includes(type) ? "json-editor" : "", spellcheck: "false" });
  else control = el("input", { type: ["integer", "number"].includes(type) ? "number" : /secret|password|token|credential/i.test(name) ? "password" : "text", ...["integer", "number"].includes(type) ? { step: type === "integer" ? "1" : "any", ...schema.minimum !== void 0 ? { min: schema.minimum } : {}, ...schema.maximum !== void 0 ? { max: schema.maximum } : {} } : {}, ...name === "model" ? { list: modelList } : {}, autocomplete: "off" });
  control.setAttribute("aria-label", label);
  control.dataset.apiName = name;
  if (schema.format !== "binary" && initial !== void 0) control.value = ["object", "array"].includes(type) ? JSON.stringify(initial, null, 2) : String(initial);
  if (required && schema.format !== "binary") control.required = true;
  wrap.append(control);
  if (schema.description) {
    const help = el("details", { className: "field-help" });
    help.append(el("summary", {}, "Beschreibung"), el("p", {}, schema.description));
    wrap.append(help);
  }
  const read = () => {
    if (schema.format === "binary") {
      const file = control.files?.[0];
      if (required && !file) throw new Error(label + ": Datei fehlt.");
      return file;
    }
    if (control.value === "") {
      if (required) throw new Error(label + ": Eingabe fehlt.");
      return void 0;
    }
    if (["object", "array"].includes(type)) {
      try {
        return JSON.parse(control.value);
      } catch {
        throw new Error(label + ": ungültiges JSON.");
      }
    }
    if (["integer", "number"].includes(type)) {
      const value = Number(control.value);
      if (!Number.isFinite(value) || type === "integer" && !Number.isInteger(value)) throw new Error(label + ": gültige Zahl erwartet.");
      return value;
    }
    if (type === "boolean") return control.value === "true";
    return control.value;
  };
  return { wrap, control, read, schema };
}

// src/ui/openrouter.js
var specPromise;
function loadAPISpec() {
  if (specPromise) return specPromise;
  specPromise = fetch("/openrouter-catalog.json").then((r) => {
    if (!r.ok) throw new Error("API-Katalog konnte nicht geladen werden.");
    return r.json();
  }).catch((e) => {
    specPromise = null;
    throw e;
  });
  return specPromise;
}
var featured = [
  ["Bild erzeugen", "POST /images"],
  ["Sprache erzeugen", "POST /audio/speech"],
  ["Audio transkribieren", "POST /audio/transcriptions"],
  ["Video erzeugen", "POST /videos"],
  ["Responses", "POST /responses"],
  ["Embeddings", "POST /embeddings"],
  ["Guthaben", "GET /credits"],
  ["Dateien", "GET /files"],
  ["Server-Tools", "GET /tools"],
  ["Nutzungsdaten", "GET /activity"]
];
var groupLabels = { Chat: "Chat", Responses: "Responses", Messages: "Messages", Images: "Bilder", Audio: "Audio", Videos: "Videos", Embeddings: "Embeddings", Files: "Dateien", Providers: "Provider", Models: "Modelle", Keys: "API-Keys", "API Keys": "API-Keys", Credits: "Guthaben", Activity: "Nutzung", Workspaces: "Arbeitsbereiche", Guardrails: "Guardrails", Presets: "Presets", Analytics: "Analysen" };
var getGroup = (op) => op.tags?.[0] || op.path.split("/")[1];
var operationLabels = {
  "POST /images": "Bild erzeugen",
  "GET /images/models": "Bildmodelle durchsuchen",
  "POST /audio/speech": "Sprache erzeugen",
  "POST /audio/transcriptions": "Audio transkribieren",
  "POST /videos": "Video erzeugen",
  "GET /videos/models": "Videomodelle durchsuchen",
  "POST /responses": "Antwort erzeugen (Responses)",
  "POST /messages": "Antwort erzeugen (Messages)",
  "POST /chat/completions": "Chat-Antwort erzeugen",
  "POST /embeddings": "Embeddings erzeugen",
  "GET /credits": "Guthaben abrufen",
  "GET /key": "Aktuellen Key prüfen",
  "GET /generation": "Nutzungsdetails einer Antwort",
  "GET /models": "Modelle durchsuchen",
  "GET /models/user": "Für meinen Key verfügbare Modelle",
  "GET /files": "Dateien durchsuchen",
  "POST /files": "Datei hochladen",
  "GET /activity": "Nutzung abrufen",
  "GET /keys": "API-Keys durchsuchen",
  "POST /keys": "API-Key erstellen",
  "GET /tools": "Server-Tools durchsuchen",
  "GET /providers": "Provider durchsuchen",
  "GET /workspaces": "Arbeitsbereiche durchsuchen",
  "GET /presets": "Presets durchsuchen"
};
var operationLabel = (op) => operationLabels[op.id] || op.summary || op.operationId;
var inference = /^\/(chat\/completions|responses|messages|embeddings|rerank|images|videos|audio\/|api\/alpha\/decisions|systemone|interns\/[^/]+\/(chat\/completions|invoke))/.source;
async function showOpenRouter(initial = {}) {
  let controller, cleanupResult, cleanupResize;
  const { content, panel, actions: panelActions, formId } = openFeaturePanel("OpenRouter", { wide: true, onClose: () => {
    controller?.abort();
    cleanupResult?.();
    cleanupResize?.();
  } });
  content.append(el("p", { className: "feature-intro" }, "Chat, Medien, Modelle und Verwaltung. Die Formulare folgen der lokal gespeicherten offiziellen API-Spezifikation. Konto- und Organisationsfunktionen benötigen entsprechende Berechtigungen."));
  const loading = el("p", { role: "status" }, "API-Funktionen werden geladen…");
  content.append(loading);
  try {
    let select = function(operation) {
      controller?.abort();
      cleanupResult?.();
      cleanupResult = null;
      selected = operation;
      renderList();
      main.replaceChildren();
      const heading = el("div", { className: "api-title" });
      heading.append(el("h3", {}, operationLabel(operation)), el("code", {}, operation.id));
      main.append(heading);
      if (operation.deprecated) main.append(el("p", { className: "feature-note" }, "Diese Funktion ist von OpenRouter als veraltet markiert."));
      if (operation.description) {
        const info = el("details", { className: "api-description" });
        info.append(el("summary", {}, "API-Beschreibung"), el("p", {}, operation.description));
        main.append(info);
      }
      const form = el("form", { className: "feature-form api-request-form", id: formId });
      const auth = el("div", { className: "feature-fields" });
      const source = el("select", { "aria-label": "Zugangsschlüssel" });
      source.append(el("option", { value: "chat" }, "Chat-Key"), el("option", { value: "management" }, "Anderen / Management-Key verwenden"), el("option", { value: "none" }, "Ohne Key (öffentliche Funktionen)"));
      const keyLabel = el("label", { className: "feature-field" });
      keyLabel.append(el("span", {}, "Zugangsschlüssel"), source);
      auth.append(keyLabel);
      const management = el("input", { type: "password", autocomplete: "off", placeholder: "Nur für diese Anfrage", "aria-label": "Management-Key" });
      management.hidden = true;
      auth.append(management);
      source.onchange = () => {
        management.hidden = source.value !== "management";
      };
      form.append(auth);
      const controls = [];
      const params = el("div", { className: "feature-fields" });
      const headerOptions = el("details", { className: "feature-section" }), headerFields = el("div", { className: "feature-fields" });
      headerOptions.append(el("summary", {}, "Metadaten und HTTP-Header"), headerFields);
      const parameters = [...new Map((operation.parameters || []).map((p) => [p.in + ":" + p.name, p])).values()];
      for (const parameter of parameters) {
        const field = makeAPIField(spec, parameter.name, parameter.schema, { required: parameter.required, initial: operation.id === initial.id && initial.values?.[parameter.name] !== void 0 ? initial.values[parameter.name] : parameter.required ? parameter.example ?? sampleValue(spec, parameter.schema) : void 0 });
        if (parameter.in === "header") headerFields.append(field.wrap);
        else params.append(field.wrap);
        controls.push({ ...field, name: parameter.name, place: parameter.in, required: parameter.required, raw: parameter.schema });
      }
      form.append(params);
      const contentTypes = Object.entries(operation.requestBody?.content || {});
      if (contentTypes.length && !contentTypes.some(([mime]) => mime === bodyType)) bodyType = contentTypes[0][0];
      if (contentTypes.length > 1) {
        const encoding = el("select", { "aria-label": "Eingabeformat" });
        for (const [mime] of contentTypes) encoding.append(el("option", { value: mime }, mime === "multipart/form-data" ? "Datei hochladen" : "JSON"));
        encoding.value = bodyType;
        encoding.onchange = () => {
          bodyType = encoding.value;
          select(operation);
        };
        form.append(encoding);
      }
      const definition = contentTypes.find(([mime]) => mime === bodyType)?.[1];
      const bodySchema = dereference(spec, definition?.schema || {});
      const values = definition?.example || bodySchema.example || {};
      const bodyFields = el("div", { className: "feature-fields" });
      let rawBody;
      if (definition) {
        const properties = bodySchema.properties;
        if (properties) {
          const priority = ["model", "input", "prompt", "messages", "file", "source_url", "voice", "response_format", "duration", "aspect_ratio", "resolution", "n"];
          const sorted = Object.entries(properties).sort(([a], [b]) => (priority.includes(a) ? priority.indexOf(a) : 99) - (priority.includes(b) ? priority.indexOf(b) : 99));
          for (const [name, raw] of sorted) {
            const required = (bodySchema.required || []).includes(name);
            let initialValue = required ? values[name] ?? sampleValue(spec, raw) : void 0;
            if (operation.id === initial.id && initial.values?.[name] !== void 0) initialValue = initial.values[name];
            if (operation.path === "/audio/speech" && name === "response_format") initialValue = "mp3";
            const field = makeAPIField(spec, name, raw, { required, initial: initialValue });
            const basic = required || ["prompt", "input", "source_url", "file", "voice", "response_format", "aspect_ratio", "resolution", "duration", "n", "language", "stream", "size", "temperature"].includes(name);
            if (basic) bodyFields.append(field.wrap);
            else {
              let optional = form.querySelector(".api-optional");
              if (!optional) {
                optional = el("details", { className: "feature-section api-optional" });
                optional.append(el("summary", {}, "Weitere Optionen"), el("div", { className: "feature-fields" }));
                form.append(optional);
              }
              optional.lastElementChild.append(field.wrap);
            }
            controls.push({ ...field, name, place: "body", required, raw });
          }
        } else {
          const field = makeAPIField(spec, "Anfrage", bodySchema, { required: true, initial: sampleValue(spec, bodySchema) });
          rawBody = field;
          bodyFields.append(field.wrap);
        }
      }
      form.insertBefore(bodyFields, form.querySelector(".api-optional"));
      if (headerFields.children.length) form.append(headerOptions);
      let fullJSON;
      if (definition && bodyType === "application/json" && bodySchema.properties) {
        const advanced = el("details", { className: "feature-section" }), toggle = el("input", { type: "checkbox", "aria-label": "Vollständige JSON-Anfrage verwenden" });
        const label = el("label", { className: "feature-field feature-checkbox" });
        label.append(toggle, el("span", {}, "Vollständige JSON-Anfrage verwenden"));
        const editor = el("textarea", { rows: "12", className: "json-editor", spellcheck: "false", "aria-label": "Vollständige JSON-Anfrage" });
        editor.value = JSON.stringify(values && Object.keys(values).length ? values : sampleValue(spec, bodySchema), null, 2);
        editor.disabled = true;
        advanced.append(el("summary", {}, "Vollständige Anfrage bearbeiten"), label, editor);
        form.append(advanced);
        toggle.onchange = () => {
          editor.disabled = !toggle.checked;
          for (const field of controls.filter((f) => f.place === "body")) field.control.disabled = toggle.checked;
        };
        fullJSON = { toggle, editor };
      }
      const modelList = el("datalist", { id: "api-model-options" });
      for (const model of store.models) modelList.append(el("option", { value: model.id }, model.name || model.id));
      form.append(modelList);
      if (controls.some((c) => c.name === "model")) {
        const loadModels = el("button", { type: "button", className: "feature-secondary" }, "Passende Modelle laden");
        loadModels.onclick = async () => {
          if (store.demoMode) {
            toast("Im Demo-Modus werden nur die Beispielmodelle angezeigt.", "info");
            return;
          }
          loadModels.disabled = true;
          try {
            const endpoint = operation.path === "/images" ? "/images/models" : operation.path === "/videos" ? "/videos/models" : operation.path === "/embeddings" ? "/embeddings/models" : "/models";
            const result = await requestOpenRouter(endpoint, { key: source.value === "management" ? management.value.trim() : store.apiKey });
            modelList.replaceChildren();
            for (const model of result.data.data || []) modelList.append(el("option", { value: model.id }, model.name || model.id));
            toast("Modellliste aktualisiert", "success");
          } catch (error) {
            toast(error.message, "error");
          } finally {
            loadModels.disabled = false;
          }
        };
        form.append(loadModels);
      }
      const preview = el("details", { className: "api-json" }), previewText = el("pre", {});
      preview.append(el("summary", {}, "Anfrage prüfen"), previewText);
      form.append(preview);
      const mutates = operation.method !== "GET" && !new RegExp(inference).test(operation.path);
      const confirm = el("input", { type: "checkbox", "aria-label": "Änderung bestätigen" });
      if (mutates) {
        const label = el("label", { className: "feature-field feature-checkbox field-wide" });
        label.append(confirm, el("span", {}, "Die ausgewählte Änderung an meinem OpenRouter-Konto ausführen."));
        form.append(label);
      }
      const status = el("p", { className: "feature-error", role: "status", "aria-live": "polite" });
      const send = el("button", { type: "submit", form: formId, className: "feature-primary" }, operation.method === "GET" ? "Abrufen" : "Anfrage ausführen"), stop = el("button", { type: "button", className: "feature-secondary", disabled: "" }, "Abbrechen");
      stop.onclick = () => controller?.abort();
      panelActions.replaceChildren(stop, send);
      form.append(status);
      main.append(form);
      const output = el("div", { className: "api-result", "aria-label": "API-Ergebnis", "aria-live": "polite" });
      main.append(output);
      if (innerWidth <= 768) catalogue.open = false;
      else list.querySelector(".api-operation.active")?.scrollIntoView({ block: "start" });
      content.scrollTop = 0;
      function collect() {
        const path = {}, query = {}, headers = {}, body = {};
        let multipart;
        if (bodyType === "multipart/form-data" && definition) multipart = new FormData();
        for (const field of controls) {
          if (field.place === "body" && fullJSON?.toggle.checked) continue;
          const value = field.read();
          if (value === void 0) continue;
          if (field.place === "path") path[field.name] = value;
          else if (field.place === "query") query[field.name] = value;
          else if (field.place === "header") headers[field.name] = value;
          else if (multipart) {
            for (const item of Array.isArray(value) ? value : [value]) multipart.append(field.name, item instanceof Blob ? item : typeof item === "object" ? JSON.stringify(item) : String(item));
          } else body[field.name] = value;
        }
        let requestBody = rawBody ? rawBody.read() : body;
        if (fullJSON?.toggle.checked) {
          try {
            requestBody = JSON.parse(fullJSON.editor.value);
          } catch {
            throw new Error("Vollständige Anfrage: ungültiges JSON.");
          }
        }
        if (definition && !multipart) validateSchema(spec, definition.schema, requestBody);
        return { endpoint: buildOperationPath(operation.path, path), query, headers, body: definition && !multipart ? requestBody : void 0, form: multipart };
      }
      preview.addEventListener("toggle", () => {
        if (preview.open) {
          try {
            const r = collect();
            previewText.textContent = JSON.stringify({ method: operation.method, path: r.endpoint, query: r.query, body: r.body, files: r.form ? [...r.form.keys()] : void 0 }, null, 2);
          } catch (error) {
            previewText.textContent = error.message;
          }
        }
      });
      form.onsubmit = async (event) => {
        event.preventDefault();
        if (send.disabled) return;
        if (store.demoMode) {
          status.textContent = "Im Demo-Modus werden keine API-Anfragen ausgeführt. Verbinde einen Key, um diese Funktion zu nutzen.";
          return;
        }
        if (mutates && !confirm.checked) {
          status.textContent = "Bestätige zuerst die ausgewählte Kontoänderung.";
          return;
        }
        let req, key;
        try {
          req = collect();
          key = source.value === "management" ? management.value.trim() : source.value === "none" ? "" : store.apiKey;
          if (source.value !== "none" && !key) throw new Error("Ein passender API-Key fehlt.");
        } catch (error) {
          status.textContent = error.message;
          return;
        }
        controller = new AbortController();
        send.disabled = true;
        stop.disabled = false;
        status.textContent = "Anfrage läuft…";
        cleanupResult?.();
        output.replaceChildren();
        try {
          const result = await requestOpenRouter(req.endpoint, { ...req, method: operation.method, key, signal: controller.signal, timeout: 3e5, onEvent: (data) => {
            status.textContent = "Streaming-Antwort wird empfangen…";
            output.textContent = JSON.stringify(data, null, 2);
          } });
          if (!panel.isConnected || selected.id !== operation.id) return;
          status.textContent = "Anfrage abgeschlossen.";
          cleanupResult = showAPIResult(output, result, { endpoint: operation.path, key, body: req.body, signal: controller.signal });
        } catch (error) {
          if (panel.isConnected && selected.id === operation.id) status.textContent = error.name === "AbortError" ? "Anfrage abgebrochen." : error.message;
        } finally {
          send.disabled = false;
          stop.disabled = true;
        }
      };
    };
    const spec = await loadAPISpec();
    if (!panel.isConnected) return;
    const operations = listOperations(spec);
    loading.remove();
    const quick = el("div", { className: "api-quick" });
    const workspace = el("div", { className: "api-workspace" }), nav = el("nav", { className: "api-navigation", "aria-label": "API-Funktionen" }), main = el("div", { className: "api-main" });
    const search = el("input", { type: "search", placeholder: "Funktion suchen…", "aria-label": "API-Funktion suchen", className: "api-search" });
    const group = el("select", { "aria-label": "API-Kategorie" });
    group.append(el("option", { value: "" }, `Alle Funktionen (${operations.length})`));
    for (const tag of [...new Set(operations.map(getGroup))].sort()) group.append(el("option", { value: tag }, groupLabels[tag] || tag));
    const list = el("div", { className: "api-operation-list" });
    const catalogue = el("details", { className: "api-catalogue", ...innerWidth > 768 ? { open: "" } : {} });
    const breakpoint = matchMedia("(max-width:768px)");
    const resizeCatalogue = (event) => {
      catalogue.open = !event.matches;
    };
    breakpoint.addEventListener("change", resizeCatalogue);
    cleanupResize = () => breakpoint.removeEventListener("change", resizeCatalogue);
    catalogue.append(el("summary", {}, "Funktionen durchsuchen"), list);
    nav.append(search, group, catalogue);
    workspace.append(nav, main);
    content.append(quick, workspace);
    let selected, bodyType = "application/json";
    const renderList = () => {
      const query = search.value.toLowerCase();
      list.replaceChildren();
      const visible = operations.filter((op) => (!group.value || getGroup(op) === group.value) && (!query || `${operationLabel(op)} ${op.summary} ${op.id} ${getGroup(op)}`.toLowerCase().includes(query)));
      for (const op of visible) {
        const button = el("button", { type: "button", className: "api-operation" + (selected?.id === op.id ? " active" : ""), "aria-pressed": String(selected?.id === op.id), "data-operation": op.id });
        button.append(el("span", { className: "api-method" }, op.method), el("span", {}, operationLabel(op)));
        button.onclick = () => select(op);
        list.append(button);
      }
      if (!visible.length) list.append(el("p", {}, "Keine passenden Funktionen."));
    };
    search.oninput = () => {
      catalogue.open = true;
      renderList();
    };
    group.onchange = () => {
      catalogue.open = true;
      renderList();
    };
    for (const [label, id] of featured) {
      const button = el("button", { type: "button", className: "feature-secondary" }, label);
      button.onclick = () => {
        const op = operations.find((o) => o.id === id);
        if (op) {
          group.value = "";
          search.value = "";
          select(op);
          content.scrollTop = 0;
        }
      };
      quick.append(button);
    }
    select(operations.find((op) => op.id === (initial.id || "GET /credits")) || operations[0]);
  } catch (error) {
    loading.textContent = error.message;
  }
}

// src/ui/messages.js
function renderMessages() {
  completionScrollCleanup?.(); completionScrollCleanup = undefined;
  const container = document.getElementById("chat-container");
  if (!container) return;
  welcomeCleanup?.();
  welcomeCleanup = undefined;
  messageCleanups.forEach((dispose) => dispose());
  messageCleanups = [];
  const chat = store.getChat();
  const indicator = container.querySelector("#typing-ind");
  const isEmpty = !chat || !chat.messages.length;
  container.closest(".main-area").classList.toggle("is-empty", isEmpty);
  const isSameChat = uiState.lastActiveChatId === store.activeChatId;
  const wasAtBottom = isNearBottom(container);
  if (!chat || !chat.messages.length) {
    container.innerHTML = "";
    const empty = el("div", { className: "empty-state" });
    container.appendChild(empty);
    welcomeCleanup = studioViews.mountWelcome(empty, document.getElementById("chat-starters"));
    return;
  }
  container.innerHTML = `<div class="chat-messages" id="chat-messages"></div>`;
  const msgContainer = container.querySelector("#chat-messages");
  if (store.settings.systemPrompt) {
    const sysEl = el("div", { className: "msg msg-system" });
    sysEl.innerHTML = `<div class="msg-role">System</div><div class="msg-content">${esc(store.settings.systemPrompt)}</div>`;
    msgContainer.appendChild(sysEl);
  }
  const frag = document.createDocumentFragment();
  chat.messages.forEach((msg) => {
    frag.appendChild(createMessageEl(msg, chat));
  });
  msgContainer.appendChild(frag);
  if (indicator) msgContainer.append(indicator);
  highlightCode(msgContainer);
  if (store.settings.autoScroll && (!isSameChat || wasAtBottom)) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}
function parseReasoningSteps(text) {
  if (!text) return [];
  const steps = [];
  const current = [];
  let openFence = null;
  const lines = String(text).split("\n");
  for (const line of lines) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1];
      const char = marker[0];
      const len = marker.length;
      if (!openFence) {
        openFence = { char, len };
      } else if (char === openFence.char && len >= openFence.len) {
        openFence = null;
      }
    }
    if (!openFence && !line.trim()) {
      const part = current.join("\n").trim();
      if (part) steps.push(part);
      current.length = 0;
      continue;
    }
    current.push(line);
  }
  const tail = current.join("\n").trim();
  if (tail) steps.push(tail);
  if (steps.length === 1 && steps[0].length > 900) {
    const byHeadings = steps[0].split(/\n(?=(?:#{1,6}\s+|\d+[.)]\s+|[-*]\s+))/).map((s) => s.trim()).filter(Boolean);
    if (byHeadings.length > 1) return byHeadings;
  }
  return steps.length ? steps : [text];
}
function getMessageRenderParts(msg) {
  const attachments = getMessageAttachments(msg);
  const attachmentsKey = attachments.map((att) => `${att.kind || ""}:${att.name || ""}:${att.size || 0}:${String(att.data || att.text || "").length}`).join("|");
  const reasoningText = msg.reasoning || extractReasoningText(msg.reasoning_details) || "";
  const key = [
    msg.role,
    msg.error ? "1" : "0",
    msg.content || "",
    reasoningText,
    attachmentsKey, JSON.stringify(msg.activityEvents || [])
  ].join("");
  const cached = messageRenderCache.get(msg);
  if (cached?.key === key) return cached.parts;
  const visibleContent = msg.role === "assistant" ? distinctAnswer(msg.content || "", reasoningText) : msg.content;
  const contentHtml = msg.role === "assistant" ? visibleContent.trim() ? renderMd(visibleContent) : reasoningText ? `<p class="reasoning-only-note">${msg.finishReason === "length" ? "Das Tokenlimit wurde beim Nachdenken erreicht. Erhöhe Max Tokens, damit das Modell eine Antwort ausgeben kann." : "Das Modell hat Reasoning, aber keine abschließende Antwort geliefert."}</p>` : "" : `<p>${esc(msg.content).replace(/\n/g, "<br>")}</p>`;
  const reasoningHtml = reasoningText.length > 0 || msg.activityEvents?.length ? '<div class="reasoning-mount"></div>' : "";
  const imagesHtml = attachments.length ? `<div class="msg-attachments">${attachments.map(
    (att) => att.kind === "image" ? `<img class="msg-attachment-img" src="${escAttr(att.data)}" alt="${escAttr(att.name)}">` : `<div class="attached-chip"><span class="file-icon">${esc(fileExt(att.name).slice(0, 3).toUpperCase() || "TXT")}</span><span title="${escAttr(att.name)}">${esc(att.name)}</span></div>`
  ).join("")}</div>` : "";
  const parts = { contentHtml, reasoningHtml, imagesHtml };
  messageRenderCache.set(msg, { key, parts });
  return parts;
}
function createMessageEl(msg, chat, live = null) {
  const errorClass = msg.error ? " msg-error" : "";
  const div = live || el("div", { className: `msg msg-${msg.role}${errorClass}` });
  div.dataset.renderId ||= uuid();
  div.dataset.messageId = msg.id;
  const liveBody = live?.querySelector("#stream-content");
  const liveActivity = live?.querySelector("#stream-activity");
  const isEditing = uiState.editingMsgId === msg.id;
  if (isEditing) {
    div.innerHTML = `
    <div class="msg-role">Du</div>
    <textarea class="edit-ta">${esc(msg.content)}</textarea>
    <div class="edit-actions">
      <button class="edit-cancel btn-secondary">Abbrechen</button>
      <button class="edit-save btn-accent">Senden</button>
    </div>
  `;
    setTimeout(() => {
      const ta = div.querySelector(".edit-ta");
      if (ta) {
        ta.focus();
        ta.selectionStart = ta.value.length;
      }
    }, 50);
    div.querySelector(".edit-cancel").onclick = () => {
      uiState.editingMsgId = null;
      renderMessages();
    };
    div.querySelector(".edit-save").onclick = () => {
      const ta = div.querySelector(".edit-ta");
      msg.content = ta.value;
      uiState.editingMsgId = null;
      const idx = chat.messages.indexOf(msg);
      chat.messages = chat.messages.slice(0, idx + 1);
      store.save();
      renderMessages();
      sendChatMessage(msg.content, true);
    };
    return div;
  }
  const { contentHtml, reasoningHtml, imagesHtml } = getMessageRenderParts(msg);
  const generatedHTML = (msg.generatedImages || []).map((image) => {
    const url = safeMediaURL(image.image_url?.url, "image");
    return url ? `<a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer"><img class="generated-image" src="${escAttr(url)}" alt="Generiertes Bild"></a>` : "";
  }).join("");
  const audioURL = msg.audio?.data ? safeMediaURL(`data:audio/${msg.audio.format === "mp3" ? "mpeg" : msg.audio.format || "wav"};base64,${msg.audio.data}`, "audio") : "";
  const pcmAudio = ["pcm16", "pcm"].includes(msg.audio?.format);
  const audioHTML = !audioURL ? "" : pcmAudio ? `<a class="feature-secondary" download="openrouter-audio.pcm" href="${escAttr(audioURL)}">PCM-Audiodatei speichern</a>` : `<audio controls preload="metadata" src="${escAttr(audioURL)}" aria-label="Audioantwort"></audio>`;
  const mediaHTML = `${generatedHTML ? `<div class="generated-media">${generatedHTML}</div>` : ""}${audioHTML}`;
  let metaParts = [];
  if (msg.role === "assistant") {
    if (msg.model) {
      const m = store.modelMap[msg.model];
      metaParts.push(m ? (m.name || m.id).split("/").pop() : msg.model.split("/").pop());
    }
    if (msg.providerTag || msg.providerName) metaParts.push(`via ${msg.providerName || msg.providerTag}`);
    if (msg.duration) metaParts.push(`${(msg.duration / 1e3).toFixed(1)}s`);
    if (msg.tokens && !(msg.aborted && !msg.tokens.prompt && !msg.tokens.completion)) metaParts.push(`${msg.tokens.prompt || 0}+${msg.tokens.completion || 0} tok`);
    else if (msg.aborted) metaParts.push("Tokenverbrauch nicht gemeldet");
    if (msg.cost) metaParts.push(formatCost(msg.cost));
  } else {
    metaParts.push(formatDate(msg.ts));
  }
  let actionsHtml = `<span class="msg-actions" aria-label="Nachrichtenaktionen">`;
  actionsHtml += `<button data-act="copy" title="Kopieren" aria-label="Nachricht kopieren">${IC.copy}</button>`;
  if (msg.role === "user") actionsHtml += `<button data-act="edit" title="Bearbeiten" aria-label="Nachricht bearbeiten">${IC.edit}</button>`;
  if (msg.role === "assistant" && !msg.error) actionsHtml += `<button data-act="regen" title="Neu generieren" aria-label="Neu generieren">${IC.refresh}</button>`;
  if (msg.error) actionsHtml += `<button data-act="retry" title="Erneut versuchen" aria-label="Erneut versuchen">${IC.refresh}</button>`;
  if (msg.generationId) actionsHtml += `<button data-act="generation" title="Nutzungsdetails" aria-label="Nutzungsdetails dieser Antwort">${IC.dollar}</button><button data-act="feedback" title="Feedback" aria-label="Feedback zu dieser Antwort">${IC.bug}</button>`;
  actionsHtml += `<button data-act="del" title="Löschen" aria-label="Nachricht löschen">${IC.trash}</button>`;
  actionsHtml += `</span>`;
  const modelLabel = msg.model ? (store.modelMap[msg.model]?.name || msg.model).split("/").pop() : "OpenRouter";
  const sources = normalizeCitations([...(Array.isArray(msg.sources) ? msg.sources : []), ...citationSources(msg.annotations)]);
  const toolChipsHtml = msg.role === "assistant" && !msg.error ? `<div class="msg-tool-chips" aria-label="Antwortdetails">
      <span class="tool-chip">${IC.think}<span>${esc(modelLabel)}</span></span>
      ${sources.length ? `<span class="tool-chip success">${IC.globe}<span>Quellen</span><span class="chip-dot"></span></span>` : ""}
      ${(msg.content || "").includes("```") ? `<span class="tool-chip success">${IC.file}<span>Code</span><span class="chip-dot"></span></span>` : ""}
      ${msg.duration ? `<span class="tool-chip"><span>${(msg.duration / 1e3).toFixed(1)} s</span></span>` : ""}
    </div>` : "";
  const followupsHtml = Array.isArray(msg.followups) && msg.followups.length ? `<div class="followups"><div class="followups-label">Weiterführende Fragen</div><div class="followups-list">${msg.followups.map((item) => `<button class="followup-btn" type="button" data-followup="${escAttr(item)}"><span>${esc(item)}</span><span aria-hidden="true">→</span></button>`).join("")}</div></div>` : "";
  const shell = document.createElement("div");
  shell.innerHTML = `
  <div class="msg-role">${msg.role === "user" ? "Du" : msg.role === "assistant" ? msg.error ? "Fehler" : "Assistent" : msg.role === "tool" ? "Werkzeugergebnis" : msg.role}</div>
  ${toolChipsHtml}
  ${reasoningHtml}
  <div class="msg-content">${contentHtml}</div>
  ${imagesHtml}
  ${mediaHTML}
  ${sources.length ? '<div class="source-mount"></div>' : ""}
  <div class="msg-meta"><span>${metaParts.map(esc).join(" · ")}</span>${actionsHtml}</div>
  ${followupsHtml}
`;
  const replacements = new Map();
  if (liveBody) {
    liveBody.removeAttribute("id");
    patchMarkdown(liveBody, contentHtml);
    replacements.set(shell.querySelector(":scope > .msg-content"), liveBody);
  }
  const savedReasoning = msg.reasoning || extractReasoningText(msg.reasoning_details) || "";
  if (liveActivity && (savedReasoning || msg.activityEvents?.length) && activityView) {
    liveActivity.removeAttribute("id"); liveActivity.className = "reasoning-mount";
    replacements.set(shell.querySelector(".reasoning-mount"), liveActivity);
    activityView.settle({ ...activity, events: msg.activityEvents || [], phase: "done", reasoning: Boolean(savedReasoning), reasoningText: savedReasoning, duration: msg.duration, aborted: msg.aborted, hasAnswer: Boolean(msg.content?.trim()) });
    messageCleanups.push(activityView.dispose);
    activityView = undefined;
  }
  if (live) promoteMessageShell(div, shell, replacements);
  else div.replaceChildren(...shell.childNodes);
  const reasoningHost = div.querySelector(".reasoning-mount");
  if (reasoningHost && reasoningHost !== liveActivity) {
    const view = studioViews.mountActivity(reasoningHost, { phase: "done", reasoning: true, demo: store.demoMode,
      events: msg.activityEvents || [], reasoningText: msg.reasoning || extractReasoningText(msg.reasoning_details) || "", duration: msg.duration, aborted: msg.aborted, hasAnswer: Boolean(msg.content?.trim()) });
    messageCleanups.push(view.dispose);
  }
  hardenLinks(div);
  if (sources.length) messageCleanups.push(studioViews.mountSources(div.querySelector(".source-mount"), sources));
  const answerBody = div.querySelector(":scope > .msg-content");
  if (msg.role === "assistant" && answerBody.querySelector("pre > code")) {
    messageCleanups.push(studioViews.mountDiffs(answerBody, msg.diffReviews ?? {}, (block, file, decision) => {
      msg.diffReviews = { ...msg.diffReviews, [block]: { ...msg.diffReviews?.[block], [file]: decision } };
      store.save();
    }));
  }
  if (msg.tool_calls?.length) {
    const section = el("div", { className: "tool-call-block" });
    for (const call of msg.tool_calls) {
      const details = el("details", {});
      details.append(el("summary", {}, "Werkzeug: " + (call.function?.name || call.type)), el("pre", {}, call.function?.arguments || "{}"));
      section.append(details);
    }
    const pending = msg.tool_calls.some((call) => !chat.messages.some((result) => result.role === "tool" && result.tool_call_id === call.id));
    if (pending) {
      const button = el("button", { type: "button", className: "feature-secondary" }, "Werkzeugergebnisse eingeben");
      button.onclick = () => showToolResults(msg, chat);
      section.append(button);
    }
    div.append(section);
  }
  if (msg.aborted) div.append(el("p", { className: "feature-note" }, "Antwort wurde gestoppt."));
  if (store.settings.showDebug && msg.debug) {
    const dbg = el("div", { className: "debug-panel" });
    const contentDiv = el("div", { className: "debug-content", style: "display:none" });
    contentDiv.textContent = JSON.stringify(msg.debug, null, 2);
    const toggle = el("div", { className: "debug-toggle" });
    toggle.textContent = "▶ Debug Info";
    toggle.onclick = () => {
      const vis = contentDiv.style.display === "none";
      contentDiv.style.display = vis ? "block" : "none";
      toggle.textContent = (vis ? "▼" : "▶") + " Debug Info";
    };
    dbg.appendChild(toggle);
    dbg.appendChild(contentDiv);
    div.appendChild(dbg);
  }
  div.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.act === "generation") {
        showOpenRouter({ id: "GET /generation", values: { id: msg.generationId } });
        return;
      }
      if (btn.dataset.act === "feedback") {
        showOpenRouter({ id: "POST /generation/feedback", values: { generation_id: msg.generationId } });
        return;
      }
      if (store.isStreaming && btn.dataset.act !== "copy") {
        toast("Bitte warte auf die laufende Antwort oder stoppe sie.", "info");
        return;
      }
      const act = btn.dataset.act;
      if (act === "copy") copyText(msg.content).then((ok) => toast(ok ? "Kopiert!" : "Kopieren fehlgeschlagen.", ok ? "success" : "error"));
      if (act === "edit") {
        uiState.editingMsgId = msg.id;
        renderMessages();
      }
      if (act === "regen") regenerateMessage(msg, chat);
      if (act === "retry") retryMessage(msg, chat);
      if (act === "del") {
        chat.messages = chat.messages.filter((m) => m.id !== msg.id);
        store.save();
        renderMessages();
      }
    });
  });
  div.querySelectorAll("[data-followup]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (store.demoMode && btn.dataset.followup === "API-Key verbinden") {
        studioViews.open("connect");
        return;
      }
      if (store.demoMode && btn.dataset.followup === "Ein anderes Modell vergleichen") {
        studioViews.open("compare");
        return;
      }
      const input = document.getElementById("msg-input");
      if (!input) return;
      input.value = btn.dataset.followup;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });
  });
  return div;
}

// src/ui/settings.js
var settingsDialog;
function toggleSettings(show) {
  const panel = document.getElementById("settings-panel");
  if (!panel) return;
  settingsDialog?.dispose(); settingsDialog = undefined;
  panel.classList.toggle("visible", show);
  if (show) {
    renderSettingsPanel();
    settingsDialog = openNativeDialog(panel, () => toggleSettings(false), "#close-settings");
  }
}
function renderSettingsPanel() {
  const panel = document.getElementById("settings-panel");
  if (!panel) return;
  const s = store.settings;
  const fmtTemp = (v) => parseFloat(v).toFixed(2);
  const fmtP = (v) => parseFloat(v).toFixed(2);
  const fmtTok = (v) => v > 0 ? String(v) : "auto";
  panel.innerHTML = `
  <div class="panel-head">
    <h2>Einstellungen</h2>
    <button class="btn-icon" id="close-settings" title="Einstellungen schließen" aria-label="Einstellungen schließen">${IC.x}</button>
  </div>
  <nav class="settings-nav" aria-label="Einstellungsbereiche"></nav>
  <div class="settings-body">

    <div class="setting-section">
      <h3>System Prompt</h3>
      <div class="setting-row">
        <textarea id="set-sysprompt" placeholder="Optionaler System Prompt…">${esc(s.systemPrompt)}</textarea>
      </div>
    </div>

    <div class="setting-section">
      <h3>Modellparameter</h3>
      <div class="setting-row">
        <label>Temperatur <span class="val" id="lbl-temp">${fmtTemp(s.temperature)}</span></label>
        <input type="range" id="set-temp" min="0" max="2" step="0.05" value="${s.temperature}">
      </div>
      <div class="setting-row">
        <label>Top P <span class="val" id="lbl-topp">${fmtP(s.topP)}</span></label>
        <input type="range" id="set-topp" min="0" max="1" step="0.05" value="${s.topP}">
      </div>
      <div class="setting-row">
        <label>Max Tokens <span class="val" id="lbl-maxt">${fmtTok(s.maxTokens)}</span></label>
        <input type="range" id="set-maxt" min="0" max="16384" step="64" value="${s.maxTokens}">
      </div>
      <div class="setting-row">
        <label>Presence Penalty <span class="val" id="lbl-pp">${fmtP(s.presencePenalty)}</span></label>
        <input type="range" id="set-pp" min="-2" max="2" step="0.1" value="${s.presencePenalty}">
      </div>
      <div class="setting-row">
        <label>Frequency Penalty <span class="val" id="lbl-fp">${fmtP(s.frequencyPenalty)}</span></label>
        <input type="range" id="set-fp" min="-2" max="2" step="0.1" value="${s.frequencyPenalty}">
      </div>
    </div>

    <div class="setting-section">
      <h3>Oberfläche</h3>
      <label class="theme-setting" for="set-theme">Darstellung<select id="set-theme"><option value="system"${s.theme === "system" ? " selected" : ""}>System</option><option value="light"${s.theme === "light" ? " selected" : ""}>Hell</option><option value="dark"${s.theme === "dark" ? " selected" : ""}>Dunkel</option></select></label>
      <div class="toggle-row">
        <div><div class="tl">Streaming</div><div class="td">Antworten während der Generierung anzeigen</div></div>
        <label class="switch"><input type="checkbox" id="set-stream" ${s.streaming ? "checked" : ""}><span class="slider"></span></label>
      </div>
      <div class="toggle-row">
        <div><div class="tl">Auto-Scroll</div><div class="td">Automatisch zum Ende scrollen (nur wenn schon unten)</div></div>
        <label class="switch"><input type="checkbox" id="set-autoscroll" ${s.autoScroll ? "checked" : ""}><span class="slider"></span></label>
      </div>
      <div class="toggle-row">
        <div><div class="tl">Token anzeigen</div><div class="td">Verbrauch in den Chataktionen anzeigen</div></div>
        <label class="switch"><input type="checkbox" id="set-showtokens" ${s.showTokens ? "checked" : ""}><span class="slider"></span></label>
      </div>
      <div class="toggle-row">
        <div><div class="tl">Kosten anzeigen</div><div class="td">Kostenschätzung pro Nachricht</div></div>
        <label class="switch"><input type="checkbox" id="set-showcosts" ${s.showCosts ? "checked" : ""}><span class="slider"></span></label>
      </div>
      <div class="toggle-row">
        <div><div class="tl">Debug-Modus</div><div class="td">Raw API Request/Response</div></div>
        <label class="switch"><input type="checkbox" id="set-debug" ${s.showDebug ? "checked" : ""}><span class="slider"></span></label>
      </div>
      <div class="toggle-row">
        <div><div class="tl">Kostenlose Modelle anzeigen</div><div class="td">OpenRouter-Modelle mit :free oder 0-Preis in der Modellliste einblenden</div></div>
        <label class="switch"><input type="checkbox" id="set-free-models" ${s.showFreeModels ? "checked" : ""}><span class="slider"></span></label>
      </div>
    </div>

    <div class="setting-section">
      <h3>Kosten & Nutzung</h3>
      <div class="stat-stack">
        <div class="stat-row">
          <span>Gesamtkosten (geschätzt)</span>
          <span class="stat-value accent">${formatCost(store.totalCost)}</span>
        </div>
        <div class="stat-row">
          <span>Chats gesamt</span>
          <span class="stat-value">${store.chats.length}</span>
        </div>
        <div class="stat-row">
          <span>Modelle geladen</span>
          <span class="stat-value">${store.models.length}</span>
        </div>
        <div class="stat-row">
          <span>Favorisierte Modelle</span>
          <span class="stat-value">${store.favModels.length}</span>
        </div>
      </div>
    </div>

    <div class="setting-section">
      <h3>Daten & Sicherheit</h3>
      <div class="settings-actions">
        <button class="btn-primary btn-warn-action" id="set-clear-key">API Key entfernen</button>
        <button class="btn-primary btn-danger-action" id="set-clear-chats">Alle Chats löschen</button>
        <button class="btn-primary btn-neutral-action" id="set-export-all">Einstellungen exportieren (JSON)</button>
        <button class="btn-primary btn-neutral-action" id="set-import-all">Einstellungen importieren (JSON)</button>
        <input type="file" id="import-file" accept=".json" style="display:none">
      </div>
      <div class="security-note">
        <div class="security-note-item">
          <span class="nx-icon">${IC.shield}</span>
          <span>Dein API-Key wird ${s.keyStorage === "local" ? "dauerhaft im localStorage" : "nur für diese Sitzung im sessionStorage"} dieses Browsers gespeichert.</span>
        </div>
        <div class="security-note-item">
          <span class="nx-icon">${IC.key}</span>
          <span>Chat-Anfragen werden direkt an OpenRouter und je nach Modell an den jeweiligen Modellanbieter gesendet. Dauerhafte Speicherung nur auf vertrauenswürdigen Geräten nutzen.</span>
        </div>
      </div>
    </div>

  </div>
`;
  panel.querySelector("#set-theme").onchange = (event) => setTheme(event.target.value);
  const settingsSections = [...panel.querySelectorAll(".setting-section")];
  const settingsNav = panel.querySelector(".settings-nav");
  settingsSections.forEach((section, index) => {
    section.id = `settings-section-${index}`;
    const button = el("button", { type: "button" }, ["Anweisung", "Parameter", "Oberfläche", "Nutzung", "Daten"][index]);
    button.onclick = () => section.scrollIntoView({ block: "start", behavior: "instant" });
    settingsNav.append(button);
  });
  panel.querySelectorAll(".setting-row").forEach((row) => {
    const label = row.querySelector("label");
    const input = row.querySelector("input, textarea");
    if (label && input?.id) label.htmlFor = input.id;
  });
  panel.querySelector("#set-sysprompt").setAttribute("aria-label", "Systemanweisung");
  panel.querySelectorAll(".toggle-row").forEach((row) => row.querySelector("input")?.setAttribute("aria-label", row.querySelector(".tl")?.textContent || ""));
  panel.querySelector("#close-settings")?.setAttribute("aria-label", "Einstellungen schließen");
  panel.querySelector("#set-clear-chats")?.classList.add("btn-danger-action");
  panel.querySelector("#set-export-all")?.classList.add("btn-neutral-action");
  panel.querySelector("#set-import-all")?.classList.add("btn-neutral-action");
  panel.querySelector("#set-clear-chats")?.removeAttribute("style");
  panel.querySelector("#set-export-all")?.removeAttribute("style");
  panel.querySelector("#set-import-all")?.removeAttribute("style");
  panel.querySelector("#close-settings").onclick = () => toggleSettings(false);
  panel.querySelector("#set-sysprompt").addEventListener("input", (e) => {
    s.systemPrompt = e.target.value;
    store.saveDebounced(400);
    updateInputTokenCount();
  });
  const bindSlider = (id, key, lblId, fmt) => {
    const inp = panel.querySelector(id);
    const lbl = panel.querySelector(lblId);
    if (!inp || !lbl) return;
    inp.addEventListener("input", () => {
      const v = parseFloat(inp.value);
      s[key] = v;
      lbl.textContent = fmt(v);
      store.saveDebounced(400);
    });
  };
  bindSlider("#set-temp", "temperature", "#lbl-temp", fmtTemp);
  bindSlider("#set-topp", "topP", "#lbl-topp", fmtP);
  bindSlider("#set-maxt", "maxTokens", "#lbl-maxt", fmtTok);
  bindSlider("#set-pp", "presencePenalty", "#lbl-pp", fmtP);
  bindSlider("#set-fp", "frequencyPenalty", "#lbl-fp", fmtP);
  const bindToggle = (id, key, callback) => {
    const elT = panel.querySelector(id);
    if (!elT) return;
    elT.addEventListener("change", (e) => {
      s[key] = e.target.checked;
      store.save();
      if (callback) callback();
    });
  };
  bindToggle("#set-stream", "streaming");
  bindToggle("#set-autoscroll", "autoScroll");
  bindToggle("#set-showtokens", "showTokens", () => renderMainHeader());
  bindToggle("#set-showcosts", "showCosts", () => renderMainHeader());
  bindToggle("#set-debug", "showDebug", () => {
    renderMessages();
    renderMainHeader();
  });
  bindToggle("#set-free-models", "showFreeModels", async () => {
    try {
      await fetchModels();
      renderMainHeader();
      if (uiState.modelsVisible) renderModelsPanel();
      toast("Modellliste aktualisiert", "success");
    } catch (err) {
      toast("Modelle konnten nicht neu geladen werden: " + err.message, "error");
    }
  });
  panel.querySelector("#set-clear-key").onclick = () => {
    showConfirmModal({
      title: "API Key entfernen",
      message: "Du wirst abgemeldet und musst den OpenRouter API Key erneut eingeben.",
      confirmText: "Entfernen",
      danger: true,
      onConfirm: () => {
        storageRemove("sessionStorage", "nx_key");
        storageRemove("localStorage", "nx_key");
        store.apiKey = "";
        location.reload();
      }
    });
  };
  panel.querySelector("#set-clear-chats").onclick = () => {
    if (store.isStreaming) {
      toast("Bitte stoppe zuerst die laufende Antwort.", "info");
      return;
    }
    showConfirmModal({
      title: "Alle Chats löschen",
      message: "Alle lokalen Chats und die gespeicherte Kostensumme werden gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
      confirmText: "Chats löschen",
      danger: true,
      onConfirm: () => {
        store.chats = [];
        store.activeChatId = null;
        store.totalCost = 0;
        store.save();
        toggleSettings(false);
        store.newChat();
        render();
        toast("Alle Chats gelöscht", "success");
      }
    });
  };
  panel.querySelector("#set-export-all").onclick = () => {
    const data = {
      version: 2,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      settings: store.settings,
      chats: exportableChats(store.chats),
      favModels: store.favModels,
      totalCost: store.totalCost
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, `nexus-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`);
    toast("Daten exportiert", "success");
  };
  const importFile = panel.querySelector("#import-file");
  panel.querySelector("#set-import-all").onclick = () => importFile.click();
  importFile.addEventListener("change", (e) => {
    if (store.isStreaming) {
      toast("Bitte stoppe zuerst die laufende Antwort.", "info");
      e.target.value = "";
      return;
    }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const incomingChats = Array.isArray(data.chats) ? data.chats.length : 0;
        const willChangeLocalData = Boolean(data.settings || Array.isArray(data.chats) || Array.isArray(data.favModels) || Number.isFinite(Number(data.totalCost)));
        if (!willChangeLocalData) {
          toast("Importdatei enthält keine Nexus-Daten.", "error");
          return;
        }
        showConfirmModal({
          title: "Daten importieren",
          message: `Der Import verändert lokale Einstellungen und ersetzt ${store.chats.length} vorhandene Chats durch ${incomingChats} importierte Chats. Fortfahren?`,
          confirmText: "Importieren",
          danger: true,
          onConfirm: async () => {
            try {
              if (store.isStreaming) {
                toast("Bitte stoppe zuerst die laufende Antwort.", "info");
                return;
              }
              const importedChats = Array.isArray(data.chats) ? normalizeChats(data.chats) : null;
              if (importedChats) for (const chat of importedChats) for (const message of chat.messages) await persistMessageMedia(message);
              if (data.settings && typeof data.settings === "object") store.settings = normalizeSettings(data.settings);
              if (importedChats) store.chats = importedChats;
              if (Array.isArray(data.favModels)) store.favModels = normalizeStringArray(data.favModels);
              if (Number.isFinite(Number(data.totalCost))) store.totalCost = Math.max(0, Number(data.totalCost));
              store.activeChatId = store.chats[0]?.id || null;
              applyDocumentTheme(store.settings.theme);
              store.save();
              toggleSettings(false);
              render();
              toast("Daten importiert!", "success");
            } catch (err) {
              console.error("Import fehlgeschlagen:", err);
              toast("Import fehlgeschlagen.", "error");
            }
          }
        });
      } catch {
        toast("Ungültige JSON-Datei.", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
}

// src/ui/export.js
function exportChat() {
  const chat = store.getChat();
  if (!chat || !chat.messages.length) {
    toast("Kein Chat zum Exportieren.", "info");
    return;
  }
  let md = `# ${chat.title}

`;
  md += `**Modell:** ${chat.model}
**Erstellt:** ${new Date(chat.createdAt).toLocaleString("de")}

---

`;
  for (const m of chat.messages) {
    if (m.error) continue;
    if (m.reasoning) md += `<details><summary>Denkprozess</summary>

${m.reasoning}

</details>

`;
    md += `### ${m.role === "user" ? "Du" : "Assistent"}

${m.content}

---

`;
  }
  const blob = new Blob([md], { type: "text/markdown" });
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeTitle = chat.title.replace(/[^a-zA-Z0-9äöüÄÖÜß -]/g, "_").trim() || "chat";
  const filename = `${stamp}-${safeTitle}.md`;
  downloadBlob(blob, filename);
  toast("Chat exportiert", "success");
}

// src/ui/header.js
function setTheme(choice) {
  store.settings.theme = ["system", "light", "dark"].includes(choice) ? choice : "system";
  applyDocumentTheme(store.settings.theme);
  if (store.demoMode) { liveBeforeDemo.settings.theme = store.settings.theme; storageSet("localStorage", "nx_settings", JSON.stringify(liveBeforeDemo.settings)); }
  else store.save();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (store.settings.theme === "system") applyDocumentTheme("system");
});

function renderMainHeader() {
  const header = document.getElementById("main-header");
  if (!header) return;
  const chat = store.getChat();
  const model = ensureChatModelAvailable(chat);
  const modelName = model ? model.name || model.id : chat?.model || "Modell wählen";
  const provider = chat?.providerTag ? ` · ${chat.providerName || chat.providerTag}` : "";
  const sidebarOpen = !document.getElementById("sidebar").classList.contains("collapsed");
  header.innerHTML = `
    <div class="left">
      <button class="btn-icon" id="btn-toggle-sb" type="button" aria-label="Seitenleiste öffnen" aria-controls="sidebar" aria-expanded="${sidebarOpen}">${IC.menu}</button>
      <button class="model-sel" id="btn-model-sel" type="button" aria-label="Modell wechseln: ${escAttr(modelName + provider)}" aria-haspopup="dialog">
        <span class="workspace-model-icon" aria-hidden="true">${IC.cpu}</span><span class="workspace-model-label"><span class="model-name">${esc(modelName + provider)}</span><small>${model?.context_length ? formatTokens(model.context_length) + " Kontext" : "Modell auswählen"}${modelSupportsReasoning(model) ? " · Reasoning" : ""}</small></span>${IC.chevDown}
      </button>
    </div>
    <div class="right">
      <button class="btn-icon workspace-command-trigger" id="header-command" type="button" title="Schnellaktionen (${platformModifier()} K)" aria-label="Schnellaktionen öffnen">${IC.search}</button>
      <button class="studio-status" id="studio-status" type="button"><span class="connection-dot${store.demoMode ? " is-demo" : ""}" aria-hidden="true"></span>${store.demoMode ? "Verbinden" : "Verbunden"}</button>
      <details class="workspace-chat-menu">
        <summary class="btn-icon" aria-label="Chataktionen">${IC.more}</summary>
        <div class="workspace-header-menu">
          <button id="mnu-export" type="button">${IC.download}<span>Chat exportieren</span></button>
          <button id="mnu-debug" type="button" aria-pressed="${store.settings.showDebug}">${IC.bug}<span>Debug ${store.settings.showDebug ? "aus" : "an"}</span></button>
          ${store.settings.showCosts && chat ? `<small>Kosten · ${formatCost(chat.cost)}</small>` : ""}
          ${store.settings.showTokens && chat ? `<small>Token · ${formatTokens(chat.tokens)}</small>` : ""}
        </div>
      </details>
    </div>`;
  header.querySelector("#btn-toggle-sb").onclick = () => toggleSidebar(document.getElementById("sidebar").classList.contains("collapsed"));
  header.querySelector("#btn-model-sel").onclick = () => toggleModels(true);
  header.querySelector("#header-command").onclick = () => studioViews.open("command");
  header.querySelector("#studio-status").onclick = () => store.demoMode ? studioViews.open("connect") : toggleSettings(true);
  const menu = header.querySelector(".workspace-chat-menu");
  menu.onfocusout = (event) => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  };
  menu.onkeydown = (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  };
  menu.querySelector("#mnu-export").onclick = () => {
    menu.open = false;
    exportChat();
  };
  menu.querySelector("#mnu-debug").onclick = () => {
    store.settings.showDebug = !store.settings.showDebug;
    store.save();
    renderMessages();
    renderMainHeader();
  };
}

// src/ui/models.js
var modelsDialog;
function toggleModels(show) {
  if (show && store.isStreaming) { toast("Die Modellauswahl ist nach der laufenden Antwort verfügbar.", "info"); return; }
  const panel = document.getElementById("models-panel");
  if (!panel) return;
  uiState.modelsVisible = show;
  modelsDialog?.dispose(); modelsDialog = undefined;
  panel.classList.toggle("visible", show);
  if (show) {
    renderModelsPanel();
    modelsDialog = openNativeDialog(panel, () => toggleModels(false), isMobile() ? "#close-models" : "#model-search");
  }
}
var MODEL_CATEGORIES = [
  { key: "all", label: "Alle" },
  { key: "fav", label: "Favoriten", icon: "star" },
  { key: "reasoning", label: "Reasoning", icon: "think" },
  { key: "multimodal", label: "Multimodal", icon: "eye" },
  { key: "large", label: "100K+ Kontext", icon: "cpu" },
  { key: "tools", label: "Werkzeuge", icon: "settings" },
  { key: "structured", label: "JSON-Schema", icon: "file" },
  { key: "audio", label: "Audio", icon: "mic" },
  { key: "video", label: "Video", icon: "eye" },
  { key: "image-output", label: "Bilder erzeugen", icon: "eye" },
  { key: "openai", label: "OpenAI" },
  { key: "anthropic", label: "Anthropic" },
  { key: "google", label: "Google" },
  { key: "meta", label: "Meta" },
  { key: "mistral", label: "Mistral" }
];
var MODEL_SORTS = [
  { key: "name", label: "Name A–Z" },
  { key: "price-asc", label: "Preis ↑" },
  { key: "price-desc", label: "Preis ↓" },
  { key: "ctx-desc", label: "Kontext ↓" },
  { key: "newest", label: "Neueste zuerst" }
];
function filterModels() {
  let list = store.models.slice();
  const q = uiState.modelFilter.toLowerCase();
  if (!MODEL_CATEGORIES.some((c) => c.key === uiState.modelCategory)) uiState.modelCategory = "all";
  if (q) list = list.filter((m) => (m.name || m.id).toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  if (uiState.modelCategory === "fav") list = list.filter((m) => store.favModels.includes(m.id));
  else if (uiState.modelCategory === "reasoning") list = list.filter((m) => modelSupportsReasoning(m));
  else if (uiState.modelCategory === "multimodal") list = list.filter((m) => modelSupportsImages(m));
  else if (uiState.modelCategory === "large") list = list.filter((m) => (m.context_length || 0) >= 1e5);
  else if (uiState.modelCategory === "tools") list = list.filter((m) => m.supported_parameters?.includes("tools"));
  else if (uiState.modelCategory === "structured") list = list.filter((m) => m.supported_parameters?.includes("response_format"));
  else if (uiState.modelCategory === "audio") list = list.filter((m) => [...m.architecture?.input_modalities || [], ...m.architecture?.output_modalities || []].includes("audio"));
  else if (uiState.modelCategory === "video") list = list.filter((m) => m.architecture?.input_modalities?.includes("video"));
  else if (uiState.modelCategory === "image-output") list = list.filter((m) => m.architecture?.output_modalities?.includes("image"));
  else if (["openai", "anthropic", "google", "meta", "mistral"].includes(uiState.modelCategory)) list = list.filter((m) => m.id.toLowerCase().includes(uiState.modelCategory));
  const sort = store.settings.modelSort || "name";
  list.sort((a, b) => {
    if (sort === "price-asc" || sort === "price-desc") {
      return compareTokenPrices(a, b, sort === "price-desc");
    }
    if (sort === "ctx-desc") {
      return (b.context_length || 0) - (a.context_length || 0);
    }
    if (sort === "newest") {
      return (b.created || 0) - (a.created || 0);
    }
    return (a.name || a.id).localeCompare(b.name || b.id);
  });
  return list;
}
function renderModelsPanel() {
  const panel = document.getElementById("models-panel");
  if (!panel) return;
  panel.innerHTML = `
  <div class="panel-head">
    <div><h2>Modell auswählen</h2><p class="panel-subtitle">${store.models.length} Modelle · Preise pro Million Token</p></div>
    <button class="btn-icon" id="close-models" title="Modelle schließen" aria-label="Modelle schließen">${IC.x}</button>
  </div>
  <div class="models-search">
    <input type="text" placeholder="Modell suchen…" id="model-search" value="${escAttr(uiState.modelFilter)}" autocomplete="off" autocapitalize="none" spellcheck="false">
    <div class="model-quick-filters" role="group" aria-label="Modell-Schnellfilter">${[["all", "Alle Modelle"], ["fav", "Favoriten"], ["reasoning", "Reasoning"], ["multimodal", "Bilder"]].map(([key, label]) => `<button type="button" data-model-category="${key}" aria-pressed="${uiState.modelCategory === key}">${label}</button>`).join("")}</div>
    <div class="model-filter-row">
      <label>Kategorie<select id="model-category">${MODEL_CATEGORIES.map((c) => `<option value="${escAttr(c.key)}"${uiState.modelCategory === c.key ? " selected" : ""}>${esc(c.label)}</option>`).join("")}</select></label>
      <label>Sortierung<select id="model-sort">${MODEL_SORTS.map((s) => `<option value="${s.key}"${store.settings.modelSort === s.key ? " selected" : ""}>${s.label}</option>`).join("")}</select></label>
    </div>
    <div class="models-sort-row"><span class="count" id="models-count"></span></div>
    <div id="model-provider-box" class="model-provider-box"></div>
  </div>
  <div class="models-grid" id="models-grid" role="list" aria-label="Verfügbare Modelle"></div>
  <div class="model-panel-footer"><span id="model-selection-label"></span><button class="studio-button primary" id="model-done" type="button">Fertig</button></div>
`;
  panel.querySelector("#close-models").onclick = () => toggleModels(false);
  panel.querySelector("#model-done").onclick = () => toggleModels(false);
  panel.querySelectorAll("[data-model-category]").forEach((button) => {
    button.onclick = () => {
      uiState.modelCategory = button.dataset.modelCategory;
      panel.querySelector("#model-category").value = uiState.modelCategory;
      updateModelsGrid();
    };
  });
  const searchInput = panel.querySelector("#model-search");
  panel.querySelector("#close-models")?.setAttribute("aria-label", "Modelle schließen");
  searchInput?.setAttribute("aria-label", "Modell suchen");
  searchInput.addEventListener("input", (e) => {
    uiState.modelFilter = e.target.value;
    updateModelsGrid();
  });
  requestAnimationFrame(() => {
    if (!panel.classList.contains("visible")) return;
    (isMobile() ? panel.querySelector("#close-models") : searchInput)?.focus({ preventScroll: true });
  });
  panel.querySelector("#model-category").addEventListener("change", (e) => {
    uiState.modelCategory = e.target.value;
    updateModelsGrid();
  });
  panel.querySelector("#model-sort").addEventListener("change", (e) => {
    store.settings.modelSort = e.target.value;
    store.save();
    updateModelsGrid();
  });
  updateModelsGrid();
  updateModelProviderBox();
}
function endpointLabel(endpoint) {
  const pp = parseFloat(endpoint.pricing?.prompt || "0");
  const cp = parseFloat(endpoint.pricing?.completion || "0");
  const price = Number.isFinite(pp + cp) && (pp || cp) ? ` · $${(pp * 1e6).toFixed(2)}/$${(cp * 1e6).toFixed(2)}/M` : "";
  const ctx = endpoint.context_length ? ` · ${formatTokens(endpoint.context_length)} ctx` : "";
  const quant = endpoint.quantization ? ` · ${endpoint.quantization}` : "";
  const status = endpoint.status ? " · eingeschränkt" : "";
  return `${endpoint.provider_name}${endpoint.tag !== endpoint.provider_name ? ` (${endpoint.tag})` : ""}${price}${ctx}${quant}${status}`;
}
async function updateModelProviderBox() {
  const box = document.getElementById("model-provider-box");
  if (!box) return;
  const chat = store.getChat();
  const model = ensureChatModelAvailable(chat);
  if (!chat || !model) {
    box.style.display = "none";
    return;
  }
  if (store.demoMode) {
    box.style.display = "";
    box.innerHTML = `<div class="mp-top"><span class="mp-title">Provider für ${esc((model.name || model.id).split("/").pop())}</span><span class="mp-note">Demo</span></div><div class="mp-note">Auto (OpenRouter Routing) · im Demo-Modus sind keine Provider-Anfragen aktiv.</div>`;
    return;
  }
  box.style.display = "";
  const modelLabel = (model.name || model.id).split("/").pop();
  const cached = store.endpointMap[chat.model];
  if (!cached && !store.endpointErrors[chat.model]) {
    box.innerHTML = `<div class="mp-top"><span class="mp-title">Provider für ${esc(modelLabel)}</span></div><div class="mp-note">Provider werden geladen...</div>`;
    const requestedModel = chat.model;
    try {
      await fetchModelEndpoints(requestedModel);
    } catch (err) {
      store.endpointErrors[requestedModel] = err.message || "Provider konnten nicht geladen werden.";
    }
    if (store.getChat()?.model === requestedModel) updateModelProviderBox();
    return;
  }
  if (store.endpointErrors[chat.model]) {
    box.innerHTML = `<div class="mp-top"><span class="mp-title">Provider für ${esc(modelLabel)}</span></div><div class="mp-note">${esc(store.endpointErrors[chat.model])}</div>`;
    return;
  }
  const endpoints = cached || [];
  const hasSelected = endpoints.some((endpoint) => endpoint.tag === chat.providerTag);
  if (chat.providerTag && !hasSelected) {
    chat.providerTag = null;
    chat.providerName = null;
    store.save();
  }
  box.innerHTML = `
  <div class="mp-top">
    <span class="mp-title">Provider für ${esc(modelLabel)}</span>
    <span class="mp-note">${endpoints.length} verfügbar</span>
  </div>
  <select id="provider-select" aria-label="Provider auswählen">
    <option value="">Auto (OpenRouter Routing)</option>
    ${endpoints.map((endpoint) => `<option value="${escAttr(endpoint.tag)}"${chat.providerTag === endpoint.tag ? " selected" : ""}>${esc(endpointLabel(endpoint))}</option>`).join("")}
  </select>
  <div class="mp-note">${chat.providerTag ? "Strikt gepinnt: keine Fallback-Provider." : "Auto nutzt OpenRouter Load-Balancing."}</div>
`;
  const select = box.querySelector("#provider-select");
  select?.addEventListener("change", () => {
    const tag = select.value;
    const endpoint = endpoints.find((item) => item.tag === tag);
    chat.providerTag = tag || null;
    chat.providerName = endpoint ? endpoint.provider_name : null;
    store.save();
    updateModelProviderBox();
    renderMainHeader();
    renderInputArea();
  });
}
function updateModelsGrid() {
  const grid = document.getElementById("models-grid");
  if (!grid) return;
  const chat = store.getChat();
  const currentModel = chat?.model;
  const filtered = filterModels();
  const countEl = document.getElementById("models-count");
  if (countEl) countEl.textContent = `${filtered.length} Treffer`;
  document.querySelectorAll("[data-model-category]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.modelCategory === uiState.modelCategory)));
  const selectionLabel = document.getElementById("model-selection-label");
  if (selectionLabel) selectionLabel.textContent = store.modelMap[currentModel]?.name || currentModel || "Kein Modell ausgewählt";
  grid.innerHTML = `
  ${filtered.length === 0 ? '<p class="panel-empty">Keine passenden Modelle<span>Ändere die Suche oder wähle einen anderen Filter.</span></p>' : ""}
  ${filtered.slice(0, 120).map((m) => modelCardHtml(m, currentModel)).join("")}
  ${filtered.length > 120 ? `<p class="panel-more">${filtered.length - 120} weitere Modelle — verfeinere die Suche</p>` : ""}
`;
  grid.querySelectorAll(".model-card").forEach((card) => {
    card.addEventListener("keydown", (e) => {
      if (e.target.closest(".fav-btn")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    });
    card.addEventListener("click", (e) => {
      if (e.target.closest(".fav-btn")) return;
      const id = card.dataset.id;
      if (chat) {
        chat.model = id;
        chat.providerTag = null;
        chat.providerName = null;
        store.save();
      }
      renderMainHeader();
      renderInputArea();
      updateModelsGrid();
      updateModelProviderBox();
      grid.querySelector(`.model-card[data-id="${CSS.escape(id)}"] .model-select`)?.focus({ preventScroll: true });
      toast(`Modell: ${(store.modelMap[id]?.name || id).split("/").pop()}`, "success");
    });
  });
  grid.querySelectorAll(".fav-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.model;
      const idx = store.favModels.indexOf(id);
      if (idx >= 0) store.favModels.splice(idx, 1);
      else store.favModels.push(id);
      store.save();
      updateModelsGrid();
      grid.querySelector(`.fav-btn[data-model="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    });
  });
}
function modelCardHtml(m, currentModel) {
  const isFav = store.favModels.includes(m.id);
  const isSelected = m.id === currentModel;
  const { prompt: pp, completion: cp } = tokenPrices(m.pricing);
  const provider = m.id.split("/")[0] || "?";
  const ctx = m.context_length || 0;
  const supportsR = modelSupportsReasoning(m);
  const badges = [];
  if (supportsR) badges.push(`<span class="badge badge-reasoning">${IC.think} Reasoning</span>`);
  if (ctx >= 1e5) badges.push(`<span class="badge badge-blue">${formatTokens(ctx)} ctx</span>`);
  if (modelSupportsImages(m)) badges.push('<span class="badge badge-amber">Multimodal</span>');
  return `<div class="model-card${isSelected ? " selected" : ""}" data-id="${escAttr(m.id)}" role="listitem">
  <button type="button" class="model-select" aria-label="${escAttr("Modell auswählen: " + (m.name || m.id))}" aria-pressed="${isSelected}"></button>
  <div class="mc-top">
    <div class="mc-name-wrap">
      <div class="mc-name">${isSelected ? `<span class="model-selected-dot" aria-hidden="true"></span>` : ""}${esc((m.name || m.id).split("/").pop())}</div>
      <div class="mc-provider">${esc(provider)}</div>
    </div>
    <button class="fav-btn${isFav ? " faved" : ""}" data-model="${escAttr(m.id)}" title="Favorit" aria-label="${escAttr((isFav ? "Favorit entfernen: " : "Als Favorit merken: ") + (m.name || m.id))}" aria-pressed="${isFav}">${isFav ? IC.starFill : IC.star}</button>
  </div>
  ${badges.length ? `<div class="mc-badges">${badges.join("")}</div>` : ""}
  <div class="mc-stats">
    <span>Eingabe: ${pp == null ? "Dynamisch / unbekannt" : "$" + (pp * 1e6).toFixed(2) + "/M"}</span>
    <span>Ausgabe: ${cp == null ? "Dynamisch / unbekannt" : "$" + (cp * 1e6).toFixed(2) + "/M"}</span>
    ${ctx && ctx < 1e5 ? `<span>Kontext: ${formatTokens(ctx)}</span>` : ""}
  </div>
</div>`;
}

// src/ui/app.js
var composerObserver;
async function initApp(draft = "") {
  renderAppShell();
  try {
    await hydrateChatMedia(store.chats);
    await fetchModels();
    const fallbackModel = pickDefaultModel();
    let normalizedStoredModels = false;
    for (const chat of store.chats) {
      if (!store.modelMap[chat.model]) {
        chat.model = fallbackModel;
        chat.providerTag = null;
        chat.providerName = null;
        normalizedStoredModels = true;
      }
    }
    const favCountBefore = store.favModels.length;
    store.favModels = store.favModels.filter((id) => store.modelMap[id]);
    if (normalizedStoredModels || favCountBefore !== store.favModels.length) store.save();
    if (draft.trim() || !store.chats.length) store.newChat(fallbackModel).draft = draft;
    else store.activeChatId = store.chats[0]?.id;
    render();
    focusInput();
  } catch (e) {
    toast("Modelle konnten nicht geladen werden: " + e.message, "error");
    if (draft.trim() || !store.chats.length) store.newChat().draft = draft;
    else store.activeChatId = store.chats[0]?.id;
    render();
  }
  if (draft.trim()) store.save();
}
function renderAppShell() {
  const main = document.getElementById("app-main");
  contextView?.dispose();
  contextView = undefined;
  composerCleanup?.();
  composerCleanup = undefined;
  main.innerHTML = `
  <div class="sidebar-backdrop" id="sidebar-backdrop" aria-hidden="true"></div>
  <nav class="sidebar ${store.settings.sidebarOpen && !isMobile() ? "" : "collapsed"}" id="sidebar" aria-label="Chats"></nav>
  <div class="main-area" id="main-area">
    <header class="main-header" id="main-header"></header>
    <div class="conversation-stage">
      <div class="chat-container" id="chat-container" role="region" aria-label="Chatverlauf"></div>
      <button class="scroll-to-bottom-btn" id="scroll-bottom-btn" title="Nach unten" aria-label="Zum Ende springen">${IC.arrowDown}</button>
      <div class="chat-input-area" id="chat-input-area"></div>
      <div id="chat-starters"></div>
    </div>
    <p class="workspace-footer">${store.demoMode ? "Demo · Simulierte Antworten, temporäre Chats." : "Nexus kann Fehler machen. Prüfe wichtige Antworten."}</p>
  </div>
  <dialog class="models-panel" id="models-panel" aria-label="Modelle"></dialog>
  <dialog class="settings-panel" id="settings-panel" aria-label="Einstellungen"></dialog>
`;
  $("#sidebar-backdrop").addEventListener("click", () => toggleSidebar(false));
  syncSidebarAccessibility(store.settings.sidebarOpen && !isMobile());
  const container = document.getElementById("chat-container");
  const sbBtn = document.getElementById("scroll-bottom-btn");
  composerObserver?.disconnect();
  let previousHeight = 0;
  composerObserver = new ResizeObserver(([entry]) => {
    const height = entry.target.getBoundingClientRect().height;
    document.getElementById("main-area").style.setProperty("--composer-height", height + "px");
    if ((!streamScroll || streamScroll.following) && isNearBottom(container, 120 + Math.max(0, height - previousHeight))) scrollToBottom(container);
    previousHeight = height;
  });
  composerObserver.observe(document.getElementById("chat-input-area"));
  container.addEventListener("scroll", () => {
    sbBtn.classList.toggle("visible", !isNearBottom(container, 180));
    const dot = sbBtn.querySelector(".new-msg-dot");
    if (dot && isNearBottom(container, 180)) dot.remove();
  }, { passive: true });
  sbBtn.addEventListener("click", () => {
    scrollToBottom(container, true);
    const dot = sbBtn.querySelector(".new-msg-dot");
    if (dot) dot.remove();
  });
}
function render() {
  renderSidebar();
  renderMainHeader();
  renderMessages();
  renderInputArea();
  uiState.lastActiveChatId = store.activeChatId;
}

// src/ui/stream-view.js
function showTypingIndicator() {
  completionScrollCleanup?.(); completionScrollCleanup = undefined;
  const container = document.getElementById("chat-messages");
  if (!container) return null;
  let ind = container.querySelector("#typing-ind");
  if (!ind) {
    ind = el("div", { className: "msg msg-assistant streaming-msg", id: "typing-ind" });
    ind.innerHTML = `
    <div class="msg-role">Assistent</div>
    <div class="msg-tool-chips stream-details" aria-hidden="true"><span class="tool-chip">Antwortdetails</span></div>
    <div id="stream-activity"></div>
    <div class="msg-content" id="stream-content"></div>
    <div class="stream-row">
      <div class="typing-stats" id="typing-stats"></div>
    </div>
  `;
    ind.dataset.renderId = uuid();
    container.appendChild(ind);
    activity = { phase: "waiting", reasoning: false, demo: store.demoMode };
    activityView = studioViews.mountActivity(ind.querySelector("#stream-activity"), activity);
    streamScroll = createScrollFollower(document.getElementById("chat-container"), store.settings.autoScroll);
    let lastAnswer = "", lastReasoning = "", lastContext = 0;
    streamPresenter = createStreamPresenter((answer, reasoning) => {
      const follow = store.settings.autoScroll && streamScroll?.following;
      if (answer !== lastAnswer) {
        lastAnswer = answer;
        patchMarkdown(ind.querySelector("#stream-content"), renderStreamingMd(answer));
        hardenLinks(ind);
      }
      if (reasoning !== lastReasoning) {
        lastReasoning = reasoning;
        activity = { ...activity, reasoningText: reasoning };
        activityView?.update(activity);
      }
      if (performance.now() - lastContext > 250) { updateInputTokenCount(); lastContext = performance.now(); }
      if (follow) requestAnimationFrame(() => {
        const c = document.getElementById("chat-container");
        // Respect a scroll away between the render and this frame.
        if (c && ind.isConnected && streamPresenter && store.settings.autoScroll) streamScroll?.pin();
      });
    }, { reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches });
  }
  return ind;
}
function setStreamActivity(phase) {
  if (!activity || phase === activity.phase) return;
  activity = {
    ...activity,
    phase,
    reasoning: activity.reasoning || phase === "reasoning"
  };
  activityView.update(activity);
}
function updateStreamReasoning(text) {
  if (text.length > 0 && text !== uiState.streamReasoningPendingText) setStreamActivity("reasoning");
  uiState.streamReasoningPendingText = text;
  streamPresenter?.push({ reasoning: text });
}
function finalizeStreamReasoning() { stopReasoningTimer(); }
function updateStreamContent(text) {
  uiState.streamContentPendingText = text;
  if (text.trim()) setStreamActivity("writing");
  if (!uiState.streamContentStart && text.length > 0) startStreamStats();
  streamPresenter?.push({ answer: text });
}
async function completeStreamMessage(msg, chat) {
  const ind = document.getElementById("typing-ind");
  if (!ind) { renderMessages(); return; }
  streamFinishing = true;
  store.isStreaming = true;
  await streamPresenter?.finish({ answer: msg.content || "", reasoning: msg.reasoning || "" });
  streamPresenter?.dispose(); streamPresenter = undefined;
  const container = document.getElementById("chat-container");
  const follow = store.settings.autoScroll && streamScroll?.following;
  const savedTop = container.scrollTop;
  const innerScrolls = [...ind.querySelectorAll(".layro-activity > ol")].map(node => [node, node.scrollTop]);
  createMessageEl(msg, chat, ind);
  ind.removeAttribute("id"); ind.classList.remove("streaming-msg");
  // Transfer the activity root to the saved message without resetting expansion.
  removeTypingIndicator();
  streamFinishing = false;
  store.isStreaming = false;
  highlightCode(ind);
  scrollImmediately(container, follow ? container.scrollHeight : savedTop);
  for (const [node, top] of innerScrolls) scrollImmediately(node, top);
  completionScrollCleanup?.();
  completionScrollCleanup = preserveCompletedScroll(container, follow);
}
function maybeAutoScroll() {
  const chatC = document.getElementById("chat-container");
  if (!chatC) return;
  if (!store.settings.autoScroll) return;
  if (isNearBottom(chatC, 200)) {
    if (!uiState.autoScrollRaf) {
      uiState.autoScrollRaf = requestAnimationFrame(() => {
        uiState.autoScrollRaf = null;
        const c = document.getElementById("chat-container");
        if (c) c.scrollTop = c.scrollHeight;
      });
    }
  } else {
    const btn = document.getElementById("scroll-bottom-btn");
    if (btn && btn.classList.contains("visible") && !btn.querySelector(".new-msg-dot")) {
      const dot = document.createElement("span");
      dot.className = "new-msg-dot";
      btn.appendChild(dot);
    }
  }
}
function clearStreamingFrames() {
  if (uiState.streamReasoningRaf) cancelAnimationFrame(uiState.streamReasoningRaf);
  if (uiState.streamContentRaf) cancelAnimationFrame(uiState.streamContentRaf);
  if (uiState.autoScrollRaf) cancelAnimationFrame(uiState.autoScrollRaf);
  if (uiState.streamReasoningTimer) clearTimeout(uiState.streamReasoningTimer);
  if (uiState.streamContentTimer) clearTimeout(uiState.streamContentTimer);
  uiState.streamReasoningRaf = null;
  uiState.streamReasoningTimer = null;
  uiState.streamContentRaf = null;
  uiState.streamContentTimer = null;
  uiState.autoScrollRaf = null;
}
function removeTypingIndicator() {
  streamScroll?.dispose(); streamScroll = undefined;
  streamPresenter?.dispose(); streamPresenter = undefined;
  finalizeStreamReasoning();
  clearStreamingFrames();
  const ind = document.getElementById("typing-ind");
  activityView?.dispose();
  activityView = undefined;
  activity = undefined;
  if (ind) ind.remove();
  stopStreamStats();
  uiState.streamContentStart = null;
  uiState.streamContentLastRender = 0;
  uiState.streamReasoningLastRender = 0;
  uiState.streamContentPendingText = "";
  uiState.streamReasoningPendingText = "";
  updateInputTokenCount();
}

// src/api/reasoning.js
function combineReasoningTexts(...parts) {
  return parts.map((p) => String(p || "").trim()).filter(Boolean).join("\n\n");
}
function isPartialTagPrefix(tail, tags) {
  const normalized = tail.toLowerCase().replace(/\s+/g, "");
  if (!normalized || normalized === "<" || normalized === "</") return true;
  if (tags.some((tag) => tag.startsWith(normalized))) return true;
  return REASONING_TAG_NAMES.some(
    (name) => normalized.startsWith(`<${name}`) || normalized.startsWith(`</${name}`)
  );
}
function findPartialTagStart(chunk, tags) {
  const source = String(chunk || "");
  const maxLen = Math.min(source.length, 28);
  for (let i = source.length - maxLen; i < source.length; i++) {
    if (source[i] !== "<") continue;
    const tail = source.slice(i);
    if (isPartialTagPrefix(tail, tags)) return i;
  }
  return -1;
}
function appendChunk(existing, chunk) {
  const next = String(chunk || "");
  if (!next) return existing || "";
  const current = String(existing || "");
  if (!current) return next;
  if (next.startsWith(current)) return next;
  if (current.startsWith(next)) return current;
  const max = Math.min(current.length, next.length, 2e3);
  for (let len = max; len > 0; len--) {
    if (current.endsWith(next.slice(0, len))) return current + next.slice(len);
  }
  return current + next;
}
function reasoningDetailKey(detail) {
  if (!detail || typeof detail !== "object") return "";
  if (detail.id != null) return `id:${detail.id}`;
  const type = detail.type || "";
  const format = detail.format || "";
  const index = detail.index != null ? detail.index : "";
  return type || format || index !== "" ? `${type}:${format}:${index}` : "";
}
function mergeReasoningDetails(existing, incoming) {
  const merged = normalizeReasoningDetails(existing);
  for (const detail of normalizeReasoningDetails(incoming)) {
    const key = reasoningDetailKey(detail);
    const target = key ? [...merged].reverse().find((item) => reasoningDetailKey(item) === key) : null;
    if (!target) {
      merged.push(detail);
      continue;
    }
    Object.entries(detail).forEach(([field, value]) => {
      if (value == null) return;
      if (["text", "summary", "content"].includes(field) && target[field] != null) {
        target[field] = appendChunk(target[field], value);
      } else if (target[field] == null || !["id", "type", "format", "index"].includes(field)) {
        target[field] = value;
      }
    });
  }
  return merged;
}
function splitLabeledReasoning(text, streaming = false) {
  const source = String(text || "");
  const labelRe = /(?:^|\n)\s*(?:#{1,6}\s*)?(reasoning|thinking|thoughts?|analysis|denkprozess)\s*:\s*\n/i;
  const finalRe = /(?:^|\n)\s*(?:#{1,6}\s*)?(final|answer|antwort|response|ergebnis)\s*:\s*\n/i;
  const label = labelRe.exec(source);
  if (!label) return null;
  const reasoningStart = label.index + label[0].length;
  const final = finalRe.exec(source.slice(reasoningStart));
  if (!final) {
    if (!streaming) return null;
    return {
      content: source.slice(0, label.index).trim(),
      reasoning: source.slice(reasoningStart),
      inThinking: true,
      held: ""
    };
  }
  const finalStart = reasoningStart + final.index;
  const contentStart = finalStart + final[0].length;
  const before = source.slice(0, label.index).trim();
  const after = source.slice(contentStart);
  return {
    content: before ? `${before}

${after}` : after,
    reasoning: source.slice(reasoningStart, finalStart).trim(),
    inThinking: false,
    held: ""
  };
}
function splitInlineThinking(text, streaming = false) {
  const source = String(text || "");
  let content = "";
  let reasoning = "";
  let pos = 0;
  let inThinking = false;
  let held = "";
  const findTag = (from, closing) => {
    const names2 = REASONING_TAG_NAMES.join("|");
    const re = closing ? new RegExp(`<\\s*\\/\\s*(${names2})\\s*>`, "ig") : new RegExp(`<\\s*(${names2})(?:\\s+[^>]*)?>`, "ig");
    re.lastIndex = from;
    return re.exec(source);
  };
  while (pos < source.length) {
    if (!inThinking) {
      const open = findTag(pos, false);
      if (!open) {
        const rest = source.slice(pos);
        if (streaming) {
          const partialAt = findPartialTagStart(rest, REASONING_OPEN_TAGS);
          if (partialAt >= 0) {
            content += rest.slice(0, partialAt);
            held = rest.slice(partialAt);
            break;
          }
        }
        content += rest;
        break;
      }
      content += source.slice(pos, open.index);
      pos = open.index + open[0].length;
      inThinking = true;
    } else {
      const close = findTag(pos, true);
      if (!close) {
        const rest = source.slice(pos);
        if (streaming) {
          const partialAt = findPartialTagStart(rest, REASONING_CLOSE_TAGS);
          if (partialAt >= 0) {
            reasoning += rest.slice(0, partialAt);
            held = rest.slice(partialAt);
            break;
          }
        }
        reasoning += rest;
        break;
      }
      reasoning += source.slice(pos, close.index);
      pos = close.index + close[0].length;
      inThinking = false;
    }
  }
  const labeled = splitLabeledReasoning(content, streaming);
  if (labeled) {
    return {
      content: labeled.content,
      reasoning: combineReasoningTexts(reasoning, labeled.reasoning),
      inThinking: inThinking || labeled.inThinking,
      held: held || labeled.held
    };
  }
  return { content, reasoning, inThinking, held };
}

// src/api/chat.js
async function streamChat(messages, model, params, onToken, onDone, onError) {
  const controller = new AbortController();
  store.abortCtrl = controller;
  store.isStreaming = true;
  const currentModel = store.modelMap[model] || null;
  let usage = null, generationId = "", responseModel = model, provider = {}, finishReason = null;
  const toolCalls = [], images = [], annotations = [], audioChunks = [], raw = [];
  let activityEvents = [];
  let audio = {}, audioTranscript = "", finished = false, body;
  let timer = setTimeout(() => controller.abort(new Error("OpenRouter antwortet nicht rechtzeitig.")), 12e4);
  const resetTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new Error("Die Streaming-Verbindung antwortet nicht mehr.")), 12e4);
  };
  const finish = (callback, value) => {
    if (finished) return;
    finished = true;
    store.isStreaming = false;
    store.abortCtrl = null;
    clearTimeout(timer);
    return callback(value);
  };
  const done = async (aborted) => {
    const outputAudio = audioChunks.length ? { ...audio, data: joinBase64Chunks(audioChunks), transcript: audioTranscript, format: body?.audio?.format || "mp3" } : Object.keys(audio).length ? audio : void 0;
    await finish(onDone, { usage, generationId, model: responseModel, ...provider, finishReason, aborted, activityEvents, toolCalls: toolCalls.filter(Boolean), images, annotations, audio: outputAudio, debug: store.settings.showDebug ? { request: { url: API_BASE + "/chat/completions", body }, response: raw } : void 0 });
  };
  const consume = (payload) => {
    resetTimer();
    if (store.settings.showDebug) raw.push(payload);
    if (payload.error) throw createApiError(apiErrorMessage(payload, "Streaming-Fehler"), { payload });
    generationId = payload.id || generationId;
    responseModel = payload.model || responseModel;
    provider = { ...provider, ...extractProviderInfo(payload) };
    const choice = payload.choices?.[0] || {}, delta = choice.delta || choice.message || {};
    const reasoning = extractReasoningPayloadFromMessage(delta);
    if (reasoning.text || reasoning.details.length) onToken(reasoning.text, "reasoning", { reasoningDetails: reasoning.details });
    const text = extractAssistantText(delta);
    if (text) onToken(text, "content");
    if (delta.tool_calls) mergeToolCalls(toolCalls, delta.tool_calls.map((call, index) => ({ ...call, index: call.index ?? index })));
    for (const image of delta.images || []) if (image.image_url?.url && !images.some((current) => current.image_url?.url === image.image_url.url)) images.push(image);
    for (const annotation of delta.annotations || []) if (!annotations.some((current) => JSON.stringify(current) === JSON.stringify(annotation))) annotations.push(annotation);
    if (delta.audio) {
      const { data, transcript, ...rest } = delta.audio;
      audio = { ...audio, ...rest };
      if (data) audioChunks.push(data);
      if (transcript) {
        audioTranscript += transcript;
        if (!text) onToken(transcript, "content");
      }
    }
    const nextEvents = mergeActivity(activityEvents, collectActivity({ ...payload, annotations }, toolCalls));
    if (JSON.stringify(nextEvents) !== JSON.stringify(activityEvents)) {
      activityEvents = nextEvents;
      onToken("", "activity", { events: activityEvents });
    }
    if (payload.usage) usage = payload.usage;
    if (choice.finish_reason) finishReason = choice.finish_reason;
  };
  try {
    body = { model, messages, stream: params.streaming !== false };
    if (params.temperature != null && params.temperature !== 1 && modelSupportsParam(currentModel, "temperature")) body.temperature = params.temperature;
    if (params.topP != null && params.topP !== 1 && modelSupportsParam(currentModel, "top_p")) body.top_p = params.topP;
    if (params.maxTokens > 0) {
      if (modelSupportsParam(currentModel, "max_completion_tokens")) body.max_completion_tokens = params.maxTokens;
      else if (modelSupportsParam(currentModel, "max_tokens")) body.max_tokens = params.maxTokens;
    }
    if (params.presencePenalty && modelSupportsParam(currentModel, "presence_penalty")) body.presence_penalty = params.presencePenalty;
    if (params.frequencyPenalty && modelSupportsParam(currentModel, "frequency_penalty")) body.frequency_penalty = params.frequencyPenalty;
    Object.assign(body, buildReasoningRequest(currentModel, params.reasoningMode || "off"));
    const options = params.openrouter || store.settings.openrouter;
    if (body.reasoning && body.reasoning.enabled !== false) {
      if (options.reasoningBudget > 0) {
        delete body.reasoning.effort;
        body.reasoning.max_tokens = options.reasoningBudget;
      }
      if (options.reasoningExclude) body.reasoning.exclude = true;
      if (options.reasoningSummary !== "auto") body.reasoning.summary = options.reasoningSummary;
    }
    Object.assign(body, buildOpenRouterOptions(options, currentModel, { providerTag: params.providerTag, sessionId: params.sessionId }));
    if (body.audio) {
      body.stream = true;
      if (body.plugins?.some((plugin) => plugin.id === "response-healing")) body.plugins = body.plugins.filter((plugin) => plugin.id !== "response-healing");
    }
    if (body.plugins?.some((plugin) => plugin.id === "response-healing")) body.stream = false;
    // OpenRouter automatically includes terminal usage on Chat Completions.
    const response = await fetch(API_BASE + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${store.apiKey}`, ...applicationHeaders() }, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw createApiError(apiErrorMessage(payload, `HTTP ${response.status}`), { status: response.status, payload });
    }
    const streaming = (response.headers.get("content-type") || "").includes("text/event-stream");
    if (streaming) {
      for await (const event of readSSE(response.body)) {
        if (event.data === "[DONE]") break;
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          continue;
        }
        consume(payload);
      }
    } else consume(await response.json());
    await done(false);
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason?.name === "AbortError") await done(true);
    else finish(onError, controller.signal.aborted ? controller.signal.reason || new Error("Verbindung abgebrochen.") : error);
  } finally {
    clearTimeout(timer);
    if (store.abortCtrl === controller) {
      store.abortCtrl = null;
      store.isStreaming = false;
    }
  }
}

// src/ui/send.js
async function handleSend() {
  const ta = document.getElementById("msg-input");
  if (!ta) return;
  const content = ta.value.trim();
  if (store.isStreaming) return;
  if (pendingTools(store.getChat()).length) {
    showToolResults([...store.getChat().messages].reverse().find((m) => m.role === "assistant"), store.getChat());
    return;
  }
  if (!content && !uiState.attachedFiles.length) return;
  const chat = store.getChat();
  const currentModel = chat ? store.modelMap[chat.model] : null;
  const unsupported = unsupportedAttachmentForModel(uiState.attachedFiles, currentModel);
  if (unsupported) {
    toast(`"${unsupported.name}" wird vom aktuellen Modell nicht unterstützt.`, "error");
    return;
  }
  ta.value = "";
  ta.style.height = "auto";
  if (chat) {
    chat.draft = "";
    store.save();
  }
  updateInputTokenCount();
  sendChatMessage(content, false);
}
function demoPause(signal, delay = 650) {
  return new Promise((resolve) => {
    const complete = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", complete);
      resolve();
    };
    const timer = setTimeout(complete, delay);
    signal.addEventListener("abort", complete, { once: true });
  });
}
async function sendChatMessage(content, isResend) {
  if (store.isStreaming || streamFinishing) return;
  let chat = store.getChat();
  if (!chat) {
    chat = store.newChat();
    render();
  }
  const currentModel = ensureChatModelAvailable(chat);
  const unsupported = unsupportedAttachmentForModel(uiState.attachedFiles, currentModel);
  if (unsupported) {
    toast(`"${unsupported.name}" wird vom aktuellen Modell nicht unterstützt.`, "error");
    return;
  }
  if (chat.messages.length === 0 && chat.title === "Neuer Chat" && content) {
    chat.title = content.slice(0, 50) + (content.length > 50 ? "…" : "");
  }
  if (!isResend) {
    const userMsg = { id: uuid(), role: "user", content: content || "(Datei angehängt)", ts: Date.now() };
    if (uiState.attachedFiles.length) userMsg.attachments = [...uiState.attachedFiles];
    chat.messages.push(userMsg);
    uiState.attachedFiles = [];
    updateAttachedPreview();
  }
  chat.updatedAt = Date.now();
  store.save();
  renderSidebar();
  renderMessages();
  if (store.demoMode) {
    showTypingIndicator();
    const controller = new AbortController();
    store.abortCtrl = controller;
    store.isStreaming = true;
    updateSendBtn();
    const started = Date.now();
    const demoAnswer = {
      id: uuid(),
      role: "assistant",
      ts: Date.now(),
      model: chat.model,
      providerName: "OpenRouter",
      tokens: { prompt: estimateTokens(content), completion: 58 },
      cost: 0,
      reasoning: modelSupportsReasoning(currentModel) && store.settings.reasoningMode !== "off" ? "Ich prüfe zunächst die Anfrage und trenne den Denkverlauf von der späteren Antwort.\n\nDann zeige ich eintreffende Textstücke gleichmäßig an. Bereits sichtbare Abschnitte bleiben stehen.\n\nZum Schluss bleibt dieselbe Nachricht erhalten, damit beim Abschluss nichts springt." : undefined,
      content: `**Demo-Antwort**

Deine Nachricht „${String(content || "").slice(0, 120)}${String(content || "").length > 120 ? "…" : ""}“ ist angekommen. Verbinde einen OpenRouter API-Key, um eine echte Modellantwort zu erhalten.`,
      followups: ["API-Key verbinden", "Ein anderes Modell vergleichen"]
    };
    await demoPause(controller.signal);
    if (!controller.signal.aborted && demoAnswer.reasoning) {
      for (let n = 24; n < demoAnswer.reasoning.length + 24 && !controller.signal.aborted; n += 24) {
        updateStreamReasoning(demoAnswer.reasoning.slice(0, n));
        await demoPause(controller.signal, 110);
      }
    }
    if (!controller.signal.aborted && store.settings.openrouter.webSearch) {
      demoAnswer.activityEvents = collectActivity({ type: "response.web_search_call.in_progress", item_id: "demo-search" });
      activity = { ...activity, phase: "search", events: demoAnswer.activityEvents };
      activityView?.update(activity);
      await demoPause(controller.signal, 1800);
      demoAnswer.activityEvents = mergeActivity(demoAnswer.activityEvents, collectActivity({ type: "response.web_search_call.completed", item_id: "demo-search" }));
      activity = { ...activity, events: demoAnswer.activityEvents };
      activityView?.update(activity);
    }
    if (!controller.signal.aborted) {
      for (let n = 20; n < demoAnswer.content.length + 20 && !controller.signal.aborted; n += 20) {
        updateStreamContent(demoAnswer.content.slice(0, n));
        await demoPause(controller.signal, 90);
      }
    }
    store.isStreaming = false;
    store.abortCtrl = null;
    updateSendBtn();
    if (controller.signal.aborted) {
      removeTypingIndicator();
      toast("Antwort gestoppt.", "info");
      return;
    }
    demoAnswer.duration = Date.now() - started;
    demoAnswer.ts = Date.now();
    chat.messages.push(demoAnswer);
    chat.tokens += demoAnswer.tokens.prompt + demoAnswer.tokens.completion;
    await completeStreamMessage(demoAnswer, chat);
    renderSidebar();
    renderMainHeader();
    updateSendBtn();
    updateInputTokenCount();
    return;
  }
  let context;
  try {
    context = buildApiMessagesForChat(chat, currentModel);
  } catch (error) {
    toast(error.message, "error");
    updateSendBtn();
    return;
  }
  const { messages: apiMsgs, truncated, clipped } = context;
  if (truncated) toast(`${truncated} ältere Nachrichten wurden für diese Anfrage ausgelassen.`, "info");
  if (clipped) toast("Die aktuelle Nachricht wurde wegen des Kontextlimits gekürzt.", "info");
  showTypingIndicator();
  let fullText = "";
  let rawContentText = "";
  let apiReasoningText = "";
  let apiReasoningDetails = [];
  let inlineReasoningText = "";
  const startTime = Date.now();
  const effectiveParams = { ...store.settings };
  if (!modelSupportsReasoning(currentModel)) {
    effectiveParams.reasoningEnabled = false;
    effectiveParams.reasoningMode = "off";
  }
  effectiveParams.providerTag = chat.providerTag || "";
  effectiveParams.providerName = chat.providerName || "";
  effectiveParams.sessionId = chat.id;
  const onToken = (token, type, meta = {}) => {
    if (type === "activity") {
      activity = { ...activity, events: meta.events };
      const running = meta.events.find(event => event.status === "running");
      if (running) activity.phase = running.kind === "search" ? "search" : "tool";
      else if (activity.phase === "search" || activity.phase === "tool") activity.phase = fullText.trim() ? "writing" : apiReasoningText.trim() ? "reasoning" : "waiting";
      activityView?.update(activity);
      return;
    }
    if (type === "reasoning") {
      setStreamActivity("reasoning");
      if (Array.isArray(meta.reasoningDetails) && meta.reasoningDetails.length) {
        apiReasoningDetails = mergeReasoningDetails(apiReasoningDetails, meta.reasoningDetails);
      }
      if (token) apiReasoningText += token;
      const combinedReasoning = combineReasoningTexts(apiReasoningText, inlineReasoningText);
      if (combinedReasoning.trim()) updateStreamReasoning(combinedReasoning);
    } else {
      rawContentText += token;
      const split = splitInlineThinking(rawContentText, true);
      fullText = split.content;
      inlineReasoningText = split.reasoning;
      const combinedReasoning = combineReasoningTexts(apiReasoningText, inlineReasoningText);
      if (combinedReasoning.trim()) updateStreamReasoning(combinedReasoning);
      updateStreamContent(fullText);
    }
  };
  const onDone = async (info = {}) => {
    stopReasoningTimer();
    const duration = Date.now() - startTime;
    const usage = info.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const compTokens = usage.completion_tokens || 0;
    const model = ensureChatModelAvailable(chat);
    let cost = 0;
    if (model?.pricing) {
      const pp = parseFloat(model.pricing.prompt) || 0;
      const cp = parseFloat(model.pricing.completion) || 0;
      cost = promptTokens * pp + compTokens * cp;
    }
    if (usage.cost != null && Number.isFinite(Number(usage.cost))) cost = Number(usage.cost);
    const finalSplit = splitInlineThinking(rawContentText, false);
    fullText = finalSplit.content;
    inlineReasoningText = finalSplit.reasoning;
    const finalReasoningText = combineReasoningTexts(apiReasoningText, inlineReasoningText);
    fullText = distinctAnswer(fullText, finalReasoningText);
    if (!fullText.trim() && !finalReasoningText.trim() && !info.images?.length && !info.audio && !info.toolCalls?.length) {
      removeTypingIndicator();
      if (!info.aborted) toast(info.finishReason === "content_filter" ? "Der Provider hat die Antwort gefiltert." : "OpenRouter hat keine sichtbare Antwort geliefert.", "info");
      return;
    }
    const assistantMsg = {
      id: uuid(),
      role: "assistant",
      content: fullText,
      ts: Date.now(),
      reasoning: finalReasoningText || void 0,
      reasoning_details: apiReasoningDetails.length ? apiReasoningDetails : void 0,
      providerTag: info.providerTag || chat.providerTag || void 0,
      providerName: info.providerName || chat.providerName || void 0,
      tokens: info.usage ? { prompt: promptTokens, completion: compTokens, reasoning: usage.completion_tokens_details?.reasoning_tokens == null ? undefined : Number(usage.completion_tokens_details.reasoning_tokens) || 0 } : undefined,
      cost,
      model: info.model || chat.model,
      duration,
      generationId: info.generationId || void 0,
      finishReason: info.finishReason,
      aborted: info.aborted,
      tool_calls: info.toolCalls?.length ? info.toolCalls : void 0,
      generatedImages: info.images?.length ? info.images : void 0,
      audio: info.audio,
      activityEvents: info.activityEvents,
      annotations: info.annotations,
      sources: citationSources(info.annotations),
      debug: store.settings.showDebug ? info.debug : void 0
    };
    chat.messages.push(assistantMsg);
    await completeStreamMessage(assistantMsg, chat);
    try {
      await persistMessageMedia(assistantMsg);
    } catch {
      toast("Medien konnten nicht dauerhaft gespeichert werden. Exportiere den Chat vor dem Schließen.", "error");
    }
    chat.tokens += promptTokens + compTokens;
    chat.cost += cost;
    store.totalCost += cost;
    store.save();
    renderSidebar();
    renderMainHeader();
    updateInputTokenCount();
    if (info.finishReason === "length") toast("Die Antwort hat das Tokenlimit erreicht. Erhöhe das Limit für längere Antworten.", "info");
  };
  const onError = (err) => {
    stopReasoningTimer();
    removeTypingIndicator();
    const errorInfo = classifyApiError(err);
    const errMsg = {
      id: uuid(),
      role: "assistant",
      content: formatErrorForUser(err),
      ts: Date.now(),
      error: true,
      errorType: errorInfo.title,
      debug: store.settings.showDebug ? { message: err.message, status: err.status, payload: err.payload } : void 0
    };
    chat.messages.push(errMsg);
    store.save();
    renderMessages();
    renderMainHeader();
    toast(errorInfo.title, "error");
  };
  const streamPromise = streamChat(apiMsgs, chat.model, effectiveParams, onToken, onDone, onError);
  updateSendBtn();
  await streamPromise;
  updateSendBtn();
  updateInputTokenCount();
}
function stopStreaming() {
  if (store.abortCtrl) {
    store.abortCtrl.abort();
    store.abortCtrl = null;
  }
  stopReasoningTimer();
  stopStreamStats();
  clearStreamingFrames();
}
function regenerateMessage(msg, chat) {
  const idx = chat.messages.indexOf(msg);
  if (idx < 0) return;
  chat.messages = chat.messages.slice(0, idx);
  store.save();
  renderMessages();
  const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
  if (lastUser) sendChatMessage(lastUser.content, true);
}
function retryMessage(msg, chat) {
  const idx = chat.messages.indexOf(msg);
  if (idx < 0) return;
  chat.messages.splice(idx, 1);
  store.save();
  renderMessages();
  const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
  if (lastUser) sendChatMessage(lastUser.content, true);
  else toast("Keine vorherige Nachricht zum Wiederholen.", "info");
}

// src/ui/options.js
var groups = [
  ["Recherche", [
    ["webSearch", "Websuche", "boolean"],
    ["webEngine", "Suchmaschine", "select", ["auto", "native", "exa", "firecrawl", "parallel", "perplexity"]],
    ["webResults", "Ergebnisse je Suche", "number", 1, 25],
    ["searchContext", "Suchumfang", "select", ["low", "medium", "high"]],
    ["allowedDomains", "Erlaubte Domains", "text"],
    ["excludedDomains", "Ausgeschlossene Domains", "text"],
    ["webFetch", "Webseiten abrufen", "boolean"],
    ["datetime", "Aktuelle Uhrzeit als Werkzeug", "boolean"]
  ]],
  ["Antworten und Dateien", [
    ["output", "Antwortformat", "select", ["text", "json_object", "json_schema"]],
    ["schema", "JSON-Schema", "json"],
    ["healing", "JSON-Antworten automatisch reparieren", "boolean"],
    ["pdfEngine", "PDF-Verarbeitung", "select", ["auto", "cloudflare-ai", "mistral-ocr", "native"]],
    ["outputMedia", "Antwortmedien", "select", ["text", "image", "audio"]],
    ["imageConfig", "Bildeinstellungen", "json"],
    ["audioVoice", "Stimme", "text"],
    ["audioFormat", "Audioformat", "select", ["mp3", "wav", "flac", "opus", "pcm16"]]
  ]],
  ["Routing und Datenschutz", [
    ["providerSort", "Provider bevorzugen nach", "select", ["auto", "price", "latency", "throughput"]],
    ["allowFallbacks", "Ersatzprovider erlauben", "boolean"],
    ["requireParameters", "Alle Parameter müssen unterstützt sein", "boolean"],
    ["zdr", "Nur Provider ohne Datenspeicherung (ZDR)", "boolean"],
    ["dataCollection", "Datenverwendung durch Provider", "select", ["allow", "deny"]],
    ["providerOrder", "Provider-Reihenfolge", "text"],
    ["providerOnly", "Nur diese Provider", "text"],
    ["providerIgnore", "Diese Provider ausschließen", "text"],
    ["quantizations", "Quantisierungen", "text"],
    ["fallbackModels", "Ersatzmodelle", "text"],
    ["maxPromptPrice", "Max. Eingabepreis ($ pro Million Token)", "number", 0],
    ["maxCompletionPrice", "Max. Ausgabepreis ($ pro Million Token)", "number", 0]
  ]],
  ["Reasoning und Sampling", [
    ["reasoningBudget", "Maximale Reasoning-Token (0 = automatisch)", "number", 0],
    ["reasoningExclude", "Reasoning aus Antwort ausblenden", "boolean"],
    ["reasoningSummary", "Reasoning-Zusammenfassung", "select", ["auto", "concise", "detailed", "none"]],
    ["seed", "Zufallsstartwert", "number"],
    ["topK", "Top K", "number", 0],
    ["minP", "Min P", "number", 0, 1],
    ["topA", "Top A", "number", 0, 1],
    ["repetitionPenalty", "Wiederholungsstrafe", "number", 0, 2],
    ["stop", "Stoppsequenzen (eine pro Zeile, max. 4)", "textarea"],
    ["logprobs", "Token-Wahrscheinlichkeiten zurückgeben", "boolean"],
    ["topLogprobs", "Top Logprobs", "number", 0, 20],
    ["serviceTier", "Service-Priorität", "select", ["auto", "default", "flex", "priority", "scale", "ultrafast"]]
  ]],
  ["Werkzeuge", [
    ["tools", "Server-Tools und eigene Funktionen (JSON-Liste)", "json"],
    ["toolChoice", "Werkzeugwahl", "select", ["auto", "none", "required"]],
    ["parallelTools", "Parallele Funktionsaufrufe erlauben", "boolean"],
    ["maxToolCalls", "Maximale Server-Tool-Aufrufe", "number", 1, 100]
  ]],
  ["Weitere API-Optionen", [["extra", "Zusätzliche Parameter (JSON-Objekt)", "json"]]]
];
var labels = { text: "Text", image: "Text und Bilder", audio: "Text und Audio", json_object: "JSON-Objekt", json_schema: "JSON mit Schema", auto: "Automatisch", native: "Nativ", allow: "Erlauben", deny: "Verbieten", price: "Preis", latency: "Antwortzeit", throughput: "Geschwindigkeit", low: "Niedrig", medium: "Mittel", high: "Hoch" };
function showChatOptions() {
  const { content, close, actions: footer, formId } = openFeaturePanel("Chat-Optionen");
  const model = store.modelMap[store.getChat()?.model];
  content.append(el("p", { className: "feature-intro" }, "Optionen gelten für neue Anfragen. Verfügbarkeit und zusätzliche Kosten hängen vom Modell, Provider und Werkzeug ab."));
  const form = el("form", { className: "feature-form", id: formId });
  const draft = normalizeOpenRouterSettings(store.settings.openrouter);
  const controls = /* @__PURE__ */ new Map();
  for (const [title, fields] of groups) {
    const details = el("details", { className: "feature-section", ...title === "Recherche" ? { open: "" } : {} });
    details.append(el("summary", {}, title));
    const grid = el("div", { className: "feature-fields" });
    for (const [key, label, type, choices, max] of fields) {
      const wrap = el("label", { className: `feature-field${type === "boolean" ? " feature-checkbox" : ""}${["json", "textarea"].includes(type) ? " field-wide" : ""}` });
      let control;
      if (type === "select") {
        control = el("select", { name: key });
        for (const choice of choices) {
          const option = el("option", { value: choice }, labels[choice] || choice);
          if (key === "outputMedia" && choice !== "text" && !supportsOutput(model, choice)) option.disabled = true;
          if (key === "output" && choice !== "text" && Array.isArray(model?.supported_parameters) && !model.supported_parameters.includes("response_format")) option.disabled = true;
          control.append(option);
        }
      } else if (["json", "textarea"].includes(type)) control = el("textarea", { name: key, rows: type === "json" ? "5" : "3", spellcheck: "false", className: type === "json" ? "json-editor" : "" });
      else control = el("input", { name: key, type: type === "boolean" ? "checkbox" : type, ...type === "number" ? { step: "any", ...choices !== void 0 ? { min: choices } : {}, ...max !== void 0 ? { max } : {} } : {} });
      if (type === "boolean") control.checked = draft[key];
      else control.value = draft[key];
      if (type === "boolean") wrap.append(control, el("span", {}, label));
      else wrap.append(el("span", {}, label), control);
      control.setAttribute("aria-label", label);
      controls.set(key, { control, type });
      grid.append(wrap);
    }
    if (title === "Werkzeuge") {
      grid.append(el("p", { className: "field-wide feature-note" }, "Eigene Funktionen werden als Aufruf angezeigt. Gib ihr Ergebnis im Chat ein, um fortzufahren. Zusätzliche Server-Tools findest du im OpenRouter-Bereich unter „Tools“."));
      const add = el("button", { type: "button", className: "feature-secondary field-wide" }, "Beispiel: Berater hinzufügen");
      add.onclick = () => {
        try {
          const control = controls.get("tools").control;
          const tools = JSON.parse(control.value);
          if (!Array.isArray(tools)) throw new Error();
          tools.push({ type: "openrouter:advisor", parameters: { model: "~anthropic/claude-opus-latest" } });
          control.value = JSON.stringify(tools, null, 2);
        } catch {
          toast("Die Werkzeugliste muss gültiges JSON enthalten.", "error");
        }
      };
      grid.append(add);
    }
    if (title === "Weitere API-Optionen") grid.append(el("p", { className: "field-wide feature-note" }, "Für Cache-Control, Metadaten, Prediction, Trace, zusätzliche Plugins und modellabhängige Parameter. Modell, Nachrichten und Streaming verwaltet Nexus. Die vollständigen Felder stehen im OpenRouter-Bereich unter Chat."));
    details.append(grid);
    form.append(details);
  }
  const error = el("p", { className: "feature-error", role: "alert" });
  const reset = el("button", { type: "button", className: "feature-secondary" }, "Zurücksetzen");
  reset.onclick = () => {
    for (const [key, { control, type }] of controls) {
      if (type === "boolean") control.checked = OPENROUTER_DEFAULTS[key];
      else control.value = OPENROUTER_DEFAULTS[key];
    }
  };
  const save = el("button", { type: "submit", form: formId, className: "feature-primary" }, "Optionen speichern");
  footer.append(reset, save);
  form.append(error);
  form.onsubmit = (event) => {
    event.preventDefault();
    try {
      for (const [key, { control, type }] of controls) {
        const value = type === "boolean" ? control.checked : control.value;
        draft[key] = typeof OPENROUTER_DEFAULTS[key] === "number" ? Number(value) : value;
      }
      buildOpenRouterOptions(draft, model, { providerTag: store.getChat()?.providerTag || "" });
      store.settings.openrouter = draft;
      store.save();
      close();
      renderInputArea();
      toast("Chat-Optionen gespeichert", "success");
    } catch (err) {
      error.textContent = err.message;
      error.scrollIntoView({ block: "nearest" });
    }
  };
  content.append(form);
}

// src/ui/floating-menu.js
function placeFloatingMenu(menu, anchor) {
  document.body.append(menu);
  const place = () => {
    if (!menu.isConnected || !anchor.isConnected) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const edge = 12, gap = 8;
    const button = anchor.getBoundingClientRect();
    menu.style.width = Math.min(260, width - edge * 2) + "px";
    const above = Math.max(0, button.top - top - edge - gap);
    const below = Math.max(0, top + height - edge - button.bottom - gap);
    const useAbove = above >= Math.min(menu.scrollHeight, 300) || above >= below;
    menu.style.maxHeight = Math.max(40, useAbove ? above : below) + "px";
    const bounds = menu.getBoundingClientRect();
    menu.style.left = Math.max(left + edge, Math.min(button.left, left + width - edge - bounds.width)) + "px";
    menu.style.top = (useAbove ? Math.max(top + edge, button.top - gap - bounds.height) : button.bottom + gap) + "px";
  };
  const observer = new ResizeObserver(place);
  observer.observe(anchor);
  window.addEventListener("resize", place);
  window.visualViewport?.addEventListener("resize", place);
  window.visualViewport?.addEventListener("scroll", place);
  place();
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", place);
    window.visualViewport?.removeEventListener("resize", place);
    window.visualViewport?.removeEventListener("scroll", place);
    menu.remove();
  };
}

// src/ui/composer.js
var cleanupReasoningMenu;
function renderInputArea() {
  const area = document.getElementById("chat-input-area");
  if (!area) return;
  cleanupReasoningMenu?.();
  cleanupReasoningMenu = null;
  area.onkeydown = null;
  const prevTa = document.getElementById("msg-input");
  const prevHadFocus = prevTa && document.activeElement === prevTa;
  const prevCursor = prevTa ? prevTa.selectionStart : 0;
  const chat = store.getChat();
  const currentModel = ensureChatModelAvailable(chat);
  const supportsReasoning = modelSupportsReasoning(currentModel);
  const attachmentCaps = getAttachmentCapabilities(currentModel);
  if (!supportsReasoning) uiState.reasoningMenuOpen = false;
  syncReasoningMenuState();
  if (uiState.reasoningOutsideClickHandler) {
    document.removeEventListener("click", uiState.reasoningOutsideClickHandler);
    uiState.reasoningOutsideClickHandler = null;
  }
  const reasoningOptions = [
    ["auto", "Auto", "modellnah"],
    ["minimal", "Minimal", "schnell"],
    ["low", "Low", "leicht"],
    ["medium", "Medium", "balance"],
    ["high", "High", "tief"],
    ["xhigh", "XHigh", "max"],
    ["max", "Max", "höchste"],
    ["off", "Aus", "kein"]
  ];
  const reasoningMenuHtml = uiState.reasoningMenuOpen ? `<div class="reasoning-menu" id="reasoning-menu" role="menu">
      ${reasoningOptions.map(([mode, label, meta]) => `<button type="button" role="menuitemradio" data-reasoning-mode="${mode}" class="${store.settings.reasoningMode === mode ? "active" : ""}" aria-checked="${store.settings.reasoningMode === mode ? "true" : "false"}"><span>${label}</span><span class="rm-meta">${meta}</span></button>`).join("")}
    </div>` : "";
  const attachTitle = "Datei anhängen (" + ["Text", attachmentCaps.pdf && "PDF", attachmentCaps.image && "Bilder", attachmentCaps.audio && "Audio", attachmentCaps.video && "Video"].filter(Boolean).join(", ") + ")";
  contextView?.dispose();
  contextView = undefined;
  composerCleanup?.();
  composerCleanup = studioViews.mountComposer(area, {
    accept: attachmentCaps.any ? attachmentAcceptForCapabilities(attachmentCaps) : null,
    webSearch: store.settings.openrouter.webSearch,
    reasoning: supportsReasoning ? {
      mode: store.settings.reasoningMode,
      title: getReasoningTitle(),
      open: uiState.reasoningMenuOpen
    } : null,
    onToggleWeb() {
      store.settings.openrouter.webSearch = !store.settings.openrouter.webSearch;
      store.save();
      return store.settings.openrouter.webSearch;
    },
    onOptions: showChatOptions,
    onExplorer: () => showOpenRouter(),
    onPrompts: () => studioViews.open("prompts")
  });
  contextView = studioViews.mountContext(area.querySelector("#context-meter"));
  if (reasoningMenuHtml) area.insertAdjacentHTML("beforeend", reasoningMenuHtml);
  const ta = area.querySelector("#msg-input");
  const sendBtn = area.querySelector("#btn-send");
  const attachBtn = area.querySelector("#btn-attach");
  const fileInput = area.querySelector("#file-input");
  const reasoningBtn = area.querySelector("#btn-reasoning");
  const slashBtn = area.querySelector("#btn-slash");
  const dictateBtn = area.querySelector("#btn-dictate");
  if (attachBtn) {
    attachBtn.title = attachTitle;
    attachBtn.setAttribute("aria-label", attachTitle);
  }
  if (chat && chat.draft) {
    ta.value = chat.draft;
    requestAnimationFrame(() => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    });
  }
  if (prevHadFocus) {
    ta.focus();
    try {
      ta.setSelectionRange(prevCursor, prevCursor);
    } catch {
    }
  }
  ta.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    updateSendBtn();
    updateInputTokenCount();
    const c = store.getChat();
    if (c) {
      c.draft = ta.value;
      store.saveDebounced(500);
    }
  });
  ta.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !isMobile()) {
      e.preventDefault();
      if (store.isStreaming) stopStreaming();
      else if (ta.value.trim() || uiState.attachedFiles.length) handleSend();
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (store.isStreaming) stopStreaming();
      else if (ta.value.trim() || uiState.attachedFiles.length) handleSend();
    }
  });
  ta.addEventListener("paste", (e) => {
    if (!attachmentCaps.image) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    let handled = false;
    for (const item of items) {
      if (item.type && item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (!blob) continue;
        if (blob.size > MAX_IMAGE_ATTACHMENT_BYTES) {
          toast(`Eingefügtes Bild ist zu groß. Maximal 4 MB pro Bild.`, "error");
          continue;
        }
        handled = true;
        const reader = new FileReader();
        const chatId = store.activeChatId;
        reader.onload = async () => {
          let attachment = {
            kind: "image",
            name: blob.name || `pasted-${Date.now()}.png`,
            type: blob.type || "image/png",
            size: blob.size || 0,
            data: reader.result
          };
          try {
            if (!store.demoMode) attachment = await persistAttachment(attachment);
            if (!ta.isConnected || chatId !== store.activeChatId) return;
            uiState.attachedFiles.push(attachment);
          } catch {
            toast("Das eingefügte Bild konnte nicht gespeichert werden.", "error");
            return;
          }
          updateAttachedPreview();
          updateSendBtn();
        };
        reader.readAsDataURL(blob);
      }
    }
    if (handled) e.preventDefault();
  });
  sendBtn.addEventListener("click", () => {
    if (store.isStreaming) stopStreaming();
    else if (ta.value.trim() || uiState.attachedFiles.length) handleSend();
  });
  if (attachBtn && fileInput) attachBtn.addEventListener("click", () => fileInput.click());
  if (fileInput) fileInput.addEventListener("change", handleFileAttach);
  slashBtn?.addEventListener("click", () => {
    if (!ta.value.trim()) ta.value = "/";
    else if (!ta.value.endsWith(" ")) ta.value += " /";
    else ta.value += "/";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.focus();
  });
  dictateBtn?.addEventListener("click", () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast("Diktat wird von diesem Browser nicht unterstützt.", "info");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = document.documentElement.lang || "de-DE";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      dictateBtn.classList.add("active");
      dictateBtn.setAttribute("aria-pressed", "true");
    };
    recognition.onend = () => {
      dictateBtn.classList.remove("active");
      dictateBtn.setAttribute("aria-pressed", "false");
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") toast("Diktat konnte nicht gestartet werden.", "error");
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      ta.value = `${ta.value}${ta.value.trim() ? " " : ""}${transcript}`;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.focus();
    };
    recognition.start();
  });
  if (reasoningBtn) reasoningBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    uiState.reasoningMenuOpen = !uiState.reasoningMenuOpen;
    renderInputArea();
  });
  area.querySelectorAll("[data-reasoning-mode]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setReasoningMode(btn.dataset.reasoningMode);
    });
  });
  if (uiState.reasoningMenuOpen) {
    const menu = area.querySelector("#reasoning-menu");
    cleanupReasoningMenu = placeFloatingMenu(menu, reasoningBtn);
    const closeMenu = (restoreFocus = true) => {
      uiState.reasoningMenuOpen = false;
      cleanupReasoningMenu?.();
      cleanupReasoningMenu = null;
      syncReasoningMenuState();
      reasoningBtn.setAttribute("aria-expanded", "false");
      area.onkeydown = null;
      if (uiState.reasoningOutsideClickHandler) {
        document.removeEventListener("click", uiState.reasoningOutsideClickHandler);
        uiState.reasoningOutsideClickHandler = null;
      }
      if (restoreFocus) reasoningBtn.focus({ preventScroll: true });
    };
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      const buttons = [...menu.querySelectorAll("button")];
      const current = buttons.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (current + 1) % buttons.length : event.key === "ArrowUp" ? (current - 1 + buttons.length) % buttons.length : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
      if (next >= 0) {
        event.preventDefault();
        buttons[next].focus();
      }
    });
    menu.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
    setTimeout(() => {
      if (!menu.isConnected) return;
      uiState.reasoningOutsideClickHandler = (e) => {
        const menu2 = document.getElementById("reasoning-menu");
        const button = document.getElementById("btn-reasoning");
        if (menu2?.contains(e.target) || button?.contains(e.target)) return;
        closeMenu(false);
      };
      document.addEventListener("click", uiState.reasoningOutsideClickHandler);
    }, 0);
    area.onkeydown = (e) => {
      if (e.key !== "Escape") return;
      closeMenu();
    };
  }
  updateAttachedPreview();
  updateSendBtn();
  updateInputTokenCount();
}
function updateInputTokenCount() {
  const ta = document.getElementById("msg-input");
  const lbl = document.getElementById("input-tokens");
  if (!ta || !lbl) return;
  const chat = store.getChat();
  const model = ensureChatModelAvailable(chat);
  if (!chat || !model) return;
  const draft = ta.value.trim();
  const preview = { ...chat, messages: [...chat.messages, ...(draft || uiState.attachedFiles.length ? [{ role: "user", content: draft, attachments: uiState.attachedFiles }] : [])] };
  let prepared, warning;
  try { prepared = buildApiMessagesForChat(preview, model); }
  catch { prepared = { messages: [...(store.settings.systemPrompt ? [{role: "system", content: store.settings.systemPrompt}] : []), ...preview.messages.map((m) => messageToApiMessage(m, model)).filter(Boolean)], truncated: 0, clipped: 0 }; warning = "Die Anfrage passt möglicherweise nicht ins Kontextfenster. Kürze die Eingabe oder wähle ein anderes Modell."; }
  const counts = { system: 0, messages: 0, files: 0, tools: 0 };
  for (const message of prepared.messages) {
    const total = estimateApiMessageTokens(message) + 4;
    if (message.role === "system") counts.system += total;
    else if (message.role === "tool" || message.tool_calls) counts.tools += total;
    else {
      const plain = estimateTokens(extractContentText(message.content));
      const media = Array.isArray(message.content) ? message.content.filter((p) => ["image_url", "file", "input_audio", "video_url"].includes(p.type)).reduce((sum, p) => sum + (p.type === "file" ? 4000 : 1000), 0) : 0;
      counts.files += media;
      counts.messages += Math.max(plain, total - media);
    }
  }
  const live = estimateTokens(uiState.streamContentPendingText || "") + estimateTokens(uiState.streamReasoningPendingText || "");
  const reserve = store.settings.maxTokens > 0 ? store.settings.maxTokens : CONTEXT_TOKEN_RESERVE;
  const segments = [
    { id: "system", label: "Systemprompt", tokens: counts.system },
    { id: "messages", label: "Nachrichten und Textanhänge", tokens: counts.messages },
    { id: "files", label: "Medienanhänge", tokens: counts.files },
    { id: "tools", label: "Tool-Nachrichten", tokens: counts.tools },
    { id: "live", label: "Laufende Antwort", tokens: live },
    { id: "reserve", label: "Ausgabereserve (verbleibend)", tokens: Math.max(0, reserve - live) }
  ];
  const tok = segments.reduce((sum, part) => sum + part.tokens, 0);
  lbl.textContent = `~${formatTokens(tok)} tok`;
  const ctx = Number(model.context_length) || 0;
  lbl.classList.toggle("warn", ctx > 0 && tok > ctx * .8);
  const last = [...chat.messages].reverse().find((m) => m.role === "assistant" && !m.error && m.tokens && !(m.aborted && !m.tokens.prompt && !m.tokens.completion));
  contextView?.update({ segments, limit: ctx, model: model.name || model.id, omitted: prepared.truncated, clipped: prepared.clipped, demo: store.demoMode, warning,
    lastUsage: last ? { prompt: Number(last.tokens.prompt) || 0, completion: Number(last.tokens.completion) || 0, reasoning: last.tokens.reasoning == null ? undefined : Number(last.tokens.reasoning) || 0 } : undefined });
}
function updateSendBtn() {
  const sendBtn = document.getElementById("btn-send");
  const ta = document.getElementById("msg-input");
  if (!sendBtn || !ta) return;
  if (store.isStreaming) {
    sendBtn.setAttribute("aria-label", "Antwort stoppen");
    sendBtn.classList.add("stop");
    sendBtn.disabled = false;
  } else {
    sendBtn.setAttribute("aria-label", "Nachricht senden");
    sendBtn.classList.remove("stop");
    sendBtn.disabled = !ta.value.trim() && !uiState.attachedFiles.length;
  }
}
function focusInput() {
  if (isMobile()) return;
  setTimeout(() => {
    const ta = document.getElementById("msg-input");
    if (ta) ta.focus();
  }, 150);
}

// src/ui/state.js
var uiState = {
  modelsVisible: false,
  modelFilter: "",
  modelCategory: "all",
  chatSearch: "",
  editingMsgId: null,
  attachedFiles: [],
  lastActiveChatId: null,
  modelsRestoreFocus: null,
  settingsRestoreFocus: null,
  sidebarRenderRaf: null,
  reasoningMenuOpen: false,
  reasoningOutsideClickHandler: null,
  usageExpanded: false,
  reasoningStartTime: null,
  reasoningTimerInterval: null,
  streamContentStart: null,
  streamStatsInterval: null,
  streamReasoningRaf: null,
  streamReasoningTimer: null,
  streamReasoningLastRender: 0,
  streamReasoningPendingText: "",
  streamContentRaf: null,
  streamContentTimer: null,
  streamContentLastRender: 0,
  streamContentPendingText: "",
  autoScrollRaf: null
};
function syncReasoningMenuState() {
  const open = Boolean(uiState.reasoningMenuOpen);
  document.getElementById("main-area")?.classList.toggle("reasoning-menu-open", open);
  document.getElementById("chat-container")?.classList.toggle("reasoning-menu-open", open);
  document.getElementById("chat-input-area")?.classList.toggle("reasoning-menu-open", open);
}
var messageRenderCache = /* @__PURE__ */ new WeakMap();
function scheduleRenderSidebar() {
  if (uiState.sidebarRenderRaf) return;
  uiState.sidebarRenderRaf = requestAnimationFrame(() => {
    uiState.sidebarRenderRaf = null;
    renderSidebar();
  });
}
function startReasoningTimer() {
  if (uiState.reasoningTimerInterval) return;
  uiState.reasoningStartTime = Date.now();
  uiState.reasoningTimerInterval = setInterval(() => {
    const elT = document.getElementById("r-timer");
    if (elT) {
      const elapsed = (Date.now() - uiState.reasoningStartTime) / 1e3;
      elT.textContent = elapsed.toFixed(1) + "s";
    }
  }, 100);
}
function stopReasoningTimer() {
  if (uiState.reasoningTimerInterval) {
    clearInterval(uiState.reasoningTimerInterval);
    uiState.reasoningTimerInterval = null;
  }
}
function startStreamStats() {
  uiState.streamContentStart = Date.now();
  if (uiState.streamStatsInterval) clearInterval(uiState.streamStatsInterval);
  uiState.streamStatsInterval = setInterval(updateStreamStats, 300);
}
function stopStreamStats() {
  if (uiState.streamStatsInterval) {
    clearInterval(uiState.streamStatsInterval);
    uiState.streamStatsInterval = null;
  }
}
function updateStreamStats() {
  const elS = document.getElementById("typing-stats");
  if (!elS || !uiState.streamContentStart) return;
  const text = uiState.streamContentPendingText || "";
  const tokens = estimateTokens(text);
  const elapsed = (Date.now() - uiState.streamContentStart) / 1e3;
  const tps = elapsed > 0.1 ? (tokens / elapsed).toFixed(1) : "0";
  elS.innerHTML = `<span>${tokens} tok</span><span class="sep">·</span><span>${tps} tok/s</span>`;
}
function setReasoningMode(mode) {
  const chat = store.getChat();
  const currentModel = ensureChatModelAvailable(chat);
  if (!modelSupportsReasoning(currentModel)) {
    toast("Dieses Modell unterstützt kein Reasoning.", "info");
    return;
  }
  store.settings.reasoningMode = REASONING_MODES.includes(mode) ? mode : "off";
  store.settings.reasoningEnabled = store.settings.reasoningMode !== "off";
  store.settings.reasoningEffort = REASONING_EFFORTS.includes(store.settings.reasoningMode) ? store.settings.reasoningMode : "medium";
  uiState.reasoningMenuOpen = false;
  store.save();
  renderInputArea();
}
function getReasoningTitle(mode = store.settings.reasoningMode) {
  const titles = {
    off: "Reasoning aus",
    auto: "Reasoning Auto: Modell/Provider wählt passende Denktiefe",
    minimal: "Reasoning Minimal: schnell und günstig",
    low: "Reasoning Low: leichtes Nachdenken",
    medium: "Reasoning Medium: ausgewogen",
    high: "Reasoning High: gründlicher, langsamer und teurer",
    xhigh: "Reasoning XHigh: maximale Denktiefe, am langsamsten und teuersten",
    max: "Reasoning Max: höchster verfügbarer Aufwand"
  };
  return titles[mode] || titles.off;
}

// src/ui/rename.js
function showRenameModal(chatId) {
  const chat = store.chats.find((c) => c.id === chatId);
  if (!chat) return;
  const modal = el("dialog", {
    className: "modal",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "rename-title",
    tabIndex: "-1"
  });
  modal.innerHTML = `
  <h2 id="rename-title">Chat umbenennen</h2>
  <input type="text" id="rename-input" value="${escAttr(chat.title)}" maxlength="80" aria-label="Chat-Titel">
  <div class="modal-btns">
    <button class="btn-cancel" type="button">Abbrechen</button>
    <button class="btn-confirm" type="button">Speichern</button>
  </div>
`;
  document.body.appendChild(modal);
  const inp = modal.querySelector("#rename-input");
  setTimeout(() => {
    inp.focus();
    inp.select();
  }, 50);
  let restoreFocus = () => {
  };
  const close = () => {
    restoreFocus();
    modal.remove();
  };
  const controller = openNativeDialog(modal, close);
  restoreFocus = () => controller.dispose();
  modal.querySelector(".btn-cancel").onclick = close;
  modal.querySelector(".btn-confirm").onclick = () => {
    chat.title = inp.value.trim() || chat.title;
    store.save();
    renderSidebar();
    renderMainHeader();
    close();
  };
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") modal.querySelector(".btn-confirm").click();
    if (e.key === "Escape") close();
  });
}

// src/ui/sidebar.js
function toggleSidebar(open) {
  const sb = document.getElementById("sidebar");
  const bd = document.getElementById("sidebar-backdrop");
  if (!sb || !bd) return;
  sb.classList.toggle("collapsed", !open);
  bd.classList.toggle("visible", Boolean(open && isMobile()));
  syncSidebarAccessibility(Boolean(open));
  if (!isMobile()) {
    store.settings.sidebarOpen = Boolean(open);
    store.save();
  }
}
function syncSidebarAccessibility(open) {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  sidebar.setAttribute("aria-hidden", open ? "false" : "true");
  sidebar.toggleAttribute("inert", !open);
  document.getElementById("btn-toggle-sb")?.setAttribute("aria-expanded", String(open));
}
function renderSidebar() {
  const sb = document.getElementById("sidebar");
  if (!sb) return;
  const activeBefore = document.activeElement;
  const searchWasFocused = activeBefore && activeBefore.id === "chat-search";
  const cursorPos = searchWasFocused ? activeBefore.selectionStart : 0;
  const listScroll = document.getElementById("chat-list")?.scrollTop || 0;
  const favChats = store.chats.filter((c) => c.fav && !c.archived);
  const recentChats = store.chats.filter((c) => !c.fav && !c.archived && (c.messages.length || c.draft?.trim() || c.title !== "Neuer Chat"));
  const archivedChats = store.chats.filter((c) => c.archived);
  const filt = uiState.chatSearch.trim().toLocaleLowerCase("de");
  const filterFn = (c) => !filt || c.title.toLocaleLowerCase("de").includes(filt) || c.messages.some((message) => message.content.toLocaleLowerCase("de").includes(filt));
  const hasMatches = favChats.filter(filterFn).length || recentChats.filter(filterFn).length || archivedChats.filter(filterFn).length;
  sb.innerHTML = `
  <div class="sidebar-head">
    <div class="brand"><span class="workspace-wordmark-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M6 18V6l12 12V6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="brand-word">Nexus<small>Chat Studio</small></span></div>
    <button class="btn-icon" id="sb-collapse" title="Seitenleiste schließen" aria-label="Seitenleiste schließen">${IC.x}</button>
  </div>
  <div class="sidebar-actions">
    <button class="btn-new-chat" id="btn-new-chat">${IC.plus}<span>Neuer Chat</span></button>
  </div>
  <div class="sidebar-search">
      <input type="text" placeholder="Chats suchen" id="chat-search" value="${escAttr(uiState.chatSearch)}" autocomplete="off" spellcheck="false">
  </div>
    <div class="studio-sidebar">
      <button type="button" data-studio="compare">${IC.cpu} Modellvergleich</button>
      <button type="button" data-studio="prompts">${IC.file} Prompt-Bibliothek</button>
    </div>
  <div class="chat-list" id="chat-list">
    ${favChats.filter(filterFn).length ? `<div class="chat-list-section"><div class="section-label">${IC.star} Favoriten</div>${favChats.filter(filterFn).map(chatItemHtml).join("")}</div>` : ""}
    ${recentChats.filter(filterFn).length ? `<div class="chat-list-section"><div class="section-label">Letzte Chats</div>${recentChats.filter(filterFn).map(chatItemHtml).join("")}</div>` : ""}
    ${archivedChats.filter(filterFn).length ? `<div class="chat-list-section"><div class="section-label">Archiviert</div>${archivedChats.filter(filterFn).map(chatItemHtml).join("")}</div>` : ""}
  </div>
  <div class="sidebar-footer">
    <button type="button" data-studio="command">${IC.search}<span>Schnellaktionen</span><kbd>${platformModifier()} K</kbd></button>
    <button id="sb-settings">${IC.settings}<span>Einstellungen</span></button>
  </div>
`;
  const collapseBtn = sb.querySelector("#sb-collapse");
  const searchField = sb.querySelector("#chat-search");
  if (searchField && !searchField.closest(".search-wrap")) {
    searchField.setAttribute("aria-label", "Chats durchsuchen");
    const wrap = el("div", { className: "search-wrap" });
    const searchIcon = el("span", { className: "workspace-search-icon", innerHTML: IC.search });
    searchField.parentNode.insertBefore(wrap, searchField);
    wrap.appendChild(searchIcon);
    wrap.appendChild(searchField);
  }
  const list = sb.querySelector("#chat-list");
  if (list) {
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", "Chatliste");
    if (!hasMatches) list.insertAdjacentHTML("beforeend", `<div class="chat-list-empty">${filt ? 'Keine passenden Chats<span>Versuche einen anderen Suchbegriff.</span>' : 'Hier beginnen deine Gespräche<span>Starte einen Chat oder importiere ein Backup.</span>'}</div>`);
  }
  const newList = document.getElementById("chat-list");
  if (newList) newList.scrollTop = listScroll;
  if (searchWasFocused) {
    const newInp = document.getElementById("chat-search");
    if (newInp) {
      newInp.focus();
      try {
        newInp.setSelectionRange(cursorPos, cursorPos);
      } catch {
      }
    }
  }
  collapseBtn.onclick = () => {
    toggleSidebar(false);
    document.getElementById("btn-toggle-sb")?.focus();
  };

  sb.querySelectorAll("[data-studio]").forEach((button) => {
    button.onclick = () => studioViews.open(button.dataset.studio);
  });
  sb.querySelector("#btn-new-chat").onclick = () => {
    if (store.isStreaming) {
      toast("Bitte warte auf die laufende Antwort oder stoppe sie.", "info");
      return;
    }
    uiState.attachedFiles = [];
    store.newChat();
    uiState.editingMsgId = null;
    render();
    focusInput();
    if (isMobile()) toggleSidebar(false);
  };
  sb.querySelector("#chat-search").addEventListener("input", (e) => {
    uiState.chatSearch = e.target.value;
    clearTimeout(uiState.searchDebounce);
    uiState.searchDebounce = setTimeout(scheduleRenderSidebar, 160);
  });
  sb.querySelector("#sb-settings").onclick = () => {
    toggleSettings(true);
    if (isMobile()) toggleSidebar(false);
  };
  sb.querySelectorAll(".chat-item").forEach((item) => {
    const id = item.dataset.id;
    const menu = item.querySelector(".chat-actions");
    menu.onfocusout = (event) => {
      if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
    };
    item.addEventListener("keydown", (e) => {
      if (e.target.closest(".chat-actions")) {
        if (e.key === "Escape" && menu.open) {
          menu.open = false;
          menu.querySelector("summary").focus();
        }
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        item.click();
      }
    });
    item.addEventListener("click", (e) => {
      if (e.target.closest(".chat-actions")) return;
      if (store.isStreaming) {
        toast("Bitte warte auf die laufende Antwort oder stoppe sie.", "info");
        return;
      }
      if (store.activeChatId !== id) {
        uiState.attachedFiles = [];
      }
      store.activeChatId = id;
      uiState.editingMsgId = null;
      render();
      focusInput();
      if (isMobile()) toggleSidebar(false);
    });
  });
  sb.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      btn.closest(".chat-actions").open = false;
      const id = btn.closest(".chat-item").dataset.id;
      const action = btn.dataset.action;
      if (store.isStreaming && ["delete", "archive"].includes(action)) {
        toast("Bitte stoppe zuerst die laufende Antwort.", "info");
        return;
      }
      if (action === "fav") {
        const c = store.chats.find((x) => x.id === id);
        if (c) {
          c.fav = !c.fav;
          store.save();
          renderSidebar();
        }
      }
      if (action === "archive") {
        const c = store.chats.find((x) => x.id === id);
        if (c) {
          c.archived = !c.archived;
          store.save();
          render();
        }
      }
      if (action === "rename") showRenameModal(id);
      if (action === "delete") {
        showConfirmModal({
          title: "Chat löschen",
          message: "Dieser Chat wird lokal gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
          confirmText: "Löschen",
          danger: true,
          onConfirm: () => {
            store.deleteChat(id);
            render();
            toast("Chat gelöscht", "success");
          }
        });
      }
    });
  });
}
function chatItemHtml(c) {
  const active = c.id === store.activeChatId ? " active" : "";
  const archived = c.archived ? " archived" : "";
  const draftDot = c.draft && c.draft.trim() ? `<span class="chat-draft-dot" title="Entwurf vorhanden"></span>` : "";
  return `<div class="chat-item${active}${archived}" data-id="${escAttr(c.id)}" role="listitem">
  <button type="button" class="chat-open" aria-label="${escAttr(c.title)}"${c.id === store.activeChatId ? ' aria-current="page"' : ""}></button>
  <span class="chat-icon">${IC.chat}</span>
  <span class="chat-title">${esc(c.title)}</span>
  ${draftDot}
  <details class="chat-actions">
    <summary aria-label="Aktionen für ${escAttr(c.title)}">${IC.more}</summary>
    <div class="workspace-chat-row-menu">
      <button type="button" data-action="fav">${c.fav ? IC.starFill : IC.star} ${c.fav ? "Favorit entfernen" : "Als Favorit markieren"}</button>
      <button type="button" data-action="rename">${IC.edit} Umbenennen</button>
      <button type="button" data-action="archive">${IC.archive} ${c.archived ? "Wiederherstellen" : "Archivieren"}</button>
      <button type="button" data-action="delete">${IC.trash} Löschen</button>
    </div>
  </details>
</div>`;
}

// src/ui/auth.js
async function openWorkspace() {
  const savedKey = storageGet("sessionStorage", "nx_key") || storageGet("localStorage", "nx_key");
  if (savedKey) {
    const valid = await validateKey(savedKey);
    if (valid === true) {
      store.apiKey = savedKey;
      document.getElementById("app-main").classList.add("visible");
      await initApp();
      return;
    }
    if (valid === false) {
      storageRemove("sessionStorage", "nx_key");
      storageRemove("localStorage", "nx_key");
    }
    enterDemoMode();
    toast(valid === false ? "Der gespeicherte API-Key ist ungültig." : "Der gespeicherte API-Key konnte gerade nicht geprüft werden.", "info");
    return;
  }
  enterDemoMode();
}

export async function connectNexus(key, remember, signal) {
  if (!store.demoMode) return;
  if (store.isStreaming) throw new Error("Stoppe die laufende Antwort, bevor du OpenRouter verbindest.");
  const valid = await validateKey(key);
  signal.throwIfAborted();
  if (valid !== true) throw new Error(valid === false ? "Der OpenRouter API-Key ist ungültig." : "OpenRouter ist gerade nicht erreichbar. Versuche es erneut.");
  if (store.isStreaming) throw new Error("Stoppe die laufende Antwort, bevor du OpenRouter verbindest.");

  const draft = store.getChat()?.draft || "";
  const theme = store.settings.theme;
  Object.assign(store, liveBeforeDemo, { apiKey: key, demoMode: false });
  liveBeforeDemo = undefined;
  store.settings.theme = theme;
  store.settings.keyStorage = remember ? "local" : "session";
  uiState.attachedFiles = [];
  uiState.editingMsgId = null;
  uiState.chatSearch = "";
  uiState.reasoningMenuOpen = false;
  const storage = remember ? "localStorage" : "sessionStorage";
  storageRemove(remember ? "sessionStorage" : "localStorage", "nx_key");
  if (!storageSet(storage, "nx_key", key)) {
    toast("Der Key ist bis zum Neuladen aktiv. Der Browser konnte ihn nicht speichern.", "info");
  }
  store.save();
  await initApp(draft);
}

function enterDemoMode() {
  liveBeforeDemo = {
    chats: store.chats,
    models: store.models,
    modelMap: store.modelMap,
    endpointMap: store.endpointMap,
    endpointErrors: store.endpointErrors,
    favModels: store.favModels,
    settings: store.settings,
    totalCost: store.totalCost
  };
  store.apiKey = "";
  const now = Date.now();
  const demoModel = {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    context_length: 2e5,
    pricing: { prompt: "0.000003", completion: "0.000015" },
    architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
    supported_parameters: ["reasoning", "temperature", "top_p", "max_tokens"]
  };
  store.demoMode = true;
  store.models = [demoModel, {
    id: "openai/gpt-5.2",
    name: "GPT-5.2",
    context_length: 128e3,
    pricing: { prompt: "0.0000025", completion: "0.00001" },
    architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
    supported_parameters: ["reasoning", "temperature", "top_p", "max_tokens"]
  }, {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    context_length: 1e6,
    pricing: { prompt: "0.00000125", completion: "0.00001" },
    architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
    supported_parameters: ["reasoning", "temperature", "top_p", "max_tokens"]
  }];
  store.modelMap = Object.fromEntries(store.models.map((model) => [model.id, model]));
  store.endpointMap = {};
  store.endpointErrors = {};
  store.favModels = [];
  store.totalCost = 0;
  store.settings = normalizeSettings({ theme: store.settings.theme, sidebarOpen: store.settings.sidebarOpen });
  const demoChat = {
    id: "nexus-demo-chat",
    title: "UI-Konzept verfeinern",
    model: demoModel.id,
    providerTag: null,
    providerName: "OpenRouter",
    createdAt: now - 18e5,
    updatedAt: now,
    fav: false,
    archived: false,
    tokens: 1284,
    cost: 18e-4,
    draft: "",
    messages: [
      {
        id: "demo-user",
        role: "user",
        ts: now - 19e3,
        content: "Erstelle eine responsive Navbar mit Logo links, Links in der Mitte und einem Theme-Toggle rechts. Nutze modernes CSS und liefere mir den vollständigen Code."
      },
      {
        id: "demo-assistant",
        role: "assistant",
        ts: now - 8e3,
        model: demoModel.id,
        providerName: "OpenRouter",
        duration: 8200,
        tokens: { prompt: 436, completion: 848 },
        cost: 18e-4,
        reasoning: "Ich strukturiere die Navigation semantisch, halte die mobile Variante ohne JavaScript zugänglich und kapsle Farben sowie Abstände in Design-Tokens.\n\nDanach prüfe ich Fokuszustände, Breakpoints und die Bedienung per Tastatur.",
        content: 'Hier ist eine schlanke, responsive Variante mit semantischem Markup und einem zugänglichen Theme-Schalter:\n\n```html\n<nav class="site-nav" aria-label="Hauptnavigation">\n  <a class="brand" href="/">Nexus</a>\n  <div class="nav-links">\n    <a href="#features">Features</a>\n    <a href="#docs">Docs</a>\n  </div>\n  <button class="theme-toggle" aria-label="Theme wechseln">◐</button>\n</nav>\n```\n\nDie Navigation bleibt bis 720 px dreispaltig und wechselt darunter in ein kompaktes Layout. Fokusrahmen sind bewusst sichtbar und die Farben folgen den vorhandenen Tokens.',
        sources: [
          { label: "MDN · Navigation", url: "https://developer.mozilla.org/docs/Web/HTML/Element/nav", description: "Referenz zum semantischen HTML-Element für Navigationsbereiche." },
          { label: "WebAIM · Keyboard", url: "https://webaim.org/techniques/keyboard/", description: "Grundlagen zur Tastaturbedienung und zur sichtbaren Fokusführung." }
        ],
        followups: [
          "Wie integriere ich ein mobiles Menü?",
          "Wie speichere ich das Theme dauerhaft?",
          "Kannst du die Navbar als Web Component bauen?"
        ]
      }
    ]
  };
  store.chats = [demoChat, {
    ...demoChat,
    id: "nexus-demo-models",
    title: "OpenRouter Modelle",
    updatedAt: now - 42e5,
    messages: []
  }, {
    ...demoChat,
    id: "nexus-demo-review",
    title: "Code Review",
    updatedAt: now - 74e5,
    messages: [
      { id: "review-prompt", role: "user", ts: now, content: "Ergänze den Zugriff auf die Navigation per Tastatur." },
      { id: "review-answer", role: "assistant", ts: now, model: demoModel.id, content: [
        "Hier sind zwei Änderungen für die Tastaturbedienung. Prüfe die Dateien einzeln.",
        "",
        "```diff",
        "--- a/src/navigation.html",
        "+++ b/src/navigation.html",
        "@@ -1,2 +1,3 @@",
        "+<a class=\"skip-link\" href=\"#main\">Zum Inhalt springen</a>",
        "-<nav>",
        "+<nav aria-label=\"Hauptnavigation\">",
        "   <a href=\"/\">Start</a>",
        "--- a/src/navigation.css",
        "+++ b/src/navigation.css",
        "@@ -1 +1,2 @@",
        " .navigation { display: flex; }",
        "+.navigation a:focus-visible { outline: 2px solid currentColor; }",
        "```"
      ].join("\n") }
    ]
  }];
  store.newChat(demoModel.id);
  uiState.attachedFiles = [];
  document.getElementById("app-main").classList.add("visible");
  renderAppShell();
  render();
}

// src/main.js
applyDocumentTheme(store.settings.theme);
var lastWidth = window.innerWidth;
var resizeRaf = null;
window.addEventListener("resize", () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    const w = window.innerWidth;
    const sb = document.getElementById("sidebar");
    const bd = document.getElementById("sidebar-backdrop");
    if (lastWidth <= 768 && w > 768) {
      if (bd) bd.classList.remove("visible");
      if (sb) {
        sb.classList.toggle("collapsed", !store.settings.sidebarOpen);
        syncSidebarAccessibility(store.settings.sidebarOpen);
      }
    }
    if (lastWidth > 768 && w <= 768) {
      if (sb) {
        sb.classList.add("collapsed");
        syncSidebarAccessibility(false);
      }
      if (bd) bd.classList.remove("visible");
    }
    lastWidth = w;
  });
}, { passive: true });
window.addEventListener("beforeunload", () => {
  const ta = document.getElementById("msg-input");
  const chat = store.getChat();
  if (ta && chat) {
    chat.draft = ta.value;
  }
  if (store._saveTimer) {
    clearTimeout(store._saveTimer);
    store._saveTimer = null;
  }
  if (store._saveIdle && typeof cancelIdleCallback === "function") {
    cancelIdleCallback(store._saveIdle);
    store._saveIdle = null;
  }
  store.save();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    const ta = document.getElementById("msg-input");
    const chat = store.getChat();
    if (ta && chat) chat.draft = ta.value;
    store.save();
  }
});
document.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier || !document.getElementById("app-main")?.classList.contains("visible")) return;
  if (document.querySelector("dialog[open], .modal-overlay, .feature-overlay")) return;
  if (event.key.toLowerCase() === "f") {
    const search = document.getElementById("chat-search");
    if (search) {
      event.preventDefault();
      if (document.getElementById("sidebar")?.classList.contains("collapsed")) toggleSidebar(true);
      requestAnimationFrame(() => search.focus());
    }
  }
  if (event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (uiState.modelsVisible) toggleModels(false);
    if (document.getElementById("settings-panel")?.classList.contains("visible")) toggleSettings(false);
    studioViews.open("command");
  }
});
export function startNexus(views) {
  studioViews = views;
  void openWorkspace();
}

export function insertPrompt(prompt) {
  const input = document.getElementById("msg-input");
  if (!input || store.isStreaming) return false;
  input.value = prompt;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  requestAnimationFrame(() => input.focus());
  return true;
}

export function studioAction(action) {
  if (action === "new") document.getElementById("btn-new-chat")?.click();
  if (action === "models") toggleModels(true);
  if (action === "settings") toggleSettings(true);
  if (action === "api") showOpenRouter();
  if (action === "search") {
    if (document.getElementById("sidebar")?.classList.contains("collapsed")) toggleSidebar(true);
    requestAnimationFrame(() => document.getElementById("chat-search")?.focus());
  }
}

export function commandChats() {
  return store.chats.filter((chat) => chat.messages.length || chat.draft?.trim()).map(({ id, title, archived }) => ({ id, title, archived: Boolean(archived) }));
}
export function openStudioChat(id) {
  if (store.isStreaming) { toast("Stoppe zuerst die laufende Antwort.", "info"); return false; }
  if (!store.chats.some((chat) => chat.id === id)) return false;
  store.activeChatId = id;
  uiState.attachedFiles = [];
  uiState.editingMsgId = null;
  render();
  if (isMobile()) toggleSidebar(false);
  return true;
}

export function openStudioPage(page) { studioViews.open(page); }
export function setStarterMode(mode) {
  if (store.isStreaming) { toast("Stoppe zuerst die laufende Antwort.", "info"); return; }
  if (mode === "web") store.settings.openrouter.webSearch = true;
  if (mode === "reasoning") {
    if (!modelSupportsReasoning(ensureChatModelAvailable(store.getChat()))) { toggleModels(true); toast("Wähle ein Modell mit Reasoning-Unterstützung.", "info"); return; }
    setReasoningMode("auto");
  }
  store.save(); renderInputArea(); focusInput();
}

export function comparisonModels() {
  const items = store.models.filter((model) => modelSupportsTextInput(model) && supportsOutput(model, "text"));
  return { models: items.map(({ id, name }) => ({ id, name: name || id })), selected: store.getChat()?.model, demo: store.demoMode, draft: document.getElementById("msg-input")?.value || "" };
}

export async function compareAnswer(model, prompt, signal, onProgress) {
  const entry = store.modelMap[model];
  if (!entry) throw new Error("Dieses Modell ist nicht verfügbar.");
  const started = performance.now();
  if (store.demoMode) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    signal.throwIfAborted();
    const examples = [
      "Ich würde zuerst ein konkretes Ziel festlegen, dann eine einfache Lösung testen und aus dem Ergebnis den nächsten Schritt ableiten.",
      "Mein Ansatz wäre ein kurzer Vergleich der Optionen. Dazu würde ich Nutzen, Aufwand und offene Fragen pro Option erfassen.",
      "Ich würde das Thema in eine kurze Zusammenfassung, zwei konkrete Handlungsschritte und eine Kontrollfrage gliedern."
    ];
    const content = "**Simulierte Antwort**\n\n" + examples[store.models.indexOf(entry) % examples.length];
    for (let n = 24; n < content.length; n += 24) {
      signal.throwIfAborted();
      onProgress?.({ model, content: content.slice(0, n), promptTokens: estimateTokens(prompt), completionTokens: estimateTokens(content.slice(0, n)), cost: 0, duration: performance.now() - started });
      await demoPause(signal, 50);
    }
    signal.throwIfAborted();
    return { model, content, promptTokens: estimateTokens(prompt), completionTokens: 36, cost: 0, duration: performance.now() - started };
  }
  if (!store.apiKey) throw new Error("Verbinde zuerst einen OpenRouter API-Key.");
  const body = { model, messages: [{ role: "user", content: prompt }], stream: Boolean(onProgress) };
  if (modelSupportsParam(entry, "max_completion_tokens")) body.max_completion_tokens = 2048;
  else if (modelSupportsParam(entry, "max_tokens")) body.max_tokens = 2048;
  let streamedContent = "", streamedUsage, annotations = [];
  const result = await requestOpenRouter("/chat/completions", { method: "POST", key: store.apiKey, signal, body, onEvent(payload) {
    if (payload?.usage) streamedUsage = payload.usage;
    const delta = payload?.choices?.[0]?.delta || payload?.choices?.[0]?.message;
    if (!delta) return;
    streamedContent += extractAssistantText(delta);
    if (delta.annotations) annotations.push(...delta.annotations);
    onProgress?.({ model, content: streamedContent, promptTokens: Number(streamedUsage?.prompt_tokens) || estimateTokens(prompt), completionTokens: Number(streamedUsage?.completion_tokens) || estimateTokens(streamedContent), cost: Number(streamedUsage?.cost) || 0, duration: performance.now() - started });
  } });
  const data = result.kind === "events" ? { usage: streamedUsage, choices: [{ message: { content: streamedContent, annotations } }] } : result.data;
  if (data?.error) throw new Error(apiErrorMessage(data, "OpenRouter-Anfrage fehlgeschlagen."));
  const usage = data?.usage || {};
  const promptTokens = Number(usage.prompt_tokens) || 0;
  const completionTokens = Number(usage.completion_tokens) || 0;
  const reportedCost = usage.cost == null ? NaN : Number(usage.cost);
  const cost = Number.isFinite(reportedCost) ? reportedCost : promptTokens * (Number(entry.pricing?.prompt) || 0) + completionTokens * (Number(entry.pricing?.completion) || 0);
  store.totalCost += cost;
  store.save();
  renderSidebar();
  const message = data?.choices?.[0]?.message || {};
  const content = extractAssistantText(message);
  if (!content.trim()) throw new Error("Das Modell hat keine Textantwort geliefert.");
  return { model, content, promptTokens, completionTokens, cost, duration: performance.now() - started, sources: citationSources(message.annotations) };
}

export function saveComparison(prompt, answer) {
  if (store.isStreaming) throw new Error("Stoppe zuerst die laufende Chat-Antwort.");
  const chat = store.newChat(answer.model);
  const ts = Date.now();
  chat.title = prompt.length > 48 ? prompt.slice(0, 48) + "…" : prompt;
  chat.messages = [
    { id: uuid(), role: "user", content: prompt, ts },
    { id: uuid(), role: "assistant", content: answer.content, model: answer.model, tokens: { prompt: answer.promptTokens, completion: answer.completionTokens }, duration: answer.duration, cost: answer.cost, sources: answer.sources, ts }
  ];
  chat.tokens = answer.promptTokens + answer.completionTokens;
  chat.cost = answer.cost;
  uiState.attachedFiles = [];
  uiState.editingMsgId = null;
  store.save();
  render();
}

export async function mergeChats(chats) {
  if (store.isStreaming) throw new Error("Stoppe zuerst die laufende Chat-Antwort.");
  const imported = normalizeChats(chats).map((chat) => ({
    ...chat,
    id: uuid(),
    messages: chat.messages.map((message) => ({ ...message, id: uuid() }))
  }));
  if (!imported.length) throw new Error("Die Datei enthält keine Chats.");
  if (!store.demoMode) {
    for (const chat of imported) for (const message of chat.messages) await persistMessageMedia(message);
    if (store.isStreaming) throw new Error("Stoppe zuerst die laufende Chat-Antwort.");
    const combined = [...imported, ...store.chats];
    localStorage.setItem("nx_chats", chatStorageJSON(combined));
  }
  store.chats = [...imported, ...store.chats];
  store.activeChatId = imported[0].id;
  uiState.attachedFiles = [];
  uiState.editingMsgId = null;
  render();
  return imported.length;
}

export function downloadChats() {
  const data = { version: 2, exportedAt: new Date().toISOString(), chats: exportableChats(store.chats) };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "nexus-chats.json");
}

export { copyText, hardenLinks, renderMd, parseReasoningSteps };

export function updateComparisonView(node, text, completed = false) {
  patchMarkdown(node, renderMd(text)); hardenLinks(node);
  if (completed) highlightCode(node);
}
