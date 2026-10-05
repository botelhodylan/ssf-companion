export interface PassiveNodeFact {
  readonly id: number;
  readonly name?: string;
  readonly kind?: "keystone" | "notable" | "mastery";
  readonly stats: readonly string[];
}

/** A small local index derived from a tree export selected by the player. */
export interface PassiveTreeDataset {
  readonly treeVersion: string;
  readonly sourceFile: string;
  readonly importedAt: string;
  readonly nodes: Readonly<Record<string, PassiveNodeFact>>;
}

const MAX_EXPORT_BYTES = 12_000_000;
const MAX_NODE_COUNT = 20_000;

/**
 * Read the public GGG skill-tree JSON selected by the player. The export does
 * not carry a tree patch version, so the caller must use a version confirmed
 * from one of their PoB specs. The raw file is never bundled by the app.
 */
export function parsePassiveTreeExport(
  content: string,
  treeVersion: string,
  sourceFile: string,
  relevantNodeIds?: readonly number[],
): PassiveTreeDataset {
  if (new TextEncoder().encode(content).byteLength > MAX_EXPORT_BYTES) {
    throw new Error("That passive tree export is too large to import safely.");
  }
  const normalizedVersion = treeVersion.trim();
  if (!/^\d{1,2}_\d{1,2}(?:_\d{1,2})?$/.test(normalizedVersion)) {
    throw new Error("Choose a PoB tree version such as 3_29 before importing tree data.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (!isRecord(parsed) || !isRecord(parsed.nodes)) {
    throw new Error("The selected JSON does not contain a passive-tree nodes object.");
  }

  const entries = Object.entries(parsed.nodes);
  if (entries.length === 0 || entries.length > MAX_NODE_COUNT) {
    throw new Error("The selected file has an unexpected number of passive-tree nodes.");
  }
  const relevantIds = relevantNodeIds ? new Set(relevantNodeIds) : undefined;
  const nodes: Record<string, PassiveNodeFact> = {};

  for (const [rawId, value] of entries) {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0 || !isRecord(value)) continue;
    if (relevantIds && !relevantIds.has(id)) continue;

    const name = boundedText(value.name, 180);
    const stats = Array.isArray(value.stats)
      ? value.stats
          .filter((stat): stat is string => typeof stat === "string")
          .map((stat) => stat.trim().slice(0, 240))
          .filter(Boolean)
          .slice(0, 16)
      : [];
    const kind = value.isKeystone === true
      ? "keystone"
      : value.isNotable === true
        ? "notable"
        : value.isMastery === true
          ? "mastery"
          : undefined;
    if (!name && stats.length === 0) continue;

    nodes[String(id)] = {
      id,
      ...(name ? { name } : {}),
      ...(kind ? { kind } : {}),
      stats,
    };
  }

  if (Object.keys(nodes).length === 0) {
    throw new Error(relevantIds
      ? "No selected build node IDs were found in that tree export. Check the tree version and try again."
      : "The selected tree export contains no named passive nodes.");
  }

  return {
    treeVersion: normalizedVersion,
    sourceFile: boundedFileName(sourceFile),
    importedAt: new Date().toISOString(),
    nodes,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || undefined;
}

function boundedFileName(value: string): string {
  const name = value.split(/[\\/]/).pop()?.trim().slice(0, 128);
  return name || "passive-tree.json";
}
