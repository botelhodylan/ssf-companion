import { poe1Provider } from "./game-provider";
import { parseAtlasTreeShareUrl } from "./atlas-tree-import";
import type { ItemGoal, ProgressionStage } from "./types";

export interface Poe1RoutePackSource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly checkedOn?: string;
}

export interface Poe1AcquisitionRoute {
  readonly id: string;
  readonly match: {
    readonly itemNames?: readonly string[];
    readonly baseTypes?: readonly string[];
  };
  readonly stage: ProgressionStage;
  readonly method: "campaign" | "vendor" | "drop" | "divination_card" | "league_mechanic" | "boss" | "atlas";
  readonly title: string;
  readonly steps: readonly string[];
  readonly atlasTreeName?: string;
  readonly atlasNodeNames?: readonly string[];
  readonly atlasShareUrl?: string;
  readonly sourceIds: readonly string[];
}

export interface Poe1CraftPlan {
  readonly id: string;
  readonly match: {
    readonly itemNames?: readonly string[];
    readonly baseTypes?: readonly string[];
  };
  readonly stage: ProgressionStage;
  readonly title: string;
  readonly baseType: string;
  readonly requiredItemLevel?: number;
  readonly prerequisites: readonly string[];
  readonly materials: readonly { readonly name: string; readonly quantity: number }[];
  readonly steps: readonly string[];
  readonly stopCondition: string;
  readonly sourceIds: readonly string[];
}

/** Player-selected, patch-versioned local knowledge; no pack is bundled by default. */
export interface Poe1RouteKnowledgePack {
  readonly schemaVersion: 1;
  readonly game: "poe1";
  readonly id: string;
  readonly name: string;
  readonly contentVersion: string;
  readonly sources: readonly Poe1RoutePackSource[];
  readonly acquisitionRoutes: readonly Poe1AcquisitionRoute[];
  readonly craftPlans: readonly Poe1CraftPlan[];
}

export interface Poe1RouteKnowledgePlan {
  readonly heading: string;
  readonly stage: ProgressionStage;
  readonly baseType?: string;
  readonly requiredItemLevel?: number;
  readonly prerequisites?: readonly string[];
  readonly materials?: readonly {
    readonly name: string;
    readonly quantity: number;
    readonly ownedQuantity?: number;
  }[];
  readonly steps: readonly string[];
  readonly atlasTreeName?: string;
  readonly atlasNodeNames?: readonly string[];
  readonly atlasShareUrl?: string;
  readonly stopCondition?: string;
}

const VALID_STAGES = new Set<ProgressionStage>(["campaign", "early_mapping", "atlas", "endgame"]);
const MAX_PACK_BYTES = 1_500_000;
const MAX_SOURCES = 100;
const MAX_RECORDS = 500;
const MAX_STEPS = 30;
const MAX_TEXT = 4_000;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as UnknownRecord;
}

function boundedText(value: unknown, label: string, max = MAX_TEXT): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) {
    throw new Error(`${label} must be non-empty text of at most ${max} characters.`);
  }
  return value.trim();
}

function textList(value: unknown, label: string, maximum = MAX_STEPS): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} must be a list with at most ${maximum} entries.`);
  const values = value.map((entry, index) => boundedText(entry, `${label}[${index}]`));
  if (new Set(values.map((entry) => poe1Provider.normalizeItemIdentity(entry))).size !== values.length) {
    throw new Error(`${label} must not contain duplicate entries.`);
  }
  return values;
}

function uniqueIds(value: unknown, label: string, maximum: number): readonly string[] {
  const ids = textList(value, label, maximum);
  if (ids.some((id) => !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id))) throw new Error(`${label} contains an invalid ID.`);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} must not contain duplicate IDs.`);
  return ids;
}

function exactMatch(value: unknown, label: string): Poe1AcquisitionRoute["match"] {
  const match = record(value, label);
  const itemNames = match.itemNames === undefined ? [] : textList(match.itemNames, `${label}.itemNames`, 40);
  const baseTypes = match.baseTypes === undefined ? [] : textList(match.baseTypes, `${label}.baseTypes`, 40);
  if (itemNames.length + baseTypes.length === 0) throw new Error(`${label} needs at least one exact item name or base type.`);
  return {
    ...(itemNames.length ? { itemNames } : {}),
    ...(baseTypes.length ? { baseTypes } : {}),
  };
}

function stage(value: unknown, label: string): ProgressionStage {
  if (typeof value !== "string" || !VALID_STAGES.has(value as ProgressionStage)) {
    throw new Error(`${label} must be campaign, early_mapping, atlas, or endgame.`);
  }
  return value as ProgressionStage;
}

function sourceIds(value: unknown, label: string, knownSources: ReadonlySet<string>): readonly string[] {
  const ids = uniqueIds(value, label, MAX_SOURCES);
  if (!ids.length) throw new Error(`${label} must reference at least one source.`);
  if (ids.some((id) => !knownSources.has(id))) throw new Error(`${label} references a source that is not declared in sources.`);
  return ids;
}

function httpsUrl(value: unknown, label: string): string {
  const text = boundedText(value, label, 2_000);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`${label} must be a valid HTTPS URL without embedded credentials.`);
  return url.toString();
}

export function parsePoe1RouteKnowledgePack(raw: string): Poe1RouteKnowledgePack {
  if (new TextEncoder().encode(raw).byteLength > MAX_PACK_BYTES) throw new Error("Route knowledge pack exceeds the 1.5 MB import limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Route knowledge pack must be valid JSON.");
  }
  const input = record(parsed, "Route knowledge pack");
  if (input.schemaVersion !== 1 || input.game !== "poe1") throw new Error("Unsupported route knowledge pack schema or game.");
  const id = boundedText(input.id, "id", 80);
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id)) throw new Error("id must use letters, numbers, dot, underscore, or hyphen.");
  const name = boundedText(input.name, "name", 160);
  const contentVersion = boundedText(input.contentVersion, "contentVersion", 40);
  if (!/^\d+\.\d+(?:\.\d+)?(?:[-+][a-z0-9.-]+)?$/i.test(contentVersion)) {
    throw new Error("contentVersion must identify a PoE patch, such as 3.28 or 3.28.1.");
  }

  if (!Array.isArray(input.sources) || input.sources.length === 0 || input.sources.length > MAX_SOURCES) {
    throw new Error(`sources must contain between 1 and ${MAX_SOURCES} entries.`);
  }
  const sources: Poe1RoutePackSource[] = input.sources.map((entry, index) => {
    const source = record(entry, `sources[${index}]`);
    const sourceId = boundedText(source.id, `sources[${index}].id`, 80);
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(sourceId)) throw new Error(`sources[${index}].id is invalid.`);
    const checkedOn = source.checkedOn === undefined ? undefined : boundedText(source.checkedOn, `sources[${index}].checkedOn`, 10);
    if (checkedOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(checkedOn)) throw new Error(`sources[${index}].checkedOn must use YYYY-MM-DD.`);
    return {
      id: sourceId,
      title: boundedText(source.title, `sources[${index}].title`, 200),
      url: httpsUrl(source.url, `sources[${index}].url`),
      ...(checkedOn ? { checkedOn } : {}),
    };
  });
  const sourceIds = new Set(sources.map((source) => source.id));
  if (sourceIds.size !== sources.length) throw new Error("sources contains duplicate IDs.");

  const acquisitionRoutes = parseAcquisitionRoutes(input.acquisitionRoutes, sourceIds);
  const craftPlans = parseCraftPlans(input.craftPlans, sourceIds);
  return { schemaVersion: 1, game: "poe1", id, name, contentVersion, sources, acquisitionRoutes, craftPlans };
}

function parseAcquisitionRoutes(value: unknown, knownSources: ReadonlySet<string>): readonly Poe1AcquisitionRoute[] {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) throw new Error(`acquisitionRoutes must be a list with at most ${MAX_RECORDS} entries.`);
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const input = record(entry, `acquisitionRoutes[${index}]`);
    const id = boundedText(input.id, `acquisitionRoutes[${index}].id`, 80);
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id) || ids.has(id)) throw new Error(`acquisitionRoutes[${index}].id is invalid or duplicated.`);
    ids.add(id);
    const method = input.method;
    if (!["campaign", "vendor", "drop", "divination_card", "league_mechanic", "boss", "atlas"].includes(String(method))) {
      throw new Error(`acquisitionRoutes[${index}].method is not supported by the SSF route planner.`);
    }
    const atlasNodeNames = input.atlasNodeNames === undefined ? [] : textList(input.atlasNodeNames, `acquisitionRoutes[${index}].atlasNodeNames`, 60);
    const atlasShareUrl = input.atlasShareUrl === undefined
      ? undefined
      : parseAtlasTreeShareUrl(boundedText(input.atlasShareUrl, `acquisitionRoutes[${index}].atlasShareUrl`, 16_000)).sourceUrl;
    if ((input.atlasTreeName !== undefined || atlasNodeNames.length > 0) && !atlasShareUrl) {
      throw new Error(`acquisitionRoutes[${index}] must include a validated GGG Atlas share URL when naming an Atlas setup.`);
    }
    return {
      id,
      match: exactMatch(input.match, `acquisitionRoutes[${index}].match`),
      stage: stage(input.stage, `acquisitionRoutes[${index}].stage`),
      method: method as Poe1AcquisitionRoute["method"],
      title: boundedText(input.title, `acquisitionRoutes[${index}].title`, 200),
      steps: textList(input.steps, `acquisitionRoutes[${index}].steps`, MAX_STEPS),
      ...(input.atlasTreeName === undefined ? {} : { atlasTreeName: boundedText(input.atlasTreeName, `acquisitionRoutes[${index}].atlasTreeName`, 160) }),
      ...(atlasNodeNames.length ? { atlasNodeNames } : {}),
      ...(atlasShareUrl ? { atlasShareUrl } : {}),
      sourceIds: sourceIds(input.sourceIds, `acquisitionRoutes[${index}].sourceIds`, knownSources),
    };
  });
}

function parseCraftPlans(value: unknown, knownSources: ReadonlySet<string>): readonly Poe1CraftPlan[] {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) throw new Error(`craftPlans must be a list with at most ${MAX_RECORDS} entries.`);
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const input = record(entry, `craftPlans[${index}]`);
    const id = boundedText(input.id, `craftPlans[${index}].id`, 80);
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id) || ids.has(id)) throw new Error(`craftPlans[${index}].id is invalid or duplicated.`);
    ids.add(id);
    if (!Array.isArray(input.materials) || input.materials.length > 40) throw new Error(`craftPlans[${index}].materials must be a list with at most 40 entries.`);
    const materialNames = new Set<string>();
    const materials = input.materials.map((rawMaterial, materialIndex) => {
      const material = record(rawMaterial, `craftPlans[${index}].materials[${materialIndex}]`);
      const materialName = boundedText(material.name, `craftPlans[${index}].materials[${materialIndex}].name`, 200);
      const normalizedName = poe1Provider.normalizeItemIdentity(materialName);
      if (materialNames.has(normalizedName)) throw new Error(`craftPlans[${index}].materials contains duplicate names.`);
      materialNames.add(normalizedName);
      if (!Number.isInteger(material.quantity) || Number(material.quantity) < 1 || Number(material.quantity) > 1_000_000) {
        throw new Error(`craftPlans[${index}].materials[${materialIndex}].quantity must be a positive integer.`);
      }
      return { name: materialName, quantity: Number(material.quantity) };
    });
    const requiredItemLevel = input.requiredItemLevel;
    if (requiredItemLevel !== undefined && (!Number.isInteger(requiredItemLevel) || Number(requiredItemLevel) < 1 || Number(requiredItemLevel) > 100)) {
      throw new Error(`craftPlans[${index}].requiredItemLevel must be an integer from 1 to 100.`);
    }
    return {
      id,
      match: exactMatch(input.match, `craftPlans[${index}].match`),
      stage: stage(input.stage, `craftPlans[${index}].stage`),
      title: boundedText(input.title, `craftPlans[${index}].title`, 200),
      baseType: boundedText(input.baseType, `craftPlans[${index}].baseType`, 200),
      ...(requiredItemLevel === undefined ? {} : { requiredItemLevel: Number(requiredItemLevel) }),
      prerequisites: textList(input.prerequisites, `craftPlans[${index}].prerequisites`, MAX_STEPS),
      materials,
      steps: textList(input.steps, `craftPlans[${index}].steps`, MAX_STEPS),
      stopCondition: boundedText(input.stopCondition, `craftPlans[${index}].stopCondition`),
      sourceIds: sourceIds(input.sourceIds, `craftPlans[${index}].sourceIds`, knownSources),
    };
  });
}

function exactTargetSet(goal: ItemGoal): Set<string> {
  return new Set([...(goal.match.itemNames ?? []), ...(goal.match.baseTypes ?? [])]
    .map(poe1Provider.normalizeItemIdentity)
    .filter(Boolean));
}

function exactRouteMatch(goal: ItemGoal, match: Poe1AcquisitionRoute["match"]): boolean {
  const targets = exactTargetSet(goal);
  return [...(match.itemNames ?? []), ...(match.baseTypes ?? [])]
    .some((candidate) => targets.has(poe1Provider.normalizeItemIdentity(candidate)));
}

export function acquisitionRoutesForGoal(goal: ItemGoal, pack?: Poe1RouteKnowledgePack | null): readonly Poe1AcquisitionRoute[] {
  if (!pack || (goal.match.itemNames?.length ?? 0) + (goal.match.baseTypes?.length ?? 0) === 0) return [];
  return pack.acquisitionRoutes.filter((route) => exactRouteMatch(goal, route.match));
}

export function craftPlanForGoal(goal: ItemGoal, pack?: Poe1RouteKnowledgePack | null): Poe1CraftPlan | undefined {
  if (!pack || (goal.match.itemNames?.length ?? 0) + (goal.match.baseTypes?.length ?? 0) === 0) return undefined;
  return pack.craftPlans.find((plan) => exactRouteMatch(goal, plan.match));
}
