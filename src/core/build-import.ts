import type {
  BuildImportResult,
  BuildGemFact,
  BuildManifest,
  BuildManifestConfidence,
  BuildSkillGroup,
  BuildSkillSummary,
  BuildSourceFetchPlan,
  EquippedItemFact,
  ItemGoal,
  PassiveSpecFact,
  ProgressionStage,
} from "./types";

export type InflateZlib = (compressed: Uint8Array) => Promise<Uint8Array>;

export interface BuildImportOptions {
  /** Override the platform inflater for tests or a future desktop adapter. */
  readonly inflateZlib?: InflateZlib;
}

const LIMITATIONS = [
  "No account data is fetched or changed by this importer.",
  "Guide pages are recognized as links; their HTML is not fetched or scraped.",
] as const;

const MAX_POB_XML_CHARACTERS = 5_000_000;
const MAX_POB_CODE_CHARACTERS = 7_000_000;
const MAX_SKILL_GROUPS = 64;
const MAX_GEMS_PER_GROUP = 32;
const MAX_EQUIPPED_SLOTS = 64;
const MAX_PASSIVE_NODE_IDS = 500;

/**
 * Normalize an import field containing PoB XML, a Path of Building share code,
 * a pobb.in URL, or a Maxroll guide URL. External URLs are never fetched here.
 */
export async function normalizeBuildInput(
  rawInput: string,
  options: BuildImportOptions = {},
): Promise<BuildImportResult> {
  if (rawInput.length > MAX_POB_CODE_CHARACTERS) {
    return unsupported("pob_code", "The import is larger than the local limit.", [
      `PoB code and pasted input are limited to ${MAX_POB_CODE_CHARACTERS.toLocaleString()} characters.`,
      "No data was fetched or changed.",
    ]);
  }
  const input = unwrapInput(rawInput);
  if (!input) {
    return unsupported("unknown", "Paste a PoB code, PoB XML, pobb.in link, or Maxroll guide link.");
  }

  const url = parseUrl(input);
  if (url) {
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const reference = url.toString();
    if (host === "pobb.in" || host.endsWith(".pobb.in")) {
      const fetchPlan = host === "pobb.in" ? pobbInFetchPlan(url) : undefined;
      return {
        status: "partial",
        source: "pobb_in_url",
        reference,
        ...(fetchPlan ? { fetchPlan } : {}),
        message:
          fetchPlan
            ? "Recognized a pobb.in build link and prepared its allowlisted raw endpoint. The desktop main process can fetch it and pass the response to the local PoB parser."
            : "Recognized a pobb.in URL, but its path is not one of the documented raw export forms.",
        limitations: fetchPlan
          ? [
              "This importer does not make the request; the desktop main process must apply the allowlist and response-size limits.",
              "The pobb.in request must include an app-identifying User-Agent with the configured contact value.",
            ]
          : [
              "Only /<id>/raw and /u/<username>/<id>/raw are prepared for retrieval.",
              "Paste the PoB code or XML if the source link uses another path.",
            ],
      };
    }
    if (host === "maxroll.gg" || host.endsWith(".maxroll.gg")) {
      const fetchPlan = host === "maxroll.gg" ? maxrollFetchPlan(url) : undefined;
      return {
        status: "partial",
        source: "maxroll_url",
        reference,
        ...(fetchPlan ? { fetchPlan } : {}),
        message: fetchPlan
          ? "Recognized a Maxroll shared PoB link and prepared its allowlisted PoB data endpoint for the desktop main process."
          : "Recognized a Maxroll URL, but guide pages are not imported. Use its /poe/pob/<id> share link or paste a PoB code.",
        limitations: fetchPlan
          ? [
              "This importer does not make the request; the desktop main process must apply the allowlist and response-size limits.",
              "The fetched payload still needs local PoB decoding and manifest validation.",
            ]
          : [
              "Generic guide HTML and embedded page data are not fetched or scraped.",
              "A guide URL alone cannot provide a verified Build Manifest.",
            ],
      };
    }
    return unsupported("unknown", "This URL source is not supported. Paste PoB XML or a Path of Building code.");
  }

  if (looksLikePathOfBuildingXml(input)) {
    return parsePathOfBuildingXml(input);
  }

  if (!looksLikeBase64PobCode(input)) {
    return unsupported("unknown", "Input is not a recognized Path of Building code, XML, or supported URL.");
  }

  const compressed = decodeBase64(input);
  if (!compressed) {
    return unsupported("pob_code", "The pasted Path of Building code is not valid Base64.");
  }

  try {
    const inflater = options.inflateZlib ?? inflateWithPlatform;
    const xmlBytes = await inflater(compressed);
    if (xmlBytes.byteLength > MAX_POB_XML_CHARACTERS) {
      return unsupported("pob_code", "Decoded Path of Building XML is larger than the local import limit.", [
        `XML imports are limited to ${MAX_POB_XML_CHARACTERS.toLocaleString()} bytes.`,
        "No data was fetched or changed.",
      ]);
    }
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(xmlBytes);
    if (!looksLikePathOfBuildingXml(xml)) {
      return unsupported("pob_code", "The code decoded, but it did not contain Path of Building XML.");
    }
    return parsePathOfBuildingXml(xml, input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown decompression error";
    return unsupported(
      "pob_code",
      `Could not decode this Path of Building code (${detail}). Paste the exported XML if available.`,
      ["The code is processed locally; no network request is made."],
    );
  }
}

/**
 * Parse XML already decoded by the renderer or desktop main process. This is
 * the handoff point for an Electron main-process zlib implementation.
 */
export function parsePathOfBuildingXml(xml: string, identityInput = xml): BuildImportResult {
  if (xml.length > MAX_POB_XML_CHARACTERS) {
    return unsupported("pob_code", "Path of Building XML is larger than the local import limit.", [
      `XML imports are limited to ${MAX_POB_XML_CHARACTERS.toLocaleString()} characters.`,
      "No data was fetched or changed.",
    ]);
  }
  if (!looksLikePathOfBuildingXml(xml)) {
    return unsupported("pob_code", "The supplied text does not contain Path of Building XML.");
  }
  return resultFromXml(xml, "pob_code", identityInput);
}

function resultFromXml(
  xml: string,
  source: "pob_code",
  identityInput: string,
): BuildImportResult {
  const buildAttributes = readFirstTagAttributes(xml, "Build");
  const buildName = decodeXml(buildAttributes.name ?? "").trim();
  const className = decodeXml(buildAttributes.className ?? "").trim() || undefined;
  const ascendancy = decodeXml(buildAttributes.ascendClassName ?? "").trim() || undefined;
  const level = positiveInteger(buildAttributes.level);
  const parseWarnings: string[] = [];
  const skills = parseSkillSummary(xml, buildAttributes, parseWarnings);
  const equippedItems = parseEquippedItems(xml, parseWarnings);
  const itemGoals = itemGoalsFromEquippedItems(equippedItems);
  const parsedPassiveSpecs = parsePassiveSpecs(xml, parseWarnings);
  const passiveAllocationCount = parsedPassiveSpecs.active?.allocatedNodeIds.length;
  const id = `poe1-${stableHash(identityInput)}`;
  const hasBuildTag = Object.keys(buildAttributes).length > 0;
  const importState = hasBuildTag && parseWarnings.length === 0 ? "complete" : "partial";
  const inferredStage = stageFromLevel(level);
  const confidence = summarizeConfidence(hasBuildTag, parseWarnings);

  const manifest: BuildManifest = {
    schemaVersion: 1,
    game: "poe1",
    id,
    name: buildName || "Imported Path of Building build",
    ...(className ? { className } : {}),
    ...(ascendancy ? { ascendancy } : {}),
    ...(level ? { level } : {}),
    role: "ACTIVE",
    progressionStage: inferredStage,
    source: { kind: "pob_code", importState },
    skills,
    equippedItems,
    ...(passiveAllocationCount !== undefined ? { passiveAllocationCount } : {}),
    ...(parsedPassiveSpecs.specs.length ? { passiveSpecs: parsedPassiveSpecs.specs } : {}),
    parseWarnings,
    confidence,
    itemGoals,
  };

  const limitations = [
    "The level-based progression stage is an estimate; confirm it against the selected character.",
    "Skill and equipment summaries cover only the active PoB skill and item sets.",
    "Passive specs preserve the node IDs and tree versions from the PoB export; no passive-tree database is loaded to validate or recommend a route.",
    "No DPS, item-mod evaluation, or build simulation is performed.",
  ];
  limitations.push(...parseWarnings);
  if (!hasBuildTag) {
    limitations.push("The XML did not contain a Build metadata element, so the manifest is partial.");
  }

  return {
    status: importState,
    source,
    manifest,
    message: importState === "complete"
      ? "Path of Building data was decoded into a local PoE 1 Build Manifest and summary."
      : hasBuildTag
        ? "Path of Building XML was recognized, but its Build Manifest summary is partial. Review its warnings and confidence."
        : "Path of Building XML was recognized, but key build metadata is missing.",
    limitations,
  };
}

function parseSkillSummary(
  xml: string,
  buildAttributes: Readonly<Record<string, string>>,
  warnings: string[],
): BuildSkillSummary {
  const skillsSection = findSection(xml, "Skills");
  if (!skillsSection) {
    warnings.push("The PoB XML has no Skills section.");
    return { gemRoleMethod: "name_suffix_heuristic", groups: [], supportGemNames: [] };
  }

  const skillSetCollection = collectMatches(
    /<SkillSet\b([^>]*)>([\s\S]*?)<\/SkillSet\s*>/gi,
    skillsSection.inner,
    MAX_SKILL_GROUPS,
  );
  const skillSets = skillSetCollection.matches;
  if (skillSetCollection.truncated) warnings.push(`Skill-set parsing stopped at ${MAX_SKILL_GROUPS} sets.`);
  let selectedSetId = positiveInteger(skillsSection.attributes.activeSkillSet);
  if (selectedSetId === undefined) selectedSetId = skillSets.length === 1 ? positiveInteger(readAttributes(skillSets[0]?.[1] ?? "").id) ?? 1 : 1;

  let selectedSet: { attributes: Record<string, string>; inner: string } | undefined;
  let activeSkillSetName: string | undefined;
  if (skillSets.length) {
    for (const match of skillSets) {
      const attributes = readAttributes(match[1] ?? "");
      if (positiveInteger(attributes.id) === selectedSetId) {
        selectedSet = { attributes, inner: match[2] ?? "" };
        activeSkillSetName = decodeXml(attributes.title ?? "").trim() || undefined;
        break;
      }
    }
    if (!selectedSet) warnings.push(`Active PoB skill set ${selectedSetId} was not found.`);
  } else {
    // PoB's loader accepts the legacy flat <Skills><Skill> representation.
    selectedSet = { attributes: { id: String(selectedSetId) }, inner: skillsSection.inner };
  }

  if (!selectedSet) {
    return {
      activeSkillSetId: selectedSetId,
      gemRoleMethod: "name_suffix_heuristic",
      groups: [],
      supportGemNames: [],
    };
  }

  const skillGroupCollection = collectMatches(
    /<Skill\b([^>]*)>([\s\S]*?)<\/Skill\s*>/gi,
    selectedSet.inner,
    MAX_SKILL_GROUPS,
  );
  const skillGroupMatches = skillGroupCollection.matches;
  const mainGroupIndex = positiveInteger(buildAttributes.mainSkillIndex ?? buildAttributes.mainSocketGroup) ?? 1;
  if (skillGroupCollection.truncated) {
    warnings.push(`The active skill set has more than ${MAX_SKILL_GROUPS} groups; remaining groups were omitted.`);
  }

  const groups: BuildSkillGroup[] = skillGroupMatches.slice(0, MAX_SKILL_GROUPS).map((match, index) => {
    const attributes = readAttributes(match[1] ?? "");
    const groupIndex = index + 1;
    const isMainSkillGroup = groupIndex === mainGroupIndex;
    const gemCollection = collectMatches(/<Gem\b([^>]*)\/?\s*>/gi, match[2] ?? "", MAX_GEMS_PER_GROUP);
    const rawGems = gemCollection.matches;
    if (gemCollection.truncated) {
      warnings.push(`Skill group ${groupIndex} has more than ${MAX_GEMS_PER_GROUP} gems; remaining gems were omitted.`);
    }
    const gems: BuildGemFact[] = rawGems.slice(0, MAX_GEMS_PER_GROUP).map((gemMatch) => {
      const gemAttributes = readAttributes(gemMatch[1] ?? "");
      const name = decodeXml(gemAttributes.nameSpec ?? "").trim() || undefined;
      const role: BuildGemFact["role"] = !name
        ? "unknown"
        : /\bsupport$/i.test(name)
          ? "support"
          : "other";
      return {
        ...(name ? { name } : {}),
        role,
        ...(gemAttributes.gemId ? { gemId: gemAttributes.gemId } : {}),
        ...(gemAttributes.skillId ? { skillId: gemAttributes.skillId } : {}),
        ...(positiveInteger(gemAttributes.level) !== undefined
          ? { level: positiveInteger(gemAttributes.level) }
          : {}),
        ...(nonNegativeInteger(gemAttributes.quality) !== undefined
          ? { quality: nonNegativeInteger(gemAttributes.quality) }
          : {}),
        ...(parseBoolean(gemAttributes.enabled) !== undefined
          ? { enabled: parseBoolean(gemAttributes.enabled) }
          : {}),
      };
    });
    const supportGemNames = gems
      .filter((gem) => gem.role === "support" && gem.name)
      .map((gem) => gem.name as string);
    const imbuedSupport = decodeXml(attributes.imbuedSupport ?? "").trim();
    if (imbuedSupport) {
      const normalizedName = /\bsupport$/i.test(imbuedSupport) ? imbuedSupport : `${imbuedSupport} Support`;
      if (!supportGemNames.some((name) => name.toLowerCase() === normalizedName.toLowerCase())) {
        supportGemNames.push(normalizedName);
      }
    }
    const activeGemNames = gems.filter((gem) => gem.role === "other" && gem.name);
    const mainActiveSkillIndex = positiveInteger(attributes.mainActiveSkill) ?? 1;
    const mainSkillName = isMainSkillGroup ? activeGemNames[mainActiveSkillIndex - 1]?.name : undefined;
    if (isMainSkillGroup && !mainSkillName && gems.length) {
      warnings.push("The selected main skill could not be resolved from the main skill group's gem names.");
    }
    if (gems.some((gem) => gem.role === "unknown")) {
      warnings.push(`Skill group ${groupIndex} contains a gem with no display name.`);
    }
    return {
      index: groupIndex,
      ...(attributes.label ? { label: decodeXml(attributes.label) } : {}),
      ...(attributes.slot ? { socketedIn: decodeXml(attributes.slot) } : {}),
      ...(parseBoolean(attributes.enabled ?? attributes.active) !== undefined
        ? { enabled: parseBoolean(attributes.enabled ?? attributes.active) }
        : {}),
      ...(parseBoolean(attributes.includeInFullDPS) !== undefined
        ? { includeInFullDps: parseBoolean(attributes.includeInFullDPS) }
        : {}),
      mainActiveSkillIndex,
      isMainSkillGroup,
      ...(mainSkillName ? { mainSkillName } : {}),
      supportGemNames,
      gems,
    };
  });

  if (!groups.length) warnings.push("No socket groups were found in the active PoB skill set.");
  if (mainGroupIndex > groups.length) warnings.push(`Main skill group index ${mainGroupIndex} is outside the active skill set.`);
  const supportGemNames = [...new Set(groups.flatMap((group) => group.supportGemNames))];
  const mainSkillGroup = groups.find((group) => group.isMainSkillGroup);
  return {
    activeSkillSetId: selectedSetId,
    ...(activeSkillSetName ? { activeSkillSetName } : {}),
    ...(mainSkillGroup ? { mainSkillGroupIndex: mainSkillGroup.index } : {}),
    ...(mainSkillGroup?.mainSkillName ? { mainSkillName: mainSkillGroup.mainSkillName } : {}),
    gemRoleMethod: "name_suffix_heuristic",
    supportGemNames,
    groups,
  };
}

function parseEquippedItems(xml: string, warnings: string[]): EquippedItemFact[] {
  const itemsSection = findSection(xml, "Items");
  if (!itemsSection) {
    warnings.push("The PoB XML has no Items section.");
    return [];
  }

  const activeSetId = positiveInteger(itemsSection.attributes.activeItemSet) ?? 1;
  const itemSetCollection = collectMatches(
    /<ItemSet\b([^>]*)>([\s\S]*?)<\/ItemSet\s*>/gi,
    itemsSection.inner,
    MAX_SKILL_GROUPS,
  );
  const itemSets = itemSetCollection.matches;
  if (itemSetCollection.truncated) warnings.push(`Item-set parsing stopped at ${MAX_SKILL_GROUPS} sets.`);
  let activeSetInner = itemsSection.inner;
  if (itemSets.length) {
    const activeSet = itemSets.find((match) => positiveInteger(readAttributes(match[1] ?? "").id) === activeSetId);
    if (!activeSet) {
      warnings.push(`Active PoB item set ${activeSetId} was not found.`);
      return [];
    }
    activeSetInner = activeSet[2] ?? "";
  }

  const slotCollection = collectMatches(/<Slot\b([^>]*)\/?\s*>/gi, activeSetInner, MAX_EQUIPPED_SLOTS);
  const slots = slotCollection.matches
    .map((match) => readAttributes(match[1] ?? ""))
    .filter((attributes) => attributes.itemId && attributes.itemId !== "0")
    .slice(0, MAX_EQUIPPED_SLOTS);
  if (slotCollection.truncated) {
    warnings.push(`Equipped item parsing stopped at ${MAX_EQUIPPED_SLOTS} slots.`);
  }
  const referencedIds = new Set(slots.map((attributes) => attributes.itemId).filter((id): id is string => Boolean(id)));
  if (!referencedIds.size) return [];

  const itemRecords = new Map<string, ParsedPobItem>();
  const itemRegex = /<Item\b([^>]*)>([\s\S]*?)<\/Item\s*>/gi;
  for (const match of itemsSection.inner.matchAll(itemRegex)) {
    const attributes = readAttributes(match[1] ?? "");
    const itemId = attributes.id;
    if (!itemId || !referencedIds.has(itemId)) continue;
    const parsed = parsePobItemText(match[2] ?? "");
    if (parsed) itemRecords.set(itemId, parsed);
    if (itemRecords.size === referencedIds.size) break;
  }

  const facts: EquippedItemFact[] = [];
  for (const slot of slots) {
    const itemId = slot.itemId;
    const parsed = itemId ? itemRecords.get(itemId) : undefined;
    if (!itemId || !parsed) {
      warnings.push(`PoB item ${itemId ?? "?"} in slot ${slot.name ?? "(unnamed)"} could not be summarized.`);
      continue;
    }
    facts.push({
      slotName: decodeXml(slot.name ?? slot.id ?? "Unknown slot").trim(),
      itemId,
      ...(parsed.rarity ? { rarity: parsed.rarity } : {}),
      ...(parsed.itemName ? { itemName: parsed.itemName } : {}),
      ...(parsed.rarity === "UNIQUE" && parsed.itemName ? { uniqueName: parsed.itemName } : {}),
      ...(parsed.baseType ? { baseType: parsed.baseType } : {}),
    });
  }
  return facts;
}

interface ParsedPobItem {
  readonly rarity?: string;
  readonly itemName?: string;
  readonly baseType?: string;
}

function parsePobItemText(rawText: string): ParsedPobItem | undefined {
  const lines = decodeXml(rawText)
    .replace(/<[^>]*>/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rarityLine = lines.find((line) => /^rarity\s*:/i.test(line));
  if (!rarityLine) return undefined;
  const rarity = rarityLine.replace(/^rarity\s*:/i, "").trim().toUpperCase();
  const details = lines.slice(lines.indexOf(rarityLine) + 1);
  if (!details.length) return { rarity };
  if (rarity === "NORMAL") return { rarity, baseType: details[0] };
  return {
    rarity,
    itemName: details[0],
    ...(details[1] ? { baseType: details[1] } : {}),
  };
}

function itemGoalsFromEquippedItems(items: readonly EquippedItemFact[]): ItemGoal[] {
  const goals: ItemGoal[] = [];
  for (const item of items) {
    if (item.uniqueName) {
      goals.push({
        id: `pob-unique-${stableHash(`${item.slotName}:${item.uniqueName}`)}`,
        kind: "equip",
        priority: 4,
        match: { itemNames: [item.uniqueName] },
        why: `This unique is equipped in the planned ${item.slotName} slot.`,
      });
    } else if (item.baseType) {
      goals.push({
        id: `pob-base-${stableHash(`${item.slotName}:${item.baseType}`)}`,
        kind: "crafting",
        priority: 3,
        match: { baseTypes: [item.baseType] },
        why: `This base is used in the planned ${item.slotName} slot.`,
      });
    }
  }
  return deduplicateGoals(goals);
}

function parsePassiveSpecs(
  xml: string,
  warnings: string[],
): { readonly specs: readonly PassiveSpecFact[]; readonly active?: PassiveSpecFact } {
  const treeSection = findSection(xml, "Tree");
  let activeSpecId = 1;
  let matches: readonly RegExpMatchArray[] = [];
  if (treeSection) {
    activeSpecId = positiveInteger(treeSection.attributes.activeSpec) ?? 1;
    const specCollection = collectMatches(
      /<Spec\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Spec\s*>)/gi,
      treeSection.inner,
      MAX_SKILL_GROUPS,
    );
    matches = specCollection.matches;
    if (specCollection.truncated) warnings.push(`Passive spec parsing stopped at ${MAX_SKILL_GROUPS} specs.`);
  } else {
    // Older saves can expose a single Spec directly as a root-level section.
    const selected = /<Spec\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Spec\s*>)/i.exec(xml);
    matches = selected ? [selected] : [];
  }
  if (!matches.length) {
    warnings.push("No active passive Spec was found in the PoB XML.");
    return { specs: [] };
  }

  const specs: PassiveSpecFact[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const attributes = readAttributes(matches[index]?.[1] ?? "");
    const id = positiveInteger(attributes.id) ?? index + 1;
    const rawNodes = attributes.nodes;
    if (rawNodes === undefined) {
      warnings.push(`Passive Spec ${id} has no node list and was omitted.`);
      continue;
    }
    if (!rawNodes.trim()) {
      specs.push({
        id,
        ...(attributes.title ? { name: decodeXml(attributes.title).trim() } : {}),
        ...(attributes.treeVersion ? { treeVersion: attributes.treeVersion } : {}),
        isActive: id === activeSpecId,
        allocatedNodeIds: [],
      });
      continue;
    }
    const rawIds = rawNodes.split(",").map((value) => value.trim());
    if (rawIds.length > MAX_PASSIVE_NODE_IDS || rawIds.some((value) => !/^\d+$/.test(value))) {
      warnings.push(`Passive Spec ${id} has a malformed or oversized node list and was omitted.`);
      continue;
    }
    specs.push({
      id,
      ...(attributes.title ? { name: decodeXml(attributes.title).trim() } : {}),
      ...(attributes.treeVersion ? { treeVersion: attributes.treeVersion } : {}),
      isActive: id === activeSpecId,
      allocatedNodeIds: [...new Set(rawIds.map(Number))],
    });
  }

  const active = specs.find((spec) => spec.id === activeSpecId) ?? specs[activeSpecId - 1];
  if (!active) warnings.push(`Active PoB passive Spec ${activeSpecId} was not available in the imported build.`);
  return { specs, ...(active ? { active } : {}) };
}

function summarizeConfidence(hasBuildTag: boolean, warnings: readonly string[]): BuildManifestConfidence {
  if (!hasBuildTag) return "low";
  if (!warnings.length) return "high";
  return warnings.length >= 3 ? "low" : "medium";
}

interface XmlSection {
  readonly attributes: Record<string, string>;
  readonly inner: string;
}

function findSection(xml: string, tag: string): XmlSection | undefined {
  const expression = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}\\s*>`, "i");
  const match = expression.exec(xml);
  return match ? { attributes: readAttributes(match[1] ?? ""), inner: match[2] ?? "" } : undefined;
}

function collectMatches(
  expression: RegExp,
  input: string,
  limit: number,
): { readonly matches: RegExpMatchArray[]; readonly truncated: boolean } {
  const matches: RegExpMatchArray[] = [];
  for (const match of input.matchAll(expression)) {
    if (matches.length === limit) return { matches, truncated: true };
    matches.push(match);
  }
  return { matches, truncated: false };
}

function deduplicateGoals(goals: readonly ItemGoal[]): ItemGoal[] {
  const seen = new Set<string>();
  return goals.filter((goal) => {
    const key = `${goal.kind}:${goal.match.itemNames?.[0] ?? goal.match.baseTypes?.[0] ?? goal.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stageFromLevel(level: number | undefined): ProgressionStage {
  if (level === undefined || level < 68) return "campaign";
  if (level < 80) return "early_mapping";
  if (level < 90) return "atlas";
  return "endgame";
}

function readFirstTagAttributes(xml: string, tag: string): Record<string, string> {
  const match = new RegExp(`<${tag}\\b([^>]*)>`, "i").exec(xml);
  return match ? readAttributes(match[1] ?? "") : {};
}

function readAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of raw.matchAll(regex)) {
    attrs[match[1] ?? ""] = match[2] ?? match[3] ?? "";
  }
  return attrs;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (whole, decimal: string) => decodeCodePoint(whole, Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (whole, hex: string) => decodeCodePoint(whole, parseInt(hex, 16)))
    .replace(/&amp;/g, "&");
}

function decodeCodePoint(original: string, codePoint: number): string {
  if (
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) return original;
  return String.fromCodePoint(codePoint);
}

function positiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function nonNegativeInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (/^(?:true|1|yes)$/i.test(value)) return true;
  if (/^(?:false|0|no)$/i.test(value)) return false;
  return undefined;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function unwrapInput(value: string): string {
  const trimmed = value.trim().replace(/^```(?:text|xml|plaintext)?\s*/i, "").replace(/\s*```$/, "").trim();
  const markdownLink = /^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/.exec(trimmed);
  return markdownLink?.[1] ?? trimmed;
}

function parseUrl(input: string): URL | undefined {
  try {
    const candidate = input.match(/https?:\/\/\S+/i)?.[0] ?? input;
    return new URL(candidate.replace(/[),.;]+$/, ""));
  } catch {
    return undefined;
  }
}

function pobbInFetchPlan(url: URL): BuildSourceFetchPlan | undefined {
  const path = url.pathname;
  let rawPath: string | undefined;
  const direct = /^\/([A-Za-z0-9_-]{1,80})(?:\/raw)?\/?$/.exec(path);
  const userBuild = /^\/u\/([A-Za-z0-9_-]{1,80})\/([A-Za-z0-9_-]{1,80})\/raw\/?$/.exec(path);
  if (direct) rawPath = `/${direct[1]}/raw`;
  else if (userBuild) rawPath = `/u/${userBuild[1]}/${userBuild[2]}/raw`;
  if (!rawPath) return undefined;
  return {
    provider: "pobb_in",
    method: "GET",
    url: `https://pobb.in${rawPath}`,
    responseKind: "pob_code_or_xml",
    userAgentPolicy: "app_identity_and_configured_contact",
    allowedHost: "pobb.in",
  };
}

function maxrollFetchPlan(url: URL): BuildSourceFetchPlan | undefined {
  const sharedLink = /^\/poe\/pob\/([A-Za-z0-9_-]{1,100})\/?$/.exec(url.pathname);
  const rawEndpoint = /^\/poe\/api\/pob\/([A-Za-z0-9_-]{1,100})\/?$/.exec(url.pathname);
  const id = sharedLink?.[1] ?? rawEndpoint?.[1];
  if (!id) return undefined;
  return {
    provider: "maxroll",
    method: "GET",
    url: `https://maxroll.gg/poe/api/pob/${id}`,
    responseKind: "provider_payload",
    userAgentPolicy: "app_identity",
    allowedHost: "maxroll.gg",
  };
}

function looksLikePathOfBuildingXml(input: string): boolean {
  return /<PathOfBuilding\b[^>]*>/i.test(input) && /<\/PathOfBuilding\s*>/i.test(input);
}

function looksLikeBase64PobCode(input: string): boolean {
  const compact = input.replace(/\s+/g, "");
  return compact.length >= 24 && /^[A-Za-z0-9+/_=-]+$/.test(compact);
}

function decodeBase64(input: string): Uint8Array | undefined {
  const normalized = input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return undefined;
  const unpadded = normalized.replace(/=+$/, "");
  const remainder = unpadded.length % 4;
  const padding = normalized.length - unpadded.length;
  if (remainder === 1) return undefined;
  if (
    padding > 0 &&
    (normalized.length % 4 !== 0 || (padding === 1 && remainder !== 3) || (padding === 2 && remainder !== 2))
  ) return undefined;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const output = new Uint8Array(Math.floor((unpadded.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let outputOffset = 0;
  for (const char of unpadded) {
    const value = alphabet.indexOf(char);
    if (value < 0) return undefined;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[outputOffset] = (buffer >> bits) & 0xff;
      outputOffset += 1;
    }
  }
  return output.subarray(0, outputOffset);
}

async function inflateWithPlatform(compressed: Uint8Array): Promise<Uint8Array> {
  const StreamConstructor = globalThis.DecompressionStream;
  if (!StreamConstructor) {
    throw new Error("this runtime does not provide the built-in DEFLATE decoder");
  }
  const compressedBuffer = compressed.buffer.slice(
    compressed.byteOffset,
    compressed.byteOffset + compressed.byteLength,
  ) as ArrayBuffer;
  const stream = new Blob([compressedBuffer]).stream().pipeThrough(new StreamConstructor("deflate"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_POB_XML_CHARACTERS) {
      await reader.cancel();
      throw new Error("decoded Path of Building XML exceeds the local import limit");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function unsupported(
  source: BuildImportResult["source"],
  message: string,
  limitations: readonly string[] = LIMITATIONS,
): BuildImportResult {
  return { status: "unsupported", source, message, limitations };
}
