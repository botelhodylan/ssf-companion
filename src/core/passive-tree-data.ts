export interface PassiveNodeFact {
  readonly id: number;
  readonly name?: string;
  readonly kind?: "keystone" | "notable" | "mastery";
  readonly stats: readonly string[];
  /** Adjacent allocated-tree nodes from the player's selected GGG export. */
  readonly neighbors?: readonly number[];
}

/** A small local index derived from a tree export selected by the player. */
export interface PassiveTreeDataset {
  readonly treeVersion: string;
  readonly sourceFile: string;
  readonly importedAt: string;
  readonly nodes: Readonly<Record<string, PassiveNodeFact>>;
  /** Class names mapped to their start-node IDs in the selected export. */
  readonly classStartNodeIds?: Readonly<Record<string, number>>;
}

export interface PassiveAllocationOrder {
  readonly status: "complete" | "partial" | "unavailable";
  readonly nodeIds: readonly number[];
  readonly missingNodeIds: readonly number[];
  readonly note: string;
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
  const classNames = Array.isArray(parsed.classes) ? parsed.classes : [];
  const classStartNodeIds: Record<string, number> = {};
  for (const [rawId, value] of entries) {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0 || !isRecord(value)) continue;
    const classIndex = value.classStartIndex;
    if (typeof classIndex !== "number" || !Number.isSafeInteger(classIndex) || classIndex < 0) continue;
    const className = boundedText(classNames[classIndex] && isRecord(classNames[classIndex])
      ? classNames[classIndex].name
      : undefined, 80);
    if (className) classStartNodeIds[className] = id;
  }
  if (relevantIds && !entries.some(([rawId, value]) => relevantIds.has(Number(rawId)) && isRecord(value))) {
    throw new Error("No selected build node IDs were found in that tree export. Check the tree version and try again.");
  }
  const wantedIds = relevantIds
    ? new Set([...relevantIds, ...Object.values(classStartNodeIds)])
    : new Set(entries.map(([rawId]) => Number(rawId)).filter((id) => Number.isSafeInteger(id) && id > 0));
  const neighbors = new Map<number, Set<number>>();
  for (const id of wantedIds) neighbors.set(id, new Set<number>());
  for (const [rawId, value] of entries) {
    const id = Number(rawId);
    if (!wantedIds.has(id) || !isRecord(value)) continue;
    const linkedIds = [...readNodeLinks(value.in), ...readNodeLinks(value.out)];
    for (const linkedId of linkedIds) {
      if (!wantedIds.has(linkedId) || linkedId === id) continue;
      neighbors.get(id)?.add(linkedId);
      neighbors.get(linkedId)?.add(id);
    }
  }
  const nodes: Record<string, PassiveNodeFact> = {};

  for (const [rawId, value] of entries) {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0 || !isRecord(value)) continue;
    if (!wantedIds.has(id)) continue;

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
    const nodeNeighbors = [...(neighbors.get(id) ?? [])].sort((left, right) => left - right);

    nodes[String(id)] = {
      id,
      ...(name ? { name } : {}),
      ...(kind ? { kind } : {}),
      stats,
      ...(nodeNeighbors.length ? { neighbors: nodeNeighbors } : {}),
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
    classStartNodeIds,
  };
}

/**
 * Produces a stable breadth-first traversal of the target's allocated-node
 * graph. It is an ordering aid, not a PoB-authored or optimized leveling plan.
 */
export function orderPassiveTreeAllocations(input: {
  readonly dataset: PassiveTreeDataset;
  readonly treeVersion: string;
  readonly targetNodeIds: readonly number[];
  readonly className?: string;
  /** Same-version nodes already allocated on the current spec, when known. */
  readonly retainedNodeIds?: readonly number[];
}): PassiveAllocationOrder {
  const targetNodeIds = normalizeNodeIds(input.targetNodeIds);
  const targetSet = new Set(targetNodeIds);
  if (!targetNodeIds.length) {
    return unavailableOrder("The saved PoB spec has no valid allocated-node IDs to order.");
  }
  if (input.dataset.treeVersion !== input.treeVersion) {
    return unavailableOrder(`Import the local tree export for ${input.treeVersion} to order this PoB spec.`);
  }

  const retainedNodeIds = normalizeNodeIds(input.retainedNodeIds ?? []).filter((id) => targetSet.has(id));
  const classStartId = input.className ? input.dataset.classStartNodeIds?.[input.className] : undefined;
  const roots = retainedNodeIds.length
    ? retainedNodeIds
    : classStartId !== undefined
      ? [classStartId]
      : [];
  if (!roots.length) {
    return unavailableOrder(input.className
      ? `No shared target nodes or ${input.className} start node were found. Reimport the matching local tree export.`
      : "The PoB class is missing, so the target tree cannot be connected to a class start node.");
  }

  const visited = new Set<number>(roots);
  const queue = [...roots];
  const nodeIds: number[] = [];
  for (const root of roots) {
    if (targetSet.has(root) && !retainedNodeIds.includes(root)) nodeIds.push(root);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const currentId = queue[cursor];
    const node = input.dataset.nodes[String(currentId)];
    const adjacent = [...(node?.neighbors ?? [])].sort((left, right) => left - right);
    for (const neighborId of adjacent) {
      if (!targetSet.has(neighborId) || visited.has(neighborId)) continue;
      visited.add(neighborId);
      queue.push(neighborId);
      if (!retainedNodeIds.includes(neighborId)) nodeIds.push(neighborId);
    }
  }

  const missingNodeIds = targetNodeIds.filter((id) => !visited.has(id));
  if (missingNodeIds.length === 0) {
    const startDescription = retainedNodeIds.length ? "the nodes shared with the current spec" : "the class start node";
    return {
      status: "complete",
      nodeIds,
      missingNodeIds: [],
      note: `Complete breadth-first traversal from ${startDescription}. This follows links in the selected local tree export; it is not a PoB-authored or performance-optimized leveling order and does not estimate refund cost.`,
    };
  }

  if (!nodeIds.length) {
    return {
      status: "unavailable",
      nodeIds: [],
      missingNodeIds,
      note: `No target nodes could be connected with the imported tree links. Reimport the matching export; disconnected or missing IDs: ${missingNodeIds.slice(0, 12).join(", ")}${missingNodeIds.length > 12 ? ", …" : ""}.`,
    };
  }
  return {
    status: "partial",
    nodeIds,
    missingNodeIds,
    note: `Only ${nodeIds.length} of ${targetNodeIds.length} target nodes could be ordered from the imported tree links. Missing or disconnected IDs: ${missingNodeIds.slice(0, 12).join(", ")}${missingNodeIds.length > 12 ? ", …" : ""}. The list is incomplete and is not a full leveling order.`,
  };
}

function readNodeLinks(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 128).flatMap((link) => {
    const id = typeof link === "number" ? link : typeof link === "string" && /^\d{1,10}$/.test(link) ? Number(link) : NaN;
    return Number.isSafeInteger(id) && id > 0 ? [id] : [];
  });
}

function normalizeNodeIds(nodeIds: readonly number[]): number[] {
  return [...new Set(nodeIds.filter((id) => Number.isSafeInteger(id) && id > 0))]
    .sort((left, right) => left - right);
}

function unavailableOrder(note: string): PassiveAllocationOrder {
  return { status: "unavailable", nodeIds: [], missingNodeIds: [], note };
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
