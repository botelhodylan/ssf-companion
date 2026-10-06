import { poe1Provider } from "./game-provider";
import type { RouteStashItem, RouteStashSnapshot } from "./progression-route";

export const LOCAL_STASH_SNAPSHOT_FORMAT = "ssf-companion-stash-snapshot" as const;
export const MAX_LOCAL_STASH_SNAPSHOT_BYTES = 1_500_000;
const MAX_STASH_ITEM_TYPES = 10_000;
const MAX_ITEM_QUANTITY = 1_000_000;
const MAX_TOTAL_QUANTITY = 20_000_000;

export type StashCoverage = "complete" | "partial";

export interface ParsedLocalStashSnapshot {
  readonly format: typeof LOCAL_STASH_SNAPSHOT_FORMAT;
  readonly schemaVersion: 1;
  readonly game: "poe1";
  readonly leagueName: string;
  readonly coverage: StashCoverage;
  readonly items: readonly RouteStashItem[];
}

export interface StashItemIdentity {
  readonly names?: readonly string[];
  readonly baseTypes?: readonly string[];
  readonly tags?: readonly string[];
}

/**
 * Parses a deliberately small, player-authored JSON format. It does not fetch
 * GGG data or accept tokens/API-shaped responses.
 */
export function parseLocalStashSnapshot(
  source: string,
  expectedLeagueName: string,
): ParsedLocalStashSnapshot {
  if (new TextEncoder().encode(source).byteLength > MAX_LOCAL_STASH_SNAPSHOT_BYTES) {
    throw new Error("That stash snapshot exceeds the 1.5 MB import limit.");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("The stash snapshot is not valid JSON.");
  }
  if (!isRecord(value)) throw new Error("The stash snapshot must be a JSON object.");
  if (value.format !== LOCAL_STASH_SNAPSHOT_FORMAT || value.schemaVersion !== 1 || value.game !== "poe1") {
    throw new Error("Use a supported SSF Companion PoE 1 stash snapshot (format and schema version 1).");
  }
  const leagueName = boundedText(value.leagueName, "leagueName", 80);
  if (!expectedLeagueName.trim() || poe1Provider.normalizeItemIdentity(leagueName) !== poe1Provider.normalizeItemIdentity(expectedLeagueName)) {
    throw new Error("This stash snapshot is for a different league. Select its matching league before importing.");
  }
  if (value.coverage !== "complete" && value.coverage !== "partial") {
    throw new Error('coverage must be either "complete" or "partial".');
  }
  if (!Array.isArray(value.items) || value.items.length > MAX_STASH_ITEM_TYPES) {
    throw new Error("items must be a list with at most 10,000 item types.");
  }

  const itemsByIdentity = new Map<string, { name: string; baseType?: string; tags: Set<string>; quantity: number }>();
  let totalQuantity = 0;
  for (const [index, rawItem] of value.items.entries()) {
    if (!isRecord(rawItem)) throw new Error("items[" + index + "] must be an object.");
    const name = boundedText(rawItem.name, "items[" + index + "].name", 200);
    const baseType = rawItem.baseType === undefined
      ? undefined
      : boundedText(rawItem.baseType, "items[" + index + "].baseType", 200);
    if (!Number.isSafeInteger(rawItem.quantity) || Number(rawItem.quantity) < 1 || Number(rawItem.quantity) > MAX_ITEM_QUANTITY) {
      throw new Error("items[" + index + "].quantity must be an integer from 1 to 1,000,000.");
    }
    if (rawItem.tags !== undefined && (!Array.isArray(rawItem.tags) || rawItem.tags.length > 20)) {
      throw new Error("items[" + index + "].tags must contain at most 20 labels.");
    }
    const tags = (rawItem.tags as unknown[] | undefined)?.map((tag, tagIndex) =>
      boundedText(tag, "items[" + index + "].tags[" + tagIndex + "]", 80),
    ) ?? [];
    const identity = poe1Provider.normalizeItemIdentity(name) + "\u0000" + poe1Provider.normalizeItemIdentity(baseType ?? "");
    const existing = itemsByIdentity.get(identity);
    const quantity = Number(rawItem.quantity);
    totalQuantity += quantity;
    if (totalQuantity > MAX_TOTAL_QUANTITY) throw new Error("The snapshot's total item quantity exceeds 20,000,000.");
    if (existing) {
      existing.quantity += quantity;
      for (const tag of tags) existing.tags.add(tag);
    } else {
      itemsByIdentity.set(identity, { name, ...(baseType ? { baseType } : {}), tags: new Set(tags), quantity });
    }
  }

  const items: RouteStashItem[] = [...itemsByIdentity.values()]
    .map((item) => ({
      name: item.name,
      ...(item.baseType ? { baseType: item.baseType } : {}),
      ...(item.tags.size ? { tags: [...item.tags].sort((left, right) => left.localeCompare(right)) } : {}),
      quantity: item.quantity,
    }))
    .sort((left, right) =>
      poe1Provider.normalizeItemIdentity(left.name).localeCompare(poe1Provider.normalizeItemIdentity(right.name)),
    );

  return {
    format: LOCAL_STASH_SNAPSHOT_FORMAT,
    schemaVersion: 1,
    game: "poe1",
    leagueName,
    coverage: value.coverage,
    items,
  };
}

/**
 * Returns the supplied quantity for an exact name/base/tag match. An absent
 * item in a partial snapshot is unknown; only a complete snapshot can establish
 * zero.
 */
export function countStashMatches(
  snapshot: Pick<RouteStashSnapshot, "items" | "coverage">,
  identity: StashItemIdentity,
): number | undefined {
  const names = new Set((identity.names ?? []).map(poe1Provider.normalizeItemIdentity).filter(Boolean));
  const baseTypes = new Set((identity.baseTypes ?? []).map(poe1Provider.normalizeItemIdentity).filter(Boolean));
  const tags = new Set((identity.tags ?? []).map(poe1Provider.normalizeItemIdentity).filter(Boolean));
  let count = 0;
  let found = false;
  for (const item of snapshot.items) {
    const name = poe1Provider.normalizeItemIdentity(item.name);
    const baseType = poe1Provider.normalizeItemIdentity(item.baseType ?? "");
    const itemTags = (item.tags ?? []).map(poe1Provider.normalizeItemIdentity);
    const matches =
      names.has(name) || names.has(baseType) ||
      baseTypes.has(baseType) || baseTypes.has(name) ||
      itemTags.some((tag) => tags.has(tag));
    if (!matches) continue;
    found = true;
    count += Math.max(0, Math.floor(item.quantity));
  }
  if (!found && snapshot.coverage === "partial") return undefined;
  return count;
}

export function createStashSnapshotTemplate(leagueName: string): string {
  return JSON.stringify({
    format: LOCAL_STASH_SNAPSHOT_FORMAT,
    schemaVersion: 1,
    game: "poe1",
    leagueName: leagueName.trim(),
    coverage: "partial",
    items: [],
  }, null, 2);
}

function boundedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(field + " must be text.");
  const text = value.trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new Error(field + " must be non-empty text up to " + maxLength + " characters.");
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
