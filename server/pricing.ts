import fs from "node:fs";
import path from "node:path";
import * as paths from "./paths";

/**
 * Pricing module
 * --------------
 * - `syncPricing()` fetches the latest model list from OpenRouter
 *   (free, public, comprehensive) and caches to disk.
 * - `loadSyncedPricing()` returns the cached model->price map.
 * - `resolvePrice(provider, model)` normalizes names (grok-4.5 vs grok4.5
 *   vs x-ai/grok-4.5 vs anthropic/claude-opus-4-8) and returns a hit.
 *
 * Storage: <agentHome>/pi-switch/pricing.json
 * Per-token prices in USD (matching OpenRouter).
 */

export interface SyncedModel {
  /** Source id e.g. "x-ai/grok-4.5" */
  id: string;
  /** Provider slug e.g. "x-ai", "anthropic" */
  provider: string;
  /** Bare model name e.g. "grok-4.5" */
  model: string;
  /** Canonical slug (latest stable alias) */
  canonicalSlug: string;
  name: string;
  contextLength: number | null;
  /** Per-token USD (matches OpenRouter). null = not priced / free. */
  inputPerToken: number | null;
  outputPerToken: number | null;
  cacheReadPerToken: number | null;
  cacheWritePerToken: number | null;
  requestPerCall: number | null;
  imagePerToken: number | null;
  webSearchPerCall: number | null;
  internalReasoningPerToken: number | null;
  /** Convenience: $ per 1k tokens */
  inputPer1k: number | null;
  outputPer1k: number | null;
  cacheReadPer1k: number | null;
  cacheWritePer1k: number | null;
  updatedAt: string;
  raw: unknown;
}

export interface PricingIndex {
  fetchedAt: string;
  source: string;
  count: number;
  models: SyncedModel[];
}

export interface ResolvedPrice {
  model: SyncedModel;
  matchedAs: string;
  matchScore: number;
}

const SOURCE_URL = "https://openrouter.ai/api/v1/models";
const CACHE_FILE = "pricing.json";
const SYNC_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/* -------------------- name normalization -------------------- */

const SEP_RE = /[\s._]+/g;
const DASH_RE = /-+/g;

/**
 * Canonical form: lowercase, collapse separators, strip date/build suffixes.
 * "Grok 4.5"        -> "grok-4.5"
 * "grok4.5"         -> "grok-4.5"
 * "grok-4-5"        -> "grok-4-5"  (kept; "4-5" is a different version)
 * "claude-opus-4-8" -> "claude-opus-4-8"
 * "claude.opus.4.8" -> "claude-opus-4-8"
 */
export function normalizeModelId(raw: string): string {
  if (!raw) return "";
  let s = String(raw).toLowerCase().trim();
  // strip provider prefix "opencode-go/" or "openai/gpt-4o"
  s = s.replace(/^[a-z0-9-]+[/\\]/, "");
  // strip "@cf/" worker ai prefix
  s = s.replace(/^@cf\//, "");
  // strip surrounding braces / brackets
  s = s.replace(/[<>()[\]{}]/g, "");
  // collapse separators
  s = s.replace(SEP_RE, "-");
  s = s.replace(DASH_RE, "-");
  // strip trailing "-preview", "-2025-01-01" style date suffix
  s = s.replace(/-(preview|exp|beta|alpha|latest|free)$/g, "");
  s = s.replace(/-\d{4}-\d{2}-\d{2}$/g, "");
  s = s.replace(/-\d{8}$/g, "");
  return s;
}

/** Canonicalize "4-8" -> "4.8" if the upstream convention is dotted */
export function dottedVersionVariants(s: string): string[] {
  const variants = new Set<string>();
  variants.add(s);
  // 4-8 -> 4.8, 4-5 -> 4.5
  const replaced = s.replace(/(\d+)-(\d+)/g, "$1.$2");
  variants.add(replaced);
  // 4.8 -> 4-8
  const back = replaced.replace(/(\d+)\.(\d+)/g, "$1-$2");
  variants.add(back);
  return Array.from(variants);
}

/** Aliases for messy model names that don't roundtrip cleanly */
const MODEL_ALIASES: Record<string, string[]> = {
  "grok-4-5": ["grok-4.5", "grok-4-5", "grok4.5", "grok4-5", "grok-4_5", "grok_4.5"],
  "claude-opus-4-8": ["claude-opus-4.8", "claude-opus-4-8", "opus-4-8", "opus-4.8"],
  "claude-sonnet-4-5": ["claude-sonnet-4.5", "sonnet-4-5", "sonnet-4.5"],
  "gpt-5": ["gpt-5", "gpt5", "gpt-5.0"],
  "gpt-5-mini": ["gpt-5-mini", "gpt5-mini"],
  "gpt-4-1": ["gpt-4.1", "gpt4.1", "gpt-4-1"],
  "gemini-2-5-pro": ["gemini-2.5-pro", "gemini-2-5-pro"],
  "gemini-2-5-flash": ["gemini-2.5-flash", "gemini-2-5-flash"],
  "minimax-m3": ["minimax-m3", "minimax-m-3", "minimax_m3", "minimax/m3"],
};

/** Levenshtein distance (small strings) */
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

/* -------------------- index -------------------- */

let cachedIndex: PricingIndex | null = null;
let indexLoadedAt = 0;

function pricingFile(): string {
  return path.join(paths.piAgentHome(), "pi-switch", CACHE_FILE);
}

export function loadSyncedPricing(force = false): PricingIndex | null {
  const now = Date.now();
  if (!force && cachedIndex && now - indexLoadedAt < 30_000) {
    return cachedIndex;
  }
  indexLoadedAt = now;
  const file = pricingFile();
  if (!fs.existsSync(file)) {
    cachedIndex = null;
    return null;
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as PricingIndex;
    if (!parsed || !Array.isArray(parsed.models)) {
      cachedIndex = null;
      return null;
    }
    cachedIndex = parsed;
    return parsed;
  } catch {
    cachedIndex = null;
    return null;
  }
}

export function pricingFreshness(): {
  loaded: boolean;
  fetchedAt?: string;
  count?: number;
  ageMs?: number;
  source?: string;
} {
  const idx = loadSyncedPricing();
  if (!idx) return { loaded: false };
  return {
    loaded: true,
    fetchedAt: idx.fetchedAt,
    count: idx.count,
    ageMs: Date.now() - Date.parse(idx.fetchedAt),
    source: idx.source,
  };
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseSyncedModel(raw: any): SyncedModel | null {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? "");
  if (!id) return null;
  const slash = id.indexOf("/");
  if (slash < 0) return null;
  const provider = id.slice(0, slash);
  const model = id.slice(slash + 1);
  const canonical =
    String(raw.canonical_slug ?? "").replace(/^.*?\//, "") || model;
  const p = (raw.pricing ?? {}) as Record<string, unknown>;
  const inputPerToken = toNumber(p.prompt);
  const outputPerToken = toNumber(p.completion);
  const cacheReadPerToken = toNumber(p.input_cache_read);
  const cacheWritePerToken = toNumber(p.input_cache_write);
  const requestPerCall = toNumber(p.request);
  const imagePerToken = toNumber(p.image);
  const webSearchPerCall = toNumber(p.web_search);
  const internalReasoningPerToken = toNumber(p.internal_reasoning);
  return {
    id,
    provider,
    model,
    canonicalSlug: canonical,
    name: String(raw.name ?? id),
    contextLength:
      typeof raw.context_length === "number" ? raw.context_length : null,
    inputPerToken,
    outputPerToken,
    cacheReadPerToken,
    cacheWritePerToken,
    requestPerCall,
    imagePerToken,
    webSearchPerCall,
    internalReasoningPerToken,
    inputPer1k: inputPerToken != null ? inputPerToken * 1000 : null,
    outputPer1k: outputPerToken != null ? outputPerToken * 1000 : null,
    cacheReadPer1k: cacheReadPerToken != null ? cacheReadPerToken * 1000 : null,
    cacheWritePer1k:
      cacheWritePerToken != null ? cacheWritePerToken * 1000 : null,
    updatedAt: new Date().toISOString(),
    raw,
  };
}

export async function syncPricing(
  options: { force?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<PricingIndex> {
  const existing = loadSyncedPricing(true);
  if (!options.force && existing) {
    const age = Date.now() - Date.parse(existing.fetchedAt);
    if (Number.isFinite(age) && age < SYNC_TTL_MS) {
      return existing;
    }
  }
  const f = options.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res: Response;
  try {
    res = await f(SOURCE_URL, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`pricing fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as any;
  const list: any[] = Array.isArray(body?.data) ? body.data : [];
  const models: SyncedModel[] = [];
  for (const r of list) {
    const m = parseSyncedModel(r);
    if (m) models.push(m);
  }
  const index: PricingIndex = {
    fetchedAt: new Date().toISOString(),
    source: SOURCE_URL,
    count: models.length,
    models,
  };
  const file = pricingFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(index), "utf8");
  cachedIndex = index;
  return index;
}

/* -------------------- resolver -------------------- */

interface ModelHit {
  model: SyncedModel;
  matchedAs: string;
  score: number;
  matchScore: number;
}

/**
 * Resolve a (provider, model) to a synced price entry, trying many
 * name variants: exact, normalized, dotted/dashed versions, aliases,
 * and a fuzzy fallback.
 */
export function resolvePrice(
  provider: string,
  model: string,
  index?: PricingIndex,
): ResolvedPrice | null {
  const idx = index ?? loadSyncedPricing();
  if (!idx) return null;

  const candidates: { name: string; matchedAs: string; score: number }[] = [];
  const push = (name: string, matchedAs: string, score: number) => {
    if (!name) return;
    candidates.push({ name, matchedAs, score });
  };

  // 1) exact match (case-insensitive, trimmed)
  push(
    `${provider}/${model}`.toLowerCase(),
    "exact",
    1000,
  );
  push(model.toLowerCase(), "model-exact", 950);

  // 2) normalized
  const nm = normalizeModelId(model);
  push(nm, "normalized", 900);
  push(
    `${normalizeModelId(provider)}/${nm}`,
    "provider+normalized",
    880,
  );

  // 3) dotted / dashed variants of normalized
  for (const v of dottedVersionVariants(nm)) {
    push(v, `variant:${v}`, 860);
  }

  // 4) bare versions inside the original (strip family prefix)
  // e.g. "anthropic/claude-opus-4-8" with provider "relay-k40" should still match
  // by model name only
  if (nm.includes("-")) {
    const parts = nm.split("-");
    for (let i = 1; i < parts.length; i++) {
      const tail = parts.slice(i).join("-");
      if (tail.length >= 3) push(tail, `tail-${i}`, 700 - i * 10);
    }
  }

  // 5) aliases
  for (const [canon, aliases] of Object.entries(MODEL_ALIASES)) {
    if (aliases.some((a) => a === nm) || nm === canon) {
      push(canon, "alias", 850);
    }
  }

  // Build quick lookup: model-id canonical slug alias
  const lookup = new Map<string, SyncedModel>();
  for (const m of idx.models) {
    lookup.set(m.id.toLowerCase(), m);
    lookup.set(m.model.toLowerCase(), m);
    lookup.set(m.canonicalSlug.toLowerCase(), m);
    lookup.set(normalizeModelId(m.model), m);
  }

  // Try candidates
  let best: ModelHit | null = null;
  for (const c of candidates) {
    const hit = lookup.get(c.name);
    if (hit) {
      if (!best || c.score > best.score) {
        best = { model: hit, matchedAs: c.matchedAs, score: c.score, matchScore: c.score };
      }
    }
  }
  if (best) return best;

  // 6) Fuzzy fallback: only for non-trivial matches (Lev <= 2 on canonicals)
  const target = nm;
  for (const m of idx.models) {
    const cand = normalizeModelId(m.model);
    const d = lev(target, cand);
    if (d <= 2 && Math.abs(cand.length - target.length) <= 2) {
      const score = 500 - d * 100;
      if (!best || score > best.score) {
        best = { model: m, matchedAs: `fuzzy:${d}`, score, matchScore: score };
      }
    }
  }
  return best;
}

export function resolveMany(
  pairs: { provider: string; model: string }[],
  index?: PricingIndex,
): (ResolvedPrice | null)[] {
  const idx = index ?? loadSyncedPricing();
  return pairs.map((p) => resolvePrice(p.provider, p.model, idx ?? undefined));
}

/* -------------------- pre-existing local pricing merge -------------------- */

/**
 * Merge locally discovered pricing (from models.json) with the synced
 * index. Local pricing wins for matches (user has explicit config).
 */
export function mergePricing(
  local: Array<{
    provider: string;
    model: string;
    inputPer1k?: number | null;
    outputPer1k?: number | null;
    cacheReadPer1k?: number | null;
    cacheWritePer1k?: number | null;
    source?: string;
  }>,
  index?: PricingIndex,
): Array<{
  provider: string;
  model: string;
  inputPer1k: number | null;
  outputPer1k: number | null;
  cacheReadPer1k: number | null;
  cacheWritePer1k: number | null;
  source: "models.json" | "synced" | "unknown";
  matchedAs?: string;
}> {
  const idx = index ?? loadSyncedPricing();
  const out: ReturnType<typeof mergePricing> = [];
  for (const row of local) {
    const localKnown =
      row.inputPer1k != null ||
      row.outputPer1k != null ||
      row.cacheReadPer1k != null ||
      row.cacheWritePer1k != null;
    if (localKnown) {
      out.push({
        provider: row.provider,
        model: row.model,
        inputPer1k: row.inputPer1k ?? null,
        outputPer1k: row.outputPer1k ?? null,
        cacheReadPer1k: row.cacheReadPer1k ?? null,
        cacheWritePer1k: row.cacheWritePer1k ?? null,
        source: (row.source as any) ?? "models.json",
      });
      continue;
    }
    const hit = resolvePrice(row.provider, row.model, idx ?? undefined);
    if (hit) {
      out.push({
        provider: row.provider,
        model: row.model,
        inputPer1k: hit.model.inputPer1k,
        outputPer1k: hit.model.outputPer1k,
        cacheReadPer1k: hit.model.cacheReadPer1k,
        cacheWritePer1k: hit.model.cacheWritePer1k,
        source: "synced",
        matchedAs: `${hit.matchedAs} → ${hit.model.id}`,
      });
    } else {
      out.push({
        provider: row.provider,
        model: row.model,
        inputPer1k: null,
        outputPer1k: null,
        cacheReadPer1k: null,
        cacheWritePer1k: null,
        source: "unknown",
      });
    }
  }
  return out;
}
