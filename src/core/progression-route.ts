import { poe1Provider } from "./game-provider";
import type { PassiveNodeFact, PassiveTreeDataset } from "./passive-tree-data";
import type { BuildManifest, BuildRole, ItemGoal, ProgressionStage } from "./types";

export const POE1_ROUTE_RULES_VERSION = "poe1-route-v1.1.0" as const;

export type RouteEvidenceSource =
  | "route_rules"
  | "build_manifest"
  | "progression_snapshot"
  | "stash_snapshot"
  | "local_tree_export";

export type RouteConfidence = "high" | "medium" | "low";

export type ProgressionRouteStepKind =
  | "gear_gap"
  | "crafting_plan"
  | "farming_atlas"
  | "passive_tree"
  | "loot_filter_priority";

export type ProgressionRouteStepStatus =
  | "ready"
  | "complete"
  | "already_aligned"
  | "needs_personal_data"
  | "needs_curated_data"
  | "needs_personal_and_curated_data";

export interface PassiveTreeComparison {
  readonly specId: number;
  readonly specName: string;
  readonly treeVersion?: string;
  readonly targetNodeCount: number;
  readonly comparison: "compared" | "missing_current" | "version_mismatch" | "version_unknown";
  readonly baselineSpecName?: string;
  readonly baselineTreeVersion?: string;
  readonly addedNodeIds?: readonly number[];
  readonly removedNodeIds?: readonly number[];
  readonly addedNodes?: readonly PassiveNodeFact[];
  readonly removedNodes?: readonly PassiveNodeFact[];
}

export interface RouteEvidence {
  readonly source: RouteEvidenceSource;
  readonly version: string;
  readonly reference?: string;
  readonly detail: string;
}

export interface RouteDataRequirement {
  readonly category: "personal" | "curated";
  readonly key: string;
  readonly description: string;
}

/** Versions attached to every step so recommendations can be reproduced. */
export interface ProgressionRouteDataVersion {
  readonly routeRules: typeof POE1_ROUTE_RULES_VERSION;
  readonly buildManifestSchema: 1;
  readonly progressionSnapshot: string;
  readonly stashSnapshot: string | null;
  /** This builder does not ship a crafting, atlas, tree, or filter dataset. */
  readonly curatedData: "not-loaded";
}

export interface ProgressionRouteStep {
  readonly id: string;
  readonly order: number;
  readonly kind: ProgressionRouteStepKind;
  readonly status: ProgressionRouteStepStatus;
  readonly title: string;
  /** Concrete next action, with unknown game rules called out explicitly. */
  readonly action: string;
  readonly confidence: RouteConfidence;
  readonly dataVersion: ProgressionRouteDataVersion;
  readonly evidence: readonly RouteEvidence[];
  readonly requiredData: readonly RouteDataRequirement[];
  readonly goalId?: string;
  readonly target?: string;
  readonly targetQuantity?: number;
  readonly ownedQuantity?: number;
  /** Exact node IDs and optional names resolved from a matching local tree export. */
  readonly passiveTree?: PassiveTreeComparison;
}

export interface RouteProgressionSnapshot {
  readonly stage: ProgressionStage | "unknown";
  readonly version: string;
  readonly source: "official_character" | "manual" | "demo" | "unknown";
  readonly characterLevel?: number;
  /** Count only; it is not enough to infer which passive nodes are missing. */
  readonly passiveAllocationCount?: number;
}

export interface RouteStashItem {
  readonly id?: string;
  readonly name: string;
  readonly baseType?: string;
  /** Tags must be supplied by the source; the route builder does not guess tags. */
  readonly tags?: readonly string[];
  readonly quantity: number;
}

export interface RouteStashSnapshot {
  readonly version: string;
  readonly source: "official_import" | "manual" | "demo";
  /** Aggregate duplicates across tabs before passing the snapshot. */
  readonly items: readonly RouteStashItem[];
}

export interface ProgressionRouteInput {
  readonly build: BuildManifest;
  /** ACTIVE build snapshot used only for same-version passive-node set comparisons. */
  readonly currentBuild?: BuildManifest;
  readonly progression: RouteProgressionSnapshot;
  readonly stash?: RouteStashSnapshot | null;
  readonly passiveTreeData?: PassiveTreeDataset | null;
}

export interface ProgressionRoute {
  readonly schemaVersion: 1;
  readonly game: "poe1";
  readonly rulesVersion: typeof POE1_ROUTE_RULES_VERSION;
  readonly build: {
    readonly id: string;
    readonly name: string;
    readonly role: BuildRole;
  };
  readonly currentStage: ProgressionStage | "unknown";
  readonly targetStage: ProgressionStage;
  readonly dataVersion: ProgressionRouteDataVersion;
  readonly steps: readonly ProgressionRouteStep[];
}

const STAGE_LABEL: Readonly<Record<ProgressionStage, string>> = {
  campaign: "Campaign",
  early_mapping: "Early mapping",
  atlas: "Atlas",
  endgame: "Endgame",
};
const UNKNOWN_STAGE_LABEL = "Unknown stage";

function stageLabel(stage: ProgressionStage | "unknown"): string {
  return stage === "unknown" ? UNKNOWN_STAGE_LABEL : STAGE_LABEL[stage];
}

/**
 * Build a deterministic PoE 1 route from supplied facts only.
 *
 * This builder never invents maps, drop sources, recipes, passive nodes, or
 * filter item classes. Those steps carry explicit curated-data requirements.
 */
export function buildProgressionRoute(input: ProgressionRouteInput): ProgressionRoute {
  const { build, currentBuild, progression, stash, passiveTreeData } = input;
  const dataVersion: ProgressionRouteDataVersion = {
    routeRules: POE1_ROUTE_RULES_VERSION,
    buildManifestSchema: build.schemaVersion,
    progressionSnapshot: progression.version,
    stashSnapshot: stash?.version ?? null,
    curatedData: "not-loaded",
  };
  const routeEvidence: RouteEvidence = {
    source: "route_rules",
    version: POE1_ROUTE_RULES_VERSION,
    detail: "Deterministic route ordering and exact-match rules; no curated PoE 1 content database is loaded.",
  };
  const buildEvidence = (detail: string, goal?: ItemGoal): RouteEvidence => ({
    source: "build_manifest",
    version: `build-manifest-schema-${build.schemaVersion}`,
    reference: goal ? `${build.id}/${goal.id}` : build.id,
    detail,
  });
  const progressionEvidence: RouteEvidence = {
    source: "progression_snapshot",
    version: progression.version,
    detail: `Current character stage is ${stageLabel(progression.stage)}${progression.characterLevel === undefined ? "" : ` at level ${progression.characterLevel}`}.`,
  };
  const stashEvidence: RouteEvidence | undefined = stash
    ? {
        source: "stash_snapshot",
        version: stash.version,
        detail: `League stash snapshot from ${stash.source}; item counts are exact matches against its supplied names, bases, and tags.`,
      }
    : undefined;

  const reliableBuildConfidence = buildConfidence(build);
  const progressionConfidence: RouteConfidence = progression.source === "official_character"
    ? "high"
    : progression.source === "manual"
      ? "medium"
      : "low";
  const stashConfidence: RouteConfidence = stash?.source === "official_import"
    ? "high"
    : stash?.source === "manual"
      ? "medium"
      : "low";

  const gearGoals = build.itemGoals.filter(isGearGoal).sort(compareGoals);
  const gearSteps: Omit<ProgressionRouteStep, "order">[] = gearGoals.map((goal) => {
    const target = goalLabel(goal);
    const hasExactTarget = hasExactItemTarget(goal);
    const ownedQuantity = stash && hasExactTarget ? countGoalMatches(goal, stash.items) : undefined;
    const targetQuantity = normalizedTargetQuantity(goal);
    const complete = ownedQuantity !== undefined && ownedQuantity >= targetQuantity;
    const requiredData: RouteDataRequirement[] = [];
    if (!stash) {
      requiredData.push({
        category: "personal",
        key: "league_stash_snapshot",
        description: "Sync or import the selected PoE 1 league stash before declaring this item a confirmed gap.",
      });
    }
    if (!hasExactTarget) {
      requiredData.push({
        category: "curated",
        key: "poe1_item_tag_taxonomy",
        description: "An abstract tag goal needs curated item-to-tag mappings before it can be treated as a specific gear gap.",
      });
    }
    if (reliableBuildConfidence === "low") {
      requiredData.push({
        category: "personal",
        key: "verified_build_goal",
        description: "Confirm this goal against a complete, reviewed Build Manifest.",
      });
    }
    const evidence = [
      routeEvidence,
      buildEvidence(`Goal ${goal.id}: ${goal.why ?? `${goal.kind} ${target}`} (priority ${goal.priority}).`, goal),
      progressionEvidence,
      ...(stashEvidence ? [stashEvidence] : []),
    ];
    const status = complete && requiredData.length === 0
      ? "complete"
      : requiredData.length
        ? routeStatus(requiredData)
        : "ready";
    const action = complete
      ? `The league stash snapshot already records ${ownedQuantity} ${target}; this target does not need another acquisition step.`
      : !hasExactTarget
        ? `Resolve ${target} to specific PoE 1 item identities, then compare those items with the league stash; this tag alone does not prove an exact gear gap.`
      : stash
        ? `Acquire ${Math.max(0, targetQuantity - (ownedQuantity ?? 0))} more ${target} for this build goal.`
        : `Check the selected league stash for ${target}; its availability is unknown until a stash snapshot is supplied.`;
    return {
      id: `gear-gap:${goal.id}`,
      kind: "gear_gap",
      status,
      title: complete ? `Gear target covered: ${target}` : `Close gear gap: ${target}`,
      action,
      confidence: requiredData.some((requirement) => requirement.category === "curated")
        ? "low"
        : complete
        ? minimumConfidence(reliableBuildConfidence, progressionConfidence, stashConfidence)
        : stash
          ? minimumConfidence(reliableBuildConfidence, progressionConfidence, stashConfidence)
          : "low",
      dataVersion,
      evidence,
      requiredData,
      goalId: goal.id,
      target,
      targetQuantity,
      ...(ownedQuantity !== undefined ? { ownedQuantity } : {}),
    };
  });

  const craftingGoals = build.itemGoals.filter((goal) => goal.kind === "crafting").sort(compareGoals);
  const craftingSteps: Omit<ProgressionRouteStep, "order">[] = craftingGoals.map((goal) => {
    const target = goalLabel(goal);
    const ownedQuantity = stash ? countGoalMatches(goal, stash.items) : undefined;
    const targetQuantity = normalizeExplicitQuantity(goal.targetQuantity);
    const requiredData: RouteDataRequirement[] = [
      {
        category: "curated",
        key: "poe1_crafting_recipes_and_mod_pool",
        description: "Curated PoE 1 recipe, base eligibility, and mod-pool data are needed for a safe craft sequence and material count.",
      },
    ];
    if (!stash) {
      requiredData.push({
        category: "personal",
        key: "league_stash_snapshot",
        description: "A league stash snapshot is needed to report how many stated crafting inputs are already available.",
      });
    }
    if (reliableBuildConfidence === "low") {
      requiredData.push({
        category: "personal",
        key: "verified_build_goal",
        description: "Confirm the crafting target against a complete, reviewed Build Manifest.",
      });
    }
    const status = routeStatus(requiredData);
    const stashText = stash
      ? ` The supplied snapshot records ${ownedQuantity ?? 0} matching item(s).`
      : " Stash availability is not known.";
    return {
      id: `crafting:${goal.id}`,
      kind: "crafting_plan",
      status,
      title: `Plan crafting for ${target}`,
      action: `Keep this declared base or input associated with the build. Do not assume an affix recipe, roll count, or expected result until curated PoE 1 crafting data is available.${stashText}`,
      confidence: "low",
      dataVersion,
      evidence: [
        routeEvidence,
        buildEvidence(`Goal ${goal.id}: ${goal.why ?? `crafting target ${target}`} (priority ${goal.priority}).`, goal),
        progressionEvidence,
        ...(stashEvidence ? [stashEvidence] : []),
      ],
      requiredData,
      goalId: goal.id,
      target,
      ...(targetQuantity !== undefined ? { targetQuantity } : {}),
      ...(ownedQuantity !== undefined ? { ownedQuantity } : {}),
    };
  });

  const farmingRequiredData: RouteDataRequirement[] = [{
    category: "curated",
    key: "poe1_atlas_routes_and_drop_sources",
    description: "Curated map, Atlas, boss, mechanic, and drop-source data are needed before naming a farming target.",
  }];
  if (progression.stage === "unknown") {
    farmingRequiredData.push({
      category: "personal",
      key: "current_progression_stage",
      description: "Choose the character's current progression stage before ordering farm and Atlas recommendations.",
    });
  }
  const farmingStep = makeUnknownStep({
    id: "farming-atlas:acquisition-plan",
    kind: "farming_atlas",
    title: "Choose SSF farming and Atlas targets",
    action: `Current stage: ${stageLabel(progression.stage)}. Build target stage: ${STAGE_LABEL[build.progressionStage]}. Use those as context while choosing an SSF acquisition route; this manifest does not establish a map, boss, league mechanic, or drop source.`,
    dataVersion,
    confidence: "low",
    evidence: [routeEvidence, buildEvidence(`Manifest target progression stage is ${build.progressionStage}.`), progressionEvidence],
    requiredData: farmingRequiredData,
  });

  const passiveSteps = buildPassiveTreeSteps({
    build,
    currentBuild,
    progression,
    dataVersion,
    routeEvidence,
    progressionEvidence,
    buildEvidence,
    reliableBuildConfidence,
    passiveTreeData,
  });

  const filterSteps = build.itemGoals.length
    ? [...build.itemGoals].sort(compareGoals).map((goal) => makeUnknownStep({
        id: `loot-filter:${goal.id}`,
        kind: "loot_filter_priority",
        title: `Set loot priority: ${goalLabel(goal)}`,
        action: `Queue this Build Manifest goal at semantic priority ${goal.priority} for the ${build.role} build, while preserving the existing FilterBlade/NeverSink presentation. Map the target to an exact filter rule only after curated item-class data is supplied.`,
        dataVersion,
        confidence: "low",
        evidence: [
          routeEvidence,
          buildEvidence(`Goal ${goal.id} declares ${goal.kind} priority ${goal.priority}: ${goal.why ?? goalLabel(goal)}.`, goal),
          progressionEvidence,
        ],
        requiredData: [{
          category: "curated",
          key: "poe1_filter_item_classes",
          description: "Curated PoE 1 item/base filter classes are required before exporting exact NeverSink or FilterBlade rules.",
        }],
        goalId: goal.id,
        target: goalLabel(goal),
      }))
    : [makeUnknownStep({
        id: "loot-filter:no-build-goals",
        kind: "loot_filter_priority",
        title: "Add build goals before setting loot priorities",
        action: "Add explicit item, base, crafting, or progression goals to the Build Manifest before creating semantic loot-filter priorities.",
        dataVersion,
        confidence: "low",
        evidence: [routeEvidence, buildEvidence("The Build Manifest contains no item goals."), progressionEvidence],
        requiredData: [{
          category: "personal",
          key: "build_item_goals",
          description: "The player needs to confirm the target items or crafting goals for this build.",
        }],
      })];

  const ordered: Omit<ProgressionRouteStep, "order">[] = [
    ...gearSteps,
    ...craftingSteps,
    farmingStep,
    ...passiveSteps,
    ...filterSteps,
  ];
  const steps = ordered.map((step, index): ProgressionRouteStep => ({ ...step, order: index + 1 }));
  return {
    schemaVersion: 1,
    game: "poe1",
    rulesVersion: POE1_ROUTE_RULES_VERSION,
    build: { id: build.id, name: build.name, role: build.role },
    currentStage: progression.stage,
    targetStage: build.progressionStage,
    dataVersion,
    steps,
  };
}

function makeUnknownStep(input: Omit<ProgressionRouteStep, "order" | "status" | "requiredData"> & {
  readonly requiredData: readonly RouteDataRequirement[];
}): Omit<ProgressionRouteStep, "order"> {
  return {
    ...input,
    status: routeStatus(input.requiredData),
  };
}

function routeStatus(requiredData: readonly RouteDataRequirement[]): ProgressionRouteStepStatus {
  const hasPersonal = requiredData.some((item) => item.category === "personal");
  const hasCurated = requiredData.some((item) => item.category === "curated");
  if (hasPersonal && hasCurated) return "needs_personal_and_curated_data";
  if (hasPersonal) return "needs_personal_data";
  if (hasCurated) return "needs_curated_data";
  return "ready";
}

function buildPassiveTreeSteps(input: {
  readonly build: BuildManifest;
  readonly currentBuild?: BuildManifest;
  readonly progression: RouteProgressionSnapshot;
  readonly dataVersion: ProgressionRouteDataVersion;
  readonly routeEvidence: RouteEvidence;
  readonly progressionEvidence: RouteEvidence;
  readonly buildEvidence: (detail: string, goal?: ItemGoal) => RouteEvidence;
  readonly reliableBuildConfidence: RouteConfidence;
  readonly passiveTreeData?: PassiveTreeDataset | null;
}): Omit<ProgressionRouteStep, "order">[] {
  const {
    build,
    currentBuild: suppliedCurrentBuild,
    progression,
    dataVersion,
    routeEvidence,
    progressionEvidence,
    buildEvidence,
    reliableBuildConfidence,
    passiveTreeData,
  } = input;
  const currentBuild = suppliedCurrentBuild?.role === "ACTIVE"
    ? suppliedCurrentBuild
    : build.role === "ACTIVE"
      ? build
      : undefined;
  const currentSpec = activePassiveSpec(currentBuild);
  const targetSpecs = [...(build.passiveSpecs ?? [])].sort((left, right) => left.id - right.id);

  if (!targetSpecs.length) {
    return [makeUnknownStep({
      id: "passive-tree:milestones",
      kind: "passive_tree",
      title: "Set passive-tree milestones",
      action: passiveMilestoneText(build, progression),
      dataVersion,
      confidence: "low",
      evidence: [routeEvidence, buildEvidence(passiveSpecEvidence(build)), progressionEvidence],
      requiredData: [
        {
          category: "curated",
          key: "poe1_passive_tree_node_data",
          description: "PoE 1 passive node identities and build milestones are required to recommend specific allocations.",
        },
        {
          category: "personal",
          key: "current_character_passive_nodes",
          description: "Current character node IDs are required to compare the planned tree with the selected character.",
        },
      ],
    })];
  }

  return targetSpecs.map((targetSpec) => {
    const targetName = targetSpec.name?.trim() || `Spec ${targetSpec.id}`;
    const targetVersion = targetSpec.treeVersion?.trim();
    const currentVersion = currentSpec?.treeVersion?.trim();
    const comparison: NonNullable<ProgressionRouteStep["passiveTree"]>["comparison"] = !currentSpec
      ? "missing_current"
      : !targetVersion || !currentVersion
        ? "version_unknown"
        : targetVersion === currentVersion
          ? "compared"
          : "version_mismatch";
    const targetNodeIds = normalizedNodeIds(targetSpec.allocatedNodeIds);
    const currentNodeIds = normalizedNodeIds(currentSpec?.allocatedNodeIds ?? []);
    const targetNodeSet = new Set(targetNodeIds);
    const currentNodeSet = new Set(currentNodeIds);
    const addedNodeIds = comparison === "compared"
      ? targetNodeIds.filter((nodeId) => !currentNodeSet.has(nodeId))
      : undefined;
    const removedNodeIds = comparison === "compared"
      ? currentNodeIds.filter((nodeId) => !targetNodeSet.has(nodeId))
      : undefined;
    const hasNodeDifference = Boolean(addedNodeIds?.length || removedNodeIds?.length);
    const canResolveNodeNames = comparison === "compared"
      && hasNodeDifference
      && Boolean(targetVersion)
      && passiveTreeData?.treeVersion === targetVersion;
    const factsFor = (nodeIds: readonly number[] | undefined): PassiveNodeFact[] | undefined => {
      if (!canResolveNodeNames || !nodeIds || !passiveTreeData) return undefined;
      return nodeIds.map((nodeId) => passiveTreeData.nodes[String(nodeId)] ?? { id: nodeId, stats: [] });
    };
    const addedNodes = factsFor(addedNodeIds);
    const removedNodes = factsFor(removedNodeIds);
    const requiredData: RouteDataRequirement[] = [];

    if (comparison === "missing_current") {
      requiredData.push({
        category: "personal",
        key: "current_character_passive_nodes",
        description: "Import or save an ACTIVE PoB tree so exact target/current node IDs can be compared.",
      });
    } else if (comparison === "version_mismatch" || comparison === "version_unknown") {
      requiredData.push({
        category: "curated",
        key: "poe1_passive_tree_version_compatibility",
        description: "Matching versioned PoE 1 passive-tree data is needed before comparing node IDs across these specs.",
      });
    }

    const passiveTree = {
      specId: targetSpec.id,
      specName: targetName,
      ...(targetVersion ? { treeVersion: targetVersion } : {}),
      targetNodeCount: targetNodeIds.length,
      comparison,
      ...(currentSpec ? {
        baselineSpecName: currentSpec.name?.trim() || `Spec ${currentSpec.id}`,
        ...(currentVersion ? { baselineTreeVersion: currentVersion } : {}),
      } : {}),
      ...(addedNodeIds ? { addedNodeIds } : {}),
      ...(removedNodeIds ? { removedNodeIds } : {}),
      ...(addedNodes ? { addedNodes } : {}),
      ...(removedNodes ? { removedNodes } : {}),
    } satisfies NonNullable<ProgressionRouteStep["passiveTree"]>;
    const aligned = comparison === "compared" && addedNodeIds?.length === 0 && removedNodeIds?.length === 0;
    const namedAdded = addedNodes?.filter((node) => node.name || node.stats.length > 0) ?? [];
    const namedRemoved = removedNodes?.filter((node) => node.name || node.stats.length > 0) ?? [];
    const addedSummary = addedNodeIds?.length
      ? `additions such as ${namedAdded.slice(0, 3).map(passiveNodeLabel).join(", ") || "unmapped nodes"}`
      : "no target additions";
    const removedSummary = removedNodeIds?.length
      ? `omitted ACTIVE nodes such as ${namedRemoved.slice(0, 3).map(passiveNodeLabel).join(", ") || "unmapped nodes"}`
      : "no ACTIVE nodes omitted";
    const nodeSummary = canResolveNodeNames
      ? ` Matching local tree data identifies ${addedSummary} and ${removedSummary}. This is an allocation set difference, not an ordered leveling path.`
      : "";
    const action = comparison === "compared"
      ? aligned
        ? `This target PoB spec exactly matches the ACTIVE spec “${passiveTree.baselineSpecName}” by node ID in tree ${targetVersion}. The route preserves the saved spec; it does not independently rank or optimize passives.`
        : `Load the target spec in Path of Building and review its allocation difference from ACTIVE “${passiveTree.baselineSpecName}” in tree ${targetVersion}: add ${addedNodeIds?.length ?? 0} node IDs and review ${removedNodeIds?.length ?? 0} ACTIVE nodes omitted by the target.${nodeSummary} The route does not estimate respec cost or optimize nodes.`
      : comparison === "missing_current"
        ? `Load this saved PoB spec in Path of Building: ${targetName} (${targetVersion ?? "tree version not recorded"}, ${targetNodeIds.length} allocated node IDs). The target tree is preserved, but no current-tree gap is claimed without an ACTIVE node snapshot.`
        : `Load this saved PoB spec in Path of Building: ${targetName} (${targetVersion ?? "tree version not recorded"}, ${targetNodeIds.length} allocated node IDs). The target is exact source data, but its node IDs are not compared because the ACTIVE and target tree versions are missing or differ.`;
    const currentBuildEvidence: RouteEvidence[] = currentBuild && currentSpec
      ? [{
          source: "build_manifest",
          version: `build-manifest-schema-${currentBuild.schemaVersion}`,
          reference: currentBuild.id,
          detail: `ACTIVE baseline spec ${passiveTree.baselineSpecName ?? "unknown"} uses tree ${currentVersion ?? "unknown"} with ${currentNodeIds.length} node IDs.`,
        }]
      : [];
    const treeDataEvidence: RouteEvidence[] = canResolveNodeNames && passiveTreeData
      ? [{
          source: "local_tree_export",
          version: passiveTreeData.treeVersion,
          reference: passiveTreeData.sourceFile,
          detail: "Node names and stat descriptions were resolved from a player-selected local tree export. Its patch version was confirmed by the player because the export file does not declare it.",
        }]
      : [];

    return {
      id: `passive-tree:spec-${targetSpec.id}`,
      kind: "passive_tree",
      status: comparison === "compared"
        ? aligned ? "already_aligned" : "ready"
        : routeStatus(requiredData),
      title: `PoB tree spec: ${targetName}`,
      action,
      confidence: comparison === "compared"
        ? minimumConfidence(reliableBuildConfidence, buildConfidence(currentBuild ?? build))
        : "low",
      dataVersion,
      evidence: [
        routeEvidence,
        buildEvidence(`Target PoB spec ${targetName} uses tree ${targetVersion ?? "unknown"} with ${targetNodeIds.length} unique node IDs. It is preserved source data, not a newly generated passive path.`),
        ...currentBuildEvidence,
        ...treeDataEvidence,
        progressionEvidence,
      ],
      requiredData,
      target: targetName,
      passiveTree,
    };
  });
}

function passiveNodeLabel(node: PassiveNodeFact): string {
  return node.name ?? node.stats[0] ?? `node ${node.id}`;
}

function activePassiveSpec(build: BuildManifest | undefined) {
  const specs = build?.passiveSpecs ?? [];
  return specs.find((spec) => spec.isActive) ?? (specs.length === 1 ? specs[0] : undefined);
}

function normalizedNodeIds(nodeIds: readonly number[]): number[] {
  return [...new Set(nodeIds.filter((nodeId) => Number.isSafeInteger(nodeId) && nodeId > 0))]
    .sort((left, right) => left - right);
}

function passiveMilestoneText(build: BuildManifest, progression: RouteProgressionSnapshot): string {
  if (build.passiveSpecs?.length) {
    const specs = build.passiveSpecs.map((spec) =>
      `${spec.name || `Spec ${spec.id}`} (${spec.treeVersion ?? "tree version not recorded"}, ${spec.allocatedNodeIds.length} node IDs)`,
    );
    return `The target PoB contains these saved passive specs: ${specs.join("; ")}. Use them as imported tree milestones. Current character node IDs and matching versioned tree data are needed before calculating the missing nodes or proposing a new path.`;
  }
  const planned = build.passiveAllocationCount;
  const current = progression.passiveAllocationCount;
  if (planned !== undefined && current !== undefined) {
    return `The manifest records ${planned} unique allocated node IDs and the current character snapshot records ${current}. Counts alone cannot identify missing nodes; load node-level tree data before proposing milestones.`;
  }
  if (planned !== undefined) {
    return `The manifest records ${planned} unique allocated node IDs. The current character node list and node-level tree data are needed before proposing milestones.`;
  }
  return "The manifest does not include an allocation list. Load target and current node-level tree data before proposing milestones.";
}

function passiveSpecEvidence(build: BuildManifest): string {
  if (!build.passiveSpecs?.length) {
    return build.passiveAllocationCount === undefined
      ? "The Build Manifest has no active passive allocation count."
      : `The active PoB Spec reports ${build.passiveAllocationCount} unique allocated node IDs; node identities are not included.`;
  }
  const specs = build.passiveSpecs.map((spec) =>
    `${spec.name || `Spec ${spec.id}`} uses tree ${spec.treeVersion ?? "unknown"} with ${spec.allocatedNodeIds.length} node IDs`,
  );
  return `Imported PoB tree facts: ${specs.join("; ")}. These are source allocations, not an SSF-optimized route.`;
}

function isGearGoal(goal: ItemGoal): boolean {
  return goal.kind === "equip" || goal.kind === "upgrade" || (goal.kind === "crafting" && Boolean(goal.match.baseTypes?.length));
}

function hasExactItemTarget(goal: ItemGoal): boolean {
  return Boolean(
    goal.match.itemNames?.some((value) => value.trim().length > 0) ||
    goal.match.baseTypes?.some((value) => value.trim().length > 0),
  );
}

function compareGoals(left: ItemGoal, right: ItemGoal): number {
  return right.priority - left.priority || left.id.localeCompare(right.id);
}

function goalLabel(goal: ItemGoal): string {
  const names = unique([...goal.match.itemNames ?? [], ...goal.match.baseTypes ?? []]);
  if (names.length) return names.join(" / ");
  const tags = unique(goal.match.anyTags ?? []);
  return tags.length ? `items tagged ${tags.join(" or ")}` : `unspecified ${goal.kind} target`;
}

function normalizedTargetQuantity(goal: ItemGoal): number {
  return normalizeExplicitQuantity(goal.targetQuantity) ?? 1;
}

function normalizeExplicitQuantity(quantity: number | undefined): number | undefined {
  if (quantity === undefined || !Number.isFinite(quantity)) return undefined;
  return Math.max(1, Math.floor(quantity));
}

function countGoalMatches(goal: ItemGoal, items: readonly RouteStashItem[]): number {
  return items.reduce((total, item) => {
    if (!goalMatchesItem(goal, item)) return total;
    const quantity = Number.isFinite(item.quantity) ? Math.max(0, Math.floor(item.quantity)) : 0;
    return total + quantity;
  }, 0);
}

function goalMatchesItem(goal: ItemGoal, item: RouteStashItem): boolean {
  const normalize = poe1Provider.normalizeItemIdentity;
  const itemName = normalize(item.name);
  const baseType = normalize(item.baseType ?? "");
  const named = (goal.match.itemNames ?? []).some((value) => {
    const target = normalize(value);
    return target === itemName || target === baseType;
  });
  const based = (goal.match.baseTypes ?? []).some((value) => {
    const target = normalize(value);
    return target === baseType || target === itemName;
  });
  const itemTags = new Set((item.tags ?? []).map(normalize));
  const tagged = (goal.match.anyTags ?? []).some((tag) => itemTags.has(normalize(tag)));
  return named || based || tagged;
}

function buildConfidence(build: BuildManifest): RouteConfidence {
  if (build.source.importState === "partial" || build.source.kind === "sample" || build.confidence === "low") return "low";
  if (build.confidence === "high") return "high";
  return "medium";
}

function minimumConfidence(...values: readonly RouteConfidence[]): RouteConfidence {
  if (values.includes("low")) return "low";
  if (values.includes("medium")) return "medium";
  return "high";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
