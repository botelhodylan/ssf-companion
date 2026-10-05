const MAX_INPUT_BYTES = 12_000_000;
const MAX_EXPORT_NODE_COUNT = 20_000;
const MAX_URL_LENGTH = 16_000;
const MAX_NODE_HASHES = 255;
const GGG_HOSTS = new Set(["pathofexile.com", "www.pathofexile.com"]);

export type AtlasTreeRuleset = "standard" | "ruthless";
export type AtlasTreeEncodingVersion = 5 | 6;

export interface AtlasTreeImport {
  readonly name?: string;
  readonly sourceUrl: string;
  readonly ruleset: AtlasTreeRuleset;
  /** GGG's URL wire version. PoE 1 currently uses format 6.2 (wire version 6). */
  readonly encodingVersion: AtlasTreeEncodingVersion;
  /** 16-bit skill hashes from GGG's share URL; names require matching tree data. */
  readonly nodeSkillHashes: readonly number[];
}

export interface SavedAtlasTree extends AtlasTreeImport {
  readonly id: string;
  readonly leagueId: string;
  readonly name: string;
  readonly importedAt: string;
}

export interface AtlasTreeNodeFact {
  readonly skillHash: number;
  readonly name?: string;
  readonly kind?: "keystone" | "notable" | "mastery";
  readonly stats: readonly string[];
  readonly neighbors: readonly number[];
}

/** A compact local index made from a player-selected official GGG Atlas export. */
export interface AtlasTreeDataset {
  readonly sourceFile: string;
  readonly importedAt: string;
  readonly nodes: Readonly<Record<string, AtlasTreeNodeFact>>;
}

export interface AtlasTreeSnapshotFile {
  readonly product: "SSF Companion";
  readonly schemaVersion: 1;
  readonly game: "poe1";
  readonly atlasTree: {
    readonly name: string;
    readonly shareUrl: string;
    readonly ruleset: AtlasTreeRuleset;
    readonly encodingVersion: AtlasTreeEncodingVersion;
    readonly nodeSkillHashes: readonly number[];
  };
}

/** Parse a public GGG Atlas share URL, standalone share URL text, or app JSON snapshot. */
export function parseAtlasTreeImport(content: string): AtlasTreeImport {
  if (new TextEncoder().encode(content).byteLength > MAX_INPUT_BYTES) {
    throw new Error("That Atlas tree file is too large to import safely.");
  }
  const input = content.trim();
  if (!input) throw new Error("Paste an official PoE 1 Atlas tree URL or choose a saved Atlas tree file.");

  if (input.startsWith("{")) return parseAtlasTreeSnapshot(input);
  return parseAtlasTreeShareUrl(input);
}

export function parseAtlasTreeShareUrl(rawUrl: string): AtlasTreeImport {
  if (rawUrl.length > MAX_URL_LENGTH) throw new Error("That Atlas tree share URL is too long.");
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a full official pathofexile.com Atlas tree share URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !GGG_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Atlas URL imports only support secure share links from pathofexile.com.");
  }

  const path = url.pathname.split("/").filter(Boolean).map((part) => decodePathPart(part));
  if (path[0] !== "atlas-skill-tree" || path.length < 2 || path.length > 4) {
    throw new Error("Use a GGG Atlas Skill Tree share URL from pathofexile.com.");
  }
  const payload = path[path.length - 1];
  const modifiers = path.slice(1, -1);
  let ruleset: AtlasTreeRuleset = "standard";
  for (const modifier of modifiers) {
    if (modifier === "ruthless") ruleset = "ruthless";
    else if (/^\d{1,2}\.\d{1,2}(?:\.\d{1,2})?$/.test(modifier)) continue;
    else throw new Error("This Atlas URL has an unsupported path format.");
  }

  const parsed = decodeAtlasPayload(payload);
  const canonicalUrl = new URL(url.href);
  canonicalUrl.search = "";
  canonicalUrl.hash = "";
  return {
    sourceUrl: canonicalUrl.href,
    ruleset,
    encodingVersion: parsed.version,
    nodeSkillHashes: parsed.nodeSkillHashes,
  };
}

export function serializeAtlasTreeSnapshot(input: {
  readonly name: string;
  readonly shareUrl: string;
  readonly ruleset: AtlasTreeRuleset;
  readonly encodingVersion: AtlasTreeEncodingVersion;
  readonly nodeSkillHashes: readonly number[];
}): string {
  const snapshot: AtlasTreeSnapshotFile = {
    product: "SSF Companion",
    schemaVersion: 1,
    game: "poe1",
    atlasTree: {
      name: input.name.trim().slice(0, 100) || "Atlas tree",
      shareUrl: input.shareUrl,
      ruleset: input.ruleset,
      encodingVersion: input.encodingVersion,
      nodeSkillHashes: [...input.nodeSkillHashes],
    },
  };
  return JSON.stringify(snapshot, null, 2);
}

/** Read only Atlas facts from the player's selected GGG atlastree-export data.json. */
export function parseAtlasTreeDataset(content: string, sourceFile: string): AtlasTreeDataset {
  if (new TextEncoder().encode(content).byteLength > MAX_INPUT_BYTES) {
    throw new Error("That GGG Atlas data export is too large to import safely.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("The selected Atlas data file is not valid JSON.");
  }
  if (!isRecord(parsed) || parsed.tree !== "Atlas" || !isRecord(parsed.nodes)) {
    throw new Error("Choose the data.json file from GGG's Atlas tree export; it must contain an Atlas tree and nodes object.");
  }
  const entries = Object.entries(parsed.nodes);
  if (entries.length === 0 || entries.length > MAX_EXPORT_NODE_COUNT) {
    throw new Error("The Atlas export has an unexpected number of tree nodes.");
  }
  const nodes: Record<string, AtlasTreeNodeFact> = {};
  for (const [key, value] of entries) {
    const skillHash = Number(key);
    if (!Number.isSafeInteger(skillHash) || skillHash < 0 || skillHash > 65_535 || !isRecord(value)) continue;
    if (value.skill !== skillHash) continue;
    const name = boundedText(value.name, 160);
    const stats = boundedStringList(value.stats, 50, 500);
    if (!name && stats.length === 0) continue;
    const kind = value.isKeystone === true ? "keystone"
      : value.isNotable === true ? "notable"
        : value.isMastery === true ? "mastery"
          : undefined;
    const neighbors = [...new Set([
      ...numericStringList(value.in),
      ...numericStringList(value.out),
    ])].filter((neighbor) => neighbor !== skillHash);
    nodes[String(skillHash)] = {
      skillHash,
      ...(name ? { name } : {}),
      ...(kind ? { kind } : {}),
      stats,
      neighbors,
    };
  }
  if (Object.keys(nodes).length === 0) throw new Error("No Atlas node facts were recognized in the selected GGG export.");
  const safeFileName = sourceFile.split(/[\\/]/).pop()?.trim().slice(0, 120) || "data.json";
  return { sourceFile: safeFileName, importedAt: new Date().toISOString(), nodes };
}

function parseAtlasTreeSnapshot(input: string): AtlasTreeImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    throw new Error("The selected file is not valid Atlas tree JSON.");
  }
  if (!isRecord(parsed) || parsed.product !== "SSF Companion" || parsed.schemaVersion !== 1 || parsed.game !== "poe1" || !isRecord(parsed.atlasTree)) {
    throw new Error("This JSON file is not an SSF Companion PoE 1 Atlas snapshot.");
  }
  const tree = parsed.atlasTree;
  if (typeof tree.shareUrl !== "string") throw new Error("The Atlas snapshot is missing its original GGG share URL.");
  const fromUrl = parseAtlasTreeShareUrl(tree.shareUrl);
  if (tree.ruleset !== fromUrl.ruleset || tree.encodingVersion !== fromUrl.encodingVersion || !sameNumbers(tree.nodeSkillHashes, fromUrl.nodeSkillHashes)) {
    throw new Error("The Atlas snapshot does not match the node data in its original share URL.");
  }
  return {
    ...fromUrl,
    ...(typeof tree.name === "string" && tree.name.trim() ? { name: tree.name.trim().slice(0, 100) } : {}),
  };
}

function decodeAtlasPayload(payload: string): { version: AtlasTreeEncodingVersion; nodeSkillHashes: number[] } {
  const bytes = decodeBase64Url(payload);
  if (bytes.length < 7) throw new Error("The Atlas share data is incomplete.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0, false);
  if (version !== 5 && version !== 6) throw new Error(`Atlas share format ${version} is not supported by this PoE 1 importer.`);
  if (bytes[4] !== 0 || bytes[5] !== 0) throw new Error("This URL does not contain a PoE 1 Atlas tree (Atlas class and ascendancy must be zero).");

  let offset = 6;
  const nodeCount = bytes[offset++];
  if (nodeCount > MAX_NODE_HASHES || offset + nodeCount * 2 + 1 > bytes.length) {
    throw new Error("The Atlas share data has an invalid node count or is truncated.");
  }
  const nodeSkillHashes: number[] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    nodeSkillHashes.push(view.getUint16(offset, false));
    offset += 2;
  }

  const extendedCount = bytes[offset++];
  if (extendedCount !== 0) throw new Error("Atlas share URLs cannot contain extended passive-tree hashes.");
  if (offset + extendedCount * 2 > bytes.length) throw new Error("The Atlas share data is truncated.");
  offset += extendedCount * 2;

  if (version === 6) {
    if (offset >= bytes.length) throw new Error("The Atlas share data is missing its mastery-hash count.");
    const masteryCount = bytes[offset++];
    if (masteryCount !== 0) throw new Error("Atlas share URLs cannot contain mastery-effect hashes.");
    if (offset + masteryCount * 4 > bytes.length) throw new Error("The Atlas share data is truncated.");
    offset += masteryCount * 4;
  }
  if (offset !== bytes.length) throw new Error("The Atlas share data has unexpected trailing bytes.");
  if (new Set(nodeSkillHashes).size !== nodeSkillHashes.length) throw new Error("The Atlas share data contains duplicate node hashes.");
  return { version, nodeSkillHashes: nodeSkillHashes.sort((left, right) => left - right) };
}

function decodeBase64Url(payload: string): Uint8Array {
  if (!payload || !/^[A-Za-z0-9_+\-/]*={0,2}$/.test(payload)) throw new Error("The Atlas share URL does not contain valid Base64URL data.");
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  if (normalized.replace(/=+$/, "").length % 4 === 1) throw new Error("The Atlas share URL has malformed Base64URL data.");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("The Atlas share URL has malformed Base64URL data.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodePathPart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    throw new Error("The Atlas share URL contains malformed path encoding.");
  }
}

function sameNumbers(value: unknown, expected: readonly number[]): boolean {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  return value.every((item, index) => Number.isSafeInteger(item) && item === expected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, maxLength) : undefined;
}

function boundedStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).flatMap((item) => {
    const text = boundedText(item, maxLength);
    return text ? [text] : [];
  });
}

function numericStringList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "string" && typeof item !== "number") return [];
    const number = Number(item);
    return Number.isSafeInteger(number) && number >= 0 && number <= 65_535 ? [number] : [];
  });
}
