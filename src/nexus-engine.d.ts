import type { mountActivity, mountContext, mountComposer, mountDiffs, mountSources } from "./layro-bridge";
import type { Citation } from "./openrouter-sources";

export type StudioPage = "command" | "compare" | "prompts" | "transfer" | "connect";
export type StudioAction = "new" | "models" | "settings" | "api" | "search";
export type ModelOption = { id: string; name: string };
export type ComparisonAnswer = {
  model: string;
  content: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  duration: number;
  sources?: Citation[];
};

export function startNexus(views: {
  mountWelcome(target: HTMLElement, suggestions: HTMLElement): () => void;
  mountActivity: typeof mountActivity;
  mountContext: typeof mountContext;
  mountComposer: typeof mountComposer;
  mountDiffs: typeof mountDiffs;
  mountSources: typeof mountSources;
  open(page: StudioPage): void;
}): void;
export function connectNexus(key: string, remember: boolean, signal: AbortSignal): Promise<void>;
export function insertPrompt(prompt: string): boolean;
export function studioAction(action: StudioAction): void;
export function comparisonModels(): { models: ModelOption[]; selected?: string; demo: boolean; draft?: string };
export function compareAnswer(model: string, prompt: string, signal: AbortSignal): Promise<ComparisonAnswer>;
export function saveComparison(prompt: string, answer: ComparisonAnswer): void;
export function mergeChats(chats: object[]): Promise<number>;
export function downloadChats(): void;
export function copyText(text: string): Promise<boolean>;
export function hardenLinks(root: HTMLElement | null): void;
export function renderMd(text: string): string;

export function parseReasoningSteps(text: string): string[];

export function commandChats(): { id: string; title: string; archived: boolean }[];
export function openStudioChat(id: string): boolean;
