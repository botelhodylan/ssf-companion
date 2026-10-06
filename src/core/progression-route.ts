import { poe1Provider } from "./game-provider";
import { countStashMatches, type StashCoverage } from "./stash-snapshot";
import { orderPassiveTreeAllocations, type PassiveNodeFact, type PassiveTreeDataset } from "./passive-tree-data";
import { acquisitionRoutesForGoal, craftPlanForGoal, mechanicPlanById, progressionPlansForBuild, type Poe1ProgressionCheckpoint, type Poe1RouteKnowledgePack, type Poe1RouteKnowledgePlan } from "./poe1-route-pack";
import type { BuildManifest, BuildRole, BuildSkillGroup, EquipmentItemDetailFacts, EquippedItemFact, ItemGoal, ProgressionStage } from "./types";

export const POE1_ROUTE_RULES_VERSION = "poe1-route-v1.9.0" as const;

export type RouteEvidenceSource =
  | "route_rules"
  | "build_manifest"
  | "progression_snapshot"
  | "player_annotation"
  | "stash_snapshot"
  | "local_tree_export"
  | "route_knowledge_pack";

export type RouteConfidence = "high" | "medium" | "low";

export type ProgressionRouteStepKind =
  | "gear_gap"
  | "equipment_comparison"
  | "skill_transition"
  | "progression_checkpoint"
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
  /** Deterministic graph traversal from retained nodes or the class start. */
  readonly allocationOrder?: readonly PassiveNodeFact[];
  /** Display-only groups of at most ten nodes from the deterministic traversal. */
  readonly allocationCheckpoints?: readonly PassiveTreeAllocationCheckpoint[];
  readonly allocationOrderStatus: "complete" | "partial" | "unavailable";
  readonly allocationOrderMissingNodeIds?: readonly number[];
  readonly allocationOrderNote: string;
}

export interface PassiveTreeAllocationCheckpoint {
  readonly number: number;
  readonly firstNodeIndex: number;
  readonly lastNodeIndex: number;
  readonly nodes: readonly PassiveNodeFact[];
}

export interface EquipmentSlotComparison {
  readonly slotName: string;
  readonly relation: "changed" | "active_only" | "target_only" | "unresolved";
  readonly activeItem?: {
    readonly label: string;
    readonly rarity?: string;
    readonly baseType?: string;
  } & EquipmentItemDetailFacts;
  readonly targetItem?: {
    readonly label: string;
    readonly rarity?: string;
    readonly baseType?: string;
  } & EquipmentItemDetailFacts;
}

export interface SkillTransitionComparison {
  readonly mainSkillChanged: boolean;
  readonly activeMainSkill?: string;
  readonly targetMainSkill?: string;
  readonly activeSupportGems: readonly string[];
  readonly targetSupportGems: readonly string[];
  readonly addedSupportGems: readonly string[];
  readonly removedSupportGems: readonly string[];
}

export interface ProgressionCheckpointDetail extends Omit<Poe1ProgressionCheckpoint, "sourceIds"> {
  readonly sourceIds?: readonly string[];
  readonly planName: string;
  readonly isNextCheckpoint: boolean;
  readonly origin: "route_pack" | "pob_spec_annotation";
}

export interface PassiveSpecLevelAssignment {
  readonly specId: number;
  readonly level: number;
}

export interface RouteEvidence {
  readonly source: RouteEvidenceSource;
  readonly version: string;
  readonly reference?: string;
  readonly detail: string;
  readonly url?: string;
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
  /** ID of the imported league-scoped /atlaspassives summary, when present. */
  readonly atlasProgressSnapshot: string | null;
  /** "not-loaded" or the ID and patch of an imported local knowledge pack. */
  readonly curatedData: string;
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
  /** Bounded imported item facts compared between saved ACTIVE and target PoB sets only. */
  readonly equipmentComparison?: EquipmentSlotComparison;
  /** Main skill/support names compared between saved ACTIVE and target PoB groups. */
  readonly skillTransition?: SkillTransitionComparison;
  /** One sourced, build-matched level checkpoint from a local route pack. */
  readonly progressionCheckpoint?: ProgressionCheckpointDetail;
  /** Exact node IDs and optional names resolved from a matching local tree export. */
  readonly passiveTree?: PassiveTreeComparison;
  /** Exact route facts supplied by a local, version-pinned PoE 1 knowledge pack. */
  readonly knowledgePlan?: Poe1RouteKnowledgePlan;
}

export interface RouteProgressionSnapshot {
  readonly stage: ProgressionStage | "unknown";
  readonly version: string;
  readonly source: "official_character" | "manual" | "demo" | "unknown";
  readonly characterLevel?: number;
  /** Count only; it is not enough to infer which passive nodes are missing. */
  readonly passiveAllocationCount?: number;
  /** Manual league-scoped summary; source labels are not interpreted as advice. */
  readonly atlasProgress?: {
    readonly version: string;
    readonly totalPoints: number;
    readonly allocatedPoints: number;
  };
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
  /** Partial snapshots prove only listed counts; absence remains unknown. */
  readonly coverage?: StashCoverage;
  /** Aggregate duplicates across tabs before passing the snapshot. */
  readonly items: readonly RouteStashItem[];
}

export interface ProgressionRouteInput {
  readonly build: BuildManifest;
  /** ACTIVE PoB snapshot used for passive-node and visible equipment-fact comparisons. */
  readonly currentBuild?: BuildManifest;
  readonly progression: RouteProgressionSnapshot;
  readonly stash?: RouteStashSnapshot | null;
  readonly passiveTreeData?: PassiveTreeDataset | null;
  readonly routeKnowledgePack?: Poe1RouteKnowledgePack | null;
  /** Player-assigned level labels for imported target PoB passive specs. */
  readonly passiveSpecLevels?: readonly PassiveSpecLevelAssignment[];
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

const PASSIVE_TREE_CHECKPOINT_SIZE = 10;

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
 * filter item classes. Exact farming and craft plans come only from a loaded,
 * patch-versioned player-selected knowledge pack.
 */
export function buildProgressionRoute(input: ProgressionRouteInput): ProgressionRoute {
  const { build, currentBuild, progression, stash, passiveTreeData, routeKnowledgePack, passiveSpecLevels } = input;
  const dataVersion: ProgressionRouteDataVersion = {
    routeRules: POE1_ROUTE_RULES_VERSION,
    buildManifestSchema: build.schemaVersion,
    progressionSnapshot: progression.version,
    stashSnapshot: stash?.version ?? null,
    atlasProgressSnapshot: progression.atlasProgress?.version ?? null,
    curatedData: routeKnowledgePack ? `${routeKnowledgePack.id}@${routeKnowledgePack.contentVersion}` : "not-loaded",
  };
  const routeEvidence: RouteEvidence = {
    source: "route_rules",
    version: POE1_ROUTE_RULES_VERSION,
    detail: routeKnowledgePack
      ? `Deterministic route rules with local PoE 1 pack ${routeKnowledgePack.name} (${routeKnowledgePack.contentVersion}); verify its cited sources before acting.`
      : "Deterministic route ordering and exact-match rules; no curated PoE 1 content pack is loaded.",
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
    detail: `Current character stage is ${stageLabel(progression.stage)}${progression.characterLevel === undefined ? "" : ` at level ${progression.characterLevel}`}.${progression.atlasProgress ? ` The selected league's manually imported /atlaspassives summary records ${progression.atlasProgress.totalPoints} Atlas points earned and ${progression.atlasProgress.allocatedPoints} allocated; source labels are preserved as report text and are not mapped to recommendations.` : ""}`,
  };
  const stashEvidence: RouteEvidence | undefined = stash
    ? {
        source: "stash_snapshot",
        version: stash.version,
        detail: "League stash snapshot from " + stash.source + " (" + (stash.coverage ?? "complete") + " coverage); item counts are exact matches against its supplied names, bases, and tags.",
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
  const packEvidence = (sourceIds: readonly string[], entryId: string): RouteEvidence[] => {
    if (!routeKnowledgePack) return [];
    const sourceById = new Map(routeKnowledgePack.sources.map((source) => [source.id, source]));
    return sourceIds.flatMap((sourceId) => {
      const source = sourceById.get(sourceId);
      return source ? [{
        source: "route_knowledge_pack" as const,
        version: `${routeKnowledgePack.id}@${routeKnowledgePack.contentVersion}`,
        reference: `${entryId}/${source.id}`,
        detail: `${source.title}${source.checkedOn ? ` (checked ${source.checkedOn})` : ""}: ${source.url}`,
        url: source.url,
      }] : [];
    });
  };

  const progressionCheckpointSteps = buildProgressionCheckpointSteps({
    build,
    progression,
    plans: progressionPlansForBuild(build, routeKnowledgePack),
    passiveSpecLevels: passiveSpecLevels ?? [],
    dataVersion,
    routeEvidence,
    progressionEvidence,
    buildEvidence,
    packEvidence,
  });

  const gearGoals = build.itemGoals.filter(isGearGoal).sort(compareGoals);
  const gearSteps: Omit<ProgressionRouteStep, "order">[] = gearGoals.map((goal) => {
    const target = goalLabel(goal);
    const hasExactTarget = hasExactItemTarget(goal);
    const ownedQuantity = stash && hasExactTarget ? countGoalMatches(goal, stash) : undefined;
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
    if (stash?.coverage === "partial" && !complete) {
      requiredData.push({
        category: "personal",
        key: "complete_league_stash_snapshot",
        description: "This partial stash snapshot may omit copies. Import a complete snapshot or check the remaining tabs before treating the rest as a confirmed gap.",
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
        : stash?.coverage === "partial"
          ? ownedQuantity === undefined
            ? "The partial stash snapshot does not list " + target + ". Check the remaining tabs or import a complete snapshot before treating it as missing."
            : "The partial stash snapshot lists " + ownedQuantity + " " + target + ". Check the remaining tabs or import a complete snapshot before treating the remaining amount as missing."
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

  const equipmentComparisonSteps = buildEquipmentComparisonSteps({
    build,
    currentBuild,
    dataVersion,
    routeEvidence,
    progressionEvidence,
  });
  const skillTransitionSteps = buildSkillTransitionSteps({
    build,
    currentBuild,
    dataVersion,
    routeEvidence,
    progressionEvidence,
  });

  const craftingGoals = build.itemGoals.filter((goal) => goal.kind === "crafting").sort(compareGoals);
  const craftingSteps: Omit<ProgressionRouteStep, "order">[] = craftingGoals.map((goal) => {
    const target = goalLabel(goal);
    const ownedQuantity = stash ? countGoalMatches(goal, stash) : undefined;
    const targetQuantity = normalizeExplicitQuantity(goal.targetQuantity);
    const craftPlan = craftPlanForGoal(goal, routeKnowledgePack);
    const requiredData: RouteDataRequirement[] = craftPlan ? [] : [{
      category: "curated",
      key: "poe1_crafting_recipes_and_mod_pool",
      description: "Import a patch-versioned PoE 1 route pack with a source-backed craft plan for this exact item or base.",
    }];
    if (!stash) requiredData.push({
      category: "personal",
      key: "league_stash_snapshot",
      description: craftPlan
        ? "A league stash snapshot is needed to compare the craft materials with items already owned."
        : "A league stash snapshot is needed to report whether the target base or crafting input is already available.",
    });
    if (stash?.coverage === "partial" && (ownedQuantity === undefined || (targetQuantity !== undefined && ownedQuantity < targetQuantity))) {
      requiredData.push({
        category: "personal",
        key: "complete_league_stash_snapshot",
        description: "This partial stash snapshot may omit the target or crafting inputs. Import a complete snapshot or check the remaining tabs before deciding what is missing.",
      });
    }
    if (reliableBuildConfidence === "low") {
      requiredData.push({
        category: "personal",
        key: "verified_build_goal",
        description: "Confirm the crafting target against a complete, reviewed Build Manifest.",
      });
    }
    const materials = craftPlan?.materials.map((material) => {
      const ownedMaterial = stash
        ? countStashMatches(stash, { names: [material.name] })
        : undefined;
      if (stash?.coverage === "partial" && (ownedMaterial === undefined || ownedMaterial < material.quantity)) {
        if (!requiredData.some((requirement) => requirement.key === "complete_league_stash_snapshot")) {
          requiredData.push({
            category: "personal",
            key: "complete_league_stash_snapshot",
            description: "This partial stash snapshot may omit crafting inputs. Import a complete snapshot or check the remaining tabs before deciding what is missing.",
          });
        }
      }
      return { ...material, ...(ownedMaterial === undefined ? {} : { ownedQuantity: ownedMaterial }) };
    });
    const knowledgePlan: Poe1RouteKnowledgePlan | undefined = craftPlan ? {
      heading: craftPlan.title,
      stage: craftPlan.stage,
      baseType: craftPlan.baseType,
      ...(craftPlan.requiredItemLevel ? { requiredItemLevel: craftPlan.requiredItemLevel } : {}),
      prerequisites: craftPlan.prerequisites,
      materials,
      steps: craftPlan.steps,
      stopCondition: craftPlan.stopCondition,
    } : undefined;
    const status = requiredData.length ? routeStatus(requiredData) : "ready";
    const stashText = stash
      ? stash.coverage === "partial"
        ? ownedQuantity === undefined
          ? " The partial snapshot does not list this target; other tabs may contain it."
          : " The partial snapshot lists at least " + ownedQuantity + " matching item(s)."
        : " The complete supplied snapshot records " + (ownedQuantity ?? 0) + " matching item(s)."
      : " Stash availability is not known.";
    const coveredMaterialTypes = materials?.filter((material) =>
      material.ownedQuantity !== undefined && material.ownedQuantity >= material.quantity,
    ).length ?? 0;
    const craftAction = craftPlan
      ? "Use " + craftPlan.baseType +
        (craftPlan.requiredItemLevel ? " at item level " + craftPlan.requiredItemLevel + " or higher" : "") +
        ". Follow the imported " + (routeKnowledgePack?.contentVersion ?? "route-pack") +
        " sequence and stop condition; inspect the cited sources before crafting." +
        (stash
          ? stash.coverage === "partial"
            ? " The partial snapshot lists " + coveredMaterialTypes + "/" + (materials?.length ?? 0) +
              " material types at the required counts; other tabs may contain unlisted inputs."
            : " The complete snapshot has " + coveredMaterialTypes + "/" + (materials?.length ?? 0) +
              " material types at the required counts."
          : " Material availability is unknown until stash data is added.")
      : "Keep this declared base or input associated with the build. Do not assume an affix recipe, roll count, or expected result until a source-backed PoE 1 craft plan is imported." + stashText;
    return {
      id: `crafting:${goal.id}`,
      kind: "crafting_plan",
      status,
      title: `Plan crafting for ${target}`,
      action: craftAction,
      confidence: "low",
      dataVersion,
      evidence: [
        routeEvidence,
        buildEvidence(`Goal ${goal.id}: ${goal.why ?? `crafting target ${target}`} (priority ${goal.priority}).`, goal),
        progressionEvidence,
        ...(stashEvidence ? [stashEvidence] : []),
        ...(craftPlan ? packEvidence(craftPlan.sourceIds, craftPlan.id) : []),
      ],
      requiredData,
      ...(knowledgePlan ? { knowledgePlan } : {}),
      goalId: goal.id,
      target,
      ...(targetQuantity !== undefined ? { targetQuantity } : {}),
      ...(ownedQuantity !== undefined ? { ownedQuantity } : {}),
    };
  });

  const acquisitionSteps: Omit<ProgressionRouteStep, "order">[] = gearGoals.flatMap((goal) =>
    acquisitionRoutesForGoal(goal, routeKnowledgePack).map((route) => {
      const mechanicPlan = mechanicPlanById(route.mechanicPlanId, routeKnowledgePack);
      const requiredData: RouteDataRequirement[] = progression.stage === "unknown" ? [{
        category: "personal",
        key: "current_progression_stage",
        description: "Confirm the character's progression stage before using a staged farming route.",
      }] : [];
      const knowledgePlan: Poe1RouteKnowledgePlan = {
        heading: route.title,
        stage: route.stage,
        steps: route.steps,
        ...(route.atlasTreeName ? { atlasTreeName: route.atlasTreeName } : {}),
        ...(route.atlasNodeNames ? { atlasNodeNames: route.atlasNodeNames } : {}),
        ...(route.atlasShareUrl || mechanicPlan?.atlasShareUrl ? { atlasShareUrl: route.atlasShareUrl ?? mechanicPlan?.atlasShareUrl } : {}),
        ...(!route.atlasTreeName && mechanicPlan?.atlasTreeName ? { atlasTreeName: mechanicPlan.atlasTreeName } : {}),
        ...(!route.atlasNodeNames && mechanicPlan?.atlasNodeNames ? { atlasNodeNames: mechanicPlan.atlasNodeNames } : {}),
        ...(mechanicPlan ? { mechanicPlaybook: {
          mechanicId: mechanicPlan.mechanicId,
          name: mechanicPlan.name,
          objective: mechanicPlan.objective,
          prerequisites: mechanicPlan.prerequisites,
          setupSteps: mechanicPlan.setupSteps,
          executionSteps: mechanicPlan.executionSteps,
          decisionRules: mechanicPlan.decisionRules,
          stopCondition: mechanicPlan.stopCondition,
        } } : {}),
      };
      return {
        id: `farming-atlas:${goal.id}:${route.id}`,
        kind: "farming_atlas" as const,
        status: requiredData.length ? "needs_personal_data" as const : "ready" as const,
        title: `Target ${route.method.replaceAll("_", " ")}: ${route.title}`,
        action: `Use this ${route.method.replaceAll("_", " ")} route for ${goalLabel(goal)}. The method and steps come from a local ${routeKnowledgePack?.contentVersion} pack; review the source before planning around it.${mechanicPlan ? ` Follow the ${mechanicPlan.name} playbook and its decision rules.` : ""}`,
        confidence: "low" as const,
        dataVersion,
        evidence: [
          routeEvidence,
          buildEvidence(`Goal ${goal.id}: ${goal.why ?? goalLabel(goal)} (priority ${goal.priority}).`, goal),
          progressionEvidence,
          ...packEvidence(route.sourceIds, route.id),
          ...(mechanicPlan ? packEvidence(mechanicPlan.sourceIds, mechanicPlan.id) : []),
        ],
        requiredData,
        goalId: goal.id,
        target: goalLabel(goal),
        knowledgePlan,
      };
    }),
  );
  const matchedAcquisitionGoalIds = new Set(acquisitionSteps.flatMap((step) => step.goalId ? [step.goalId] : []));
  const uncoveredGearGoals = gearGoals.filter((goal) => !matchedAcquisitionGoalIds.has(goal.id));
  const farmingRequiredData: RouteDataRequirement[] = uncoveredGearGoals.length || !gearGoals.length ? [{
    category: "curated",
    key: "poe1_atlas_routes_and_drop_sources",
    description: "Import a source-backed PoE 1 route pack for the remaining exact gear goals before naming a farm, boss, mechanic, or Atlas tree.",
  }] : [];
  if (progression.stage === "unknown") {
    farmingRequiredData.push({
      category: "personal",
      key: "current_progression_stage",
      description: "Choose the character's current progression stage before ordering farm and Atlas recommendations.",
    });
  }
  const farmingStep = uncoveredGearGoals.length || !gearGoals.length ? makeUnknownStep({
    id: "farming-atlas:acquisition-plan",
    kind: "farming_atlas",
    title: "Plan remaining SSF farming and Atlas targets",
    action: `Current stage: ${stageLabel(progression.stage)}. Build target stage: ${STAGE_LABEL[build.progressionStage]}. ${uncoveredGearGoals.length ? `No exact local acquisition route matches ${uncoveredGearGoals.map(goalLabel).join(", ")}.` : "Add exact gear targets to connect this build to acquisition routes."} The app does not infer a map, boss, league mechanic, drop source, or Atlas tree.`,
    dataVersion,
    confidence: "low",
    evidence: [routeEvidence, buildEvidence(`Manifest target progression stage is ${build.progressionStage}.`), progressionEvidence],
    requiredData: farmingRequiredData,
  }) : undefined;

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
    ...progressionCheckpointSteps,
    ...gearSteps,
    ...equipmentComparisonSteps,
    ...skillTransitionSteps,
    ...craftingSteps,
    ...acquisitionSteps,
    ...(farmingStep ? [farmingStep] : []),
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

function buildEquipmentComparisonSteps(input: {
  readonly build: BuildManifest;
  readonly currentBuild?: BuildManifest;
  readonly dataVersion: ProgressionRouteDataVersion;
  readonly routeEvidence: RouteEvidence;
  readonly progressionEvidence: RouteEvidence;
}): Omit<ProgressionRouteStep, "order">[] {
  const { build, currentBuild, dataVersion, routeEvidence, progressionEvidence } = input;
  if (
    build.role === "ACTIVE" ||
    currentBuild?.role !== "ACTIVE" ||
    currentBuild.id === build.id ||
    !currentBuild.equippedItems?.length ||
    !build.equippedItems?.length
  ) return [];

  const activeSlots = groupEquippedItemsBySlot(currentBuild.equippedItems);
  const targetSlots = groupEquippedItemsBySlot(build.equippedItems);
  const slotKeys = [...new Set([...activeSlots.keys(), ...targetSlots.keys()])].sort();
  const steps: Omit<ProgressionRouteStep, "order">[] = [];

  for (const slotKey of slotKeys) {
    const activeItems = activeSlots.get(slotKey) ?? [];
    const targetItems = targetSlots.get(slotKey) ?? [];
    const sample = activeItems[0] ?? targetItems[0];
    const slotBaseName = sample?.slotName.trim() || slotKey;
    const itemCount = Math.max(activeItems.length, targetItems.length);
    for (let index = 0; index < itemCount; index += 1) {
      const activeItem = activeItems[index];
      const targetItem = targetItems[index];
      const visibleRelation = activeItem && targetItem
        ? compareVisibleEquipmentIdentity(activeItem, targetItem)
        : undefined;
      if (visibleRelation === "same") continue;

      const slotName = itemCount > 1 ? `${slotBaseName} (${index + 1})` : slotBaseName;
      const relation: EquipmentSlotComparison["relation"] = activeItem && targetItem
        ? visibleRelation ?? "unresolved"
        : activeItem
          ? "active_only"
          : "target_only";
      const activeFact = activeItem ? equipmentItemSummary(activeItem) : undefined;
      const targetFact = targetItem ? equipmentItemSummary(targetItem) : undefined;
      const activeLabel = activeFact?.label ?? "No parsed item in ACTIVE PoB";
      const targetLabel = targetFact?.label ?? "No parsed item in target PoB";
      const action = relation === "changed"
        ? `The ACTIVE PoB records ${activeLabel} in ${slotName}; the target PoB records ${targetLabel}. When present, imported property and modifier-like lines are evidence only; no affix-tier or build-value calculation proves the target is better. Confirm current gear before deciding to farm or craft.`
        : relation === "unresolved"
          ? `The ACTIVE and target PoB records for ${slotName} do not contain enough complete item facts to compare. Review both exports and confirm the live character before treating this slot as a gear gap.`
        : relation === "target_only"
          ? `The target PoB records ${targetLabel} in ${slotName}, while the ACTIVE PoB has no parsed item there. Confirm the live character and league stash before treating this as an acquisition goal.`
          : `The ACTIVE PoB records ${activeLabel} in ${slotName}, while the target PoB has no parsed item there. This may be an intentionally empty target slot or an incomplete PoB export; confirm before changing the route or selling the item.`;

      steps.push({
        id: `equipment-comparison:${currentBuild.id}:${build.id}:${slotKey}:${index + 1}`,
        kind: "equipment_comparison",
        status: "needs_personal_and_curated_data",
        title: `Review gear difference: ${slotName}`,
        action,
        confidence: "low",
        dataVersion,
        evidence: [
          routeEvidence,
          {
            source: "build_manifest",
            version: `build-manifest-schema-${currentBuild.schemaVersion}`,
            reference: currentBuild.id,
            detail: `ACTIVE PoB equipment record for ${slotName}: ${activeLabel}.`,
          },
          {
            source: "build_manifest",
            version: `build-manifest-schema-${build.schemaVersion}`,
            reference: build.id,
            detail: `Target PoB equipment record for ${slotName}: ${targetLabel}.`,
          },
          progressionEvidence,
        ],
        requiredData: [
          {
            category: "personal",
            key: "confirmed_current_character_equipment",
            description: "The ACTIVE PoB is a saved build profile, not a live character sync. Confirm the current equipped item in game before treating this slot as a gap.",
          },
          {
            category: "curated",
            key: "poe1_item_modifier_and_build_value_rules",
            description: "PoB item property and modifier-like text is preserved when available, but reviewed patch-versioned affix, defense, and build-value rules are needed before ranking an upgrade or prescribing a craft.",
          },
        ],
        target: slotName,
        equipmentComparison: {
          slotName,
          relation,
          ...(activeFact ? { activeItem: activeFact } : {}),
          ...(targetFact ? { targetItem: targetFact } : {}),
        },
      });
    }
  }
  return steps;
}

function groupEquippedItemsBySlot(items: readonly EquippedItemFact[]): Map<string, EquippedItemFact[]> {
  const groups = new Map<string, EquippedItemFact[]>();
  for (const item of items) {
    const key = normalizeEquipmentText(item.slotName);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function compareVisibleEquipmentIdentity(
  left: EquippedItemFact,
  right: EquippedItemFact,
): "same" | "changed" | "unresolved" {
  const leftName = normalizeEquipmentText(left.uniqueName ?? left.itemName ?? "");
  const rightName = normalizeEquipmentText(right.uniqueName ?? right.itemName ?? "");
  const leftBase = normalizeEquipmentText(left.baseType ?? "");
  const rightBase = normalizeEquipmentText(right.baseType ?? "");
  if ((leftName && rightName && leftName !== rightName) || (leftBase && rightBase && leftBase !== rightBase)) {
    return "changed";
  }
  if ((leftName && leftName === rightName) || (leftBase && leftBase === rightBase)) {
    return compareEquipmentDetailFacts(left, right);
  }
  return "unresolved";
}

function compareEquipmentDetailFacts(left: EquippedItemFact, right: EquippedItemFact): "same" | "changed" | "unresolved" {
  const leftHasFacts = hasEquipmentDetailFacts(left);
  const rightHasFacts = hasEquipmentDetailFacts(right);
  if (!leftHasFacts && !rightHasFacts) return "same";
  if (!leftHasFacts || !rightHasFacts || !left.detailTextComplete || !right.detailTextComplete) return "unresolved";
  if (
    left.itemLevel !== right.itemLevel ||
    left.quality !== right.quality ||
    normalizeEquipmentText(left.socketLayout ?? "") !== normalizeEquipmentText(right.socketLayout ?? "") ||
    normalizedEquipmentProperties(left) !== normalizedEquipmentProperties(right) ||
    normalizedEquipmentLines(left.modifierLines ?? []) !== normalizedEquipmentLines(right.modifierLines ?? []) ||
    normalizedEquipmentLines(left.itemFlags ?? []) !== normalizedEquipmentLines(right.itemFlags ?? [])
  ) return "changed";
  return "same";
}

function hasEquipmentDetailFacts(item: EquippedItemFact): boolean {
  return item.detailTextComplete !== undefined
    || item.itemProperties !== undefined
    || item.modifierLines !== undefined
    || item.itemFlags !== undefined
    || item.itemLevel !== undefined
    || item.quality !== undefined
    || item.socketLayout !== undefined;
}

function normalizedEquipmentProperties(item: EquippedItemFact): string {
  return (item.itemProperties ?? [])
    .map((property) => `${normalizeEquipmentText(property.name)}\u0000${normalizeEquipmentText(property.value)}`)
    .sort()
    .join("\n");
}

function normalizedEquipmentLines(lines: readonly string[]): string {
  return lines.map(normalizeEquipmentText).sort().join("\n");
}

function equipmentItemSummary(item: EquippedItemFact): NonNullable<EquipmentSlotComparison["activeItem"]> {
  const itemName = item.uniqueName ?? item.itemName;
  const label = itemName && item.baseType && normalizeEquipmentText(itemName) !== normalizeEquipmentText(item.baseType)
    ? `${itemName} (${item.baseType})`
    : itemName ?? item.baseType ?? "Item details unavailable";
  return {
    label,
    ...(item.rarity ? { rarity: item.rarity } : {}),
    ...(item.baseType ? { baseType: item.baseType } : {}),
    ...(item.itemLevel !== undefined ? { itemLevel: item.itemLevel } : {}),
    ...(item.quality !== undefined ? { quality: item.quality } : {}),
    ...(item.socketLayout ? { socketLayout: item.socketLayout } : {}),
    ...(item.itemProperties !== undefined ? { itemProperties: item.itemProperties } : {}),
    ...(item.modifierLines !== undefined ? { modifierLines: item.modifierLines } : {}),
    ...(item.itemFlags !== undefined ? { itemFlags: item.itemFlags } : {}),
    ...(item.detailTextComplete !== undefined ? { detailTextComplete: item.detailTextComplete } : {}),
  };
}

function normalizeEquipmentText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function buildSkillTransitionSteps(input: {
  readonly build: BuildManifest;
  readonly currentBuild?: BuildManifest;
  readonly dataVersion: ProgressionRouteDataVersion;
  readonly routeEvidence: RouteEvidence;
  readonly progressionEvidence: RouteEvidence;
}): Omit<ProgressionRouteStep, "order">[] {
  const { build, currentBuild, dataVersion, routeEvidence, progressionEvidence } = input;
  if (build.role === "ACTIVE" || currentBuild?.role !== "ACTIVE" || currentBuild.id === build.id) return [];
  const activeGroup = mainSkillGroup(currentBuild);
  const targetGroup = mainSkillGroup(build);
  if (!activeGroup || !targetGroup) return [];

  const activeMainSkill = activeGroup.mainSkillName?.trim() || currentBuild.skills?.mainSkillName?.trim() || undefined;
  const targetMainSkill = targetGroup.mainSkillName?.trim() || build.skills?.mainSkillName?.trim() || undefined;
  const activeSupports = supportGemNames(activeGroup);
  const targetSupports = supportGemNames(targetGroup);
  const activeMainKey = normalizeGemName(activeMainSkill ?? "");
  const targetMainKey = normalizeGemName(targetMainSkill ?? "");
  const mainSkillChanged = Boolean(activeMainKey && targetMainKey && activeMainKey !== targetMainKey);
  const activeSupportKeys = new Set(activeSupports.map(normalizeGemName));
  const targetSupportKeys = new Set(targetSupports.map(normalizeGemName));
  const addedSupportGems = targetSupports.filter((gem) => !activeSupportKeys.has(normalizeGemName(gem)));
  const removedSupportGems = activeSupports.filter((gem) => !targetSupportKeys.has(normalizeGemName(gem)));
  const supportListsDiffer = addedSupportGems.length > 0 || removedSupportGems.length > 0;
  if (!mainSkillChanged && !supportListsDiffer) return [];
  const needsGemAcquisitionData = mainSkillChanged || addedSupportGems.length > 0;

  const comparison: SkillTransitionComparison = {
    mainSkillChanged,
    ...(activeMainSkill ? { activeMainSkill } : {}),
    ...(targetMainSkill ? { targetMainSkill } : {}),
    activeSupportGems: activeSupports,
    targetSupportGems: targetSupports,
    addedSupportGems,
    removedSupportGems,
  };
  const activeSkillLabel = activeMainSkill ?? "Main skill not parsed";
  const targetSkillLabel = targetMainSkill ?? "Main skill not parsed";
  const requirements: RouteDataRequirement[] = [
    {
      category: "personal",
      key: "confirmed_current_skill_setup",
      description: "The ACTIVE PoB is a saved setup, not a live character sync. Confirm the current socket links, colors, and gem levels before following a transition plan.",
    },
  ];
  if (needsGemAcquisitionData) {
    requirements.push({
      category: "curated",
      key: "poe1_gem_unlock_and_progression",
      description: "Versioned PoE 1 quest/vendor rewards and gem availability are needed before the planner can name when or where to acquire new skill gems.",
    });
  }
  const status = routeStatus(requirements);
  const acquisitionNote = needsGemAcquisitionData
    ? "New-gem acquisition timing needs reviewed PoE 1 progression data."
    : "This comparison does not determine gem acquisition requirements.";
  const action = `The ACTIVE PoB main group uses ${activeSkillLabel}${activeSupports.length ? ` with ${activeSupports.join(", ")}` : ""}; the target PoB uses ${targetSkillLabel}${targetSupports.length ? ` with ${targetSupports.join(", ")}` : ""}. This is a saved-setup difference, not proof of the character's live sockets or gem readiness. Confirm links, colors, and gem levels before switching. ${acquisitionNote}`;

  return [{
    id: `skill-transition:${currentBuild.id}:${build.id}`,
    kind: "skill_transition",
    status,
    title: "Review main skill transition",
    action,
    confidence: "low",
    dataVersion,
    evidence: [
      routeEvidence,
      {
        source: "build_manifest",
        version: `build-manifest-schema-${currentBuild.schemaVersion}`,
        reference: currentBuild.id,
        detail: `ACTIVE PoB main group: ${activeSkillLabel}; supports: ${activeSupports.join(", ") || "none parsed"}.`,
      },
      {
        source: "build_manifest",
        version: `build-manifest-schema-${build.schemaVersion}`,
        reference: build.id,
        detail: `Target PoB main group: ${targetSkillLabel}; supports: ${targetSupports.join(", ") || "none parsed"}.`,
      },
      progressionEvidence,
    ],
    requiredData: requirements,
    target: targetSkillLabel,
    skillTransition: comparison,
  }];
}

function mainSkillGroup(build: BuildManifest): BuildSkillGroup | undefined {
  return build.skills?.groups.find((group) => group.isMainSkillGroup);
}

function supportGemNames(group: BuildSkillGroup): string[] {
  const suppliedNames = group.supportGemNames.length
    ? group.supportGemNames
    : group.gems.filter((gem) => gem.role === "support").flatMap((gem) => gem.name ? [gem.name] : []);
  const seen = new Set<string>();
  return suppliedNames.flatMap((value) => {
    const name = value.trim();
    const key = normalizeGemName(name);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
}

function normalizeGemName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
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

function buildProgressionCheckpointSteps(input: {
  readonly build: BuildManifest;
  readonly progression: RouteProgressionSnapshot;
  readonly plans: ReturnType<typeof progressionPlansForBuild>;
  readonly passiveSpecLevels: readonly PassiveSpecLevelAssignment[];
  readonly dataVersion: ProgressionRouteDataVersion;
  readonly routeEvidence: RouteEvidence;
  readonly progressionEvidence: RouteEvidence;
  readonly buildEvidence: (detail: string, goal?: ItemGoal) => RouteEvidence;
  readonly packEvidence: (sourceIds: readonly string[], entryId: string) => RouteEvidence[];
}): Omit<ProgressionRouteStep, "order">[] {
  const { build, progression, plans, passiveSpecLevels, dataVersion, routeEvidence, progressionEvidence, buildEvidence, packEvidence } = input;
  const normalize = poe1Provider.normalizeItemIdentity;
  const currentLevel = progression.characterLevel;
  const specsById = new Map((build.passiveSpecs ?? []).map((spec) => [spec.id, spec]));
  const levelsBySpecId = new Map<number, number>();
  for (const assignment of passiveSpecLevels) {
    if (!Number.isInteger(assignment.specId) || !Number.isInteger(assignment.level) || assignment.level < 1 || assignment.level > 100) continue;
    if (specsById.has(assignment.specId)) levelsBySpecId.set(assignment.specId, assignment.level);
  }
  const assignedSpecs = [...levelsBySpecId]
    .flatMap(([specId, level]) => {
      const spec = specsById.get(specId);
      return spec ? [{ spec, level }] : [];
    })
    .filter(({ spec }) => !plans.some((plan) => plan.checkpoints.some((checkpoint) =>
      checkpoint.passiveSpecName && normalize(checkpoint.passiveSpecName) === normalize(spec.name ?? ""),
    )))
    .sort((left, right) => left.level - right.level || left.spec.id - right.spec.id);
  const nextAssignedSpec = currentLevel === undefined
    ? undefined
    : assignedSpecs.find(({ level }) => level > currentLevel)?.spec.id;
  const assignedSpecSteps = assignedSpecs.map(({ spec, level }) => {
    const isNextCheckpoint = spec.id === nextAssignedSpec;
    const specName = spec.name?.trim() || `Spec ${spec.id}`;
    const requiredData: RouteDataRequirement[] = currentLevel === undefined ? [{
      category: "personal",
      key: "current_character_level",
      description: "Set a current-character level to identify which assigned PoB tree comes next.",
    }] : [];
    const checkpoint: ProgressionCheckpointDetail = {
      id: `pob-spec-${spec.id}`,
      level,
      title: `PoB tree · ${specName}`,
      objective: `Review the imported “${specName}” passive spec assigned to level ${level}. This level was entered by you and was not inferred from node IDs or PoB spec order.`,
      steps: [
        `Open the “${specName}” passive spec in the imported PoB.`,
        "Compare it with the current character tree and confirm available quest points and refund costs before reallocating.",
      ],
      ...(spec.name?.trim() ? { passiveSpecName: spec.name.trim() } : {}),
      planName: `${build.name} · player-assigned PoB trees`,
      isNextCheckpoint,
      origin: "pob_spec_annotation",
    };
    const action = isNextCheckpoint
      ? `NEXT CHECKPOINT · level ${level}. Open the imported “${specName}” spec and review its nodes. Current character level: ${currentLevel}.`
      : currentLevel === undefined
        ? `This imported PoB spec is assigned to level ${level}. Set the current character level to identify which tree is next.`
        : `This imported PoB spec is assigned to level ${level}. Current character level: ${currentLevel}; review it as an earlier or later guide checkpoint.`;
    return {
      id: `progression-checkpoint:${build.id}:pob-spec:${spec.id}`,
      kind: "progression_checkpoint" as const,
      status: requiredData.length ? routeStatus(requiredData) : "ready" as const,
      title: `${isNextCheckpoint ? "Next checkpoint" : `Level ${level}`}: ${checkpoint.title}`,
      action,
      confidence: "medium" as const,
      dataVersion,
      evidence: [
        routeEvidence,
        buildEvidence(`This local checkpoint links imported PoB passive spec ${spec.id} (${specName}) to the player-assigned level ${level}. The assignment is not inferred from the tree.`),
        {
          source: "player_annotation" as const,
          version: "local-passive-spec-levels-v1",
          reference: `${build.id}/passive-spec/${spec.id}`,
          detail: `You assigned “${specName}” to level ${level}. Verify the label against your build guide before following it.`,
        },
        progressionEvidence,
      ],
      requiredData,
      target: specName,
      progressionCheckpoint: checkpoint,
    };
  });

  const routePackSteps = plans.flatMap((plan) => {
    const nextCheckpointId = currentLevel === undefined
      ? undefined
      : plan.checkpoints.find((checkpoint) => checkpoint.level > currentLevel)?.id;
    return plan.checkpoints.map((checkpoint) => {
      const isNextCheckpoint = checkpoint.id === nextCheckpointId;
      const requiredData: RouteDataRequirement[] = currentLevel === undefined ? [{
        category: "personal",
        key: "current_character_level",
        description: "Set a current-character level to identify which build checkpoint comes next.",
      }] : [];
      if (checkpoint.passiveSpecName && !(build.passiveSpecs ?? []).some((spec) =>
        normalize(spec.name ?? "") === normalize(checkpoint.passiveSpecName ?? ""))) {
        requiredData.push({
          category: "personal",
          key: `target_passive_spec:${checkpoint.id}`,
          description: `Import the target PoB passive spec named “${checkpoint.passiveSpecName}” to connect this level checkpoint to its saved tree.`,
        });
      }
      const action = isNextCheckpoint
        ? `NEXT CHECKPOINT · level ${checkpoint.level}. ${checkpoint.objective} Follow the ordered steps from ${plan.name}. Current character level: ${currentLevel}.`
        : progression.characterLevel === undefined
          ? `This imported ${plan.name} checkpoint is for level ${checkpoint.level}. ${checkpoint.objective} A current-character level is needed to identify the next checkpoint.`
          : `This imported ${plan.name} checkpoint is for level ${checkpoint.level}. ${checkpoint.objective} Current character level: ${currentLevel}; review earlier steps against your actual progress.`;
      return {
        id: `progression-checkpoint:${build.id}:${plan.id}:${checkpoint.id}`,
        kind: "progression_checkpoint" as const,
        status: requiredData.length ? routeStatus(requiredData) : "ready",
        title: `${isNextCheckpoint ? "Next checkpoint" : `Level ${checkpoint.level}`}: ${checkpoint.title}`,
        action,
        confidence: "low" as const,
        dataVersion,
        evidence: [
          routeEvidence,
          buildEvidence(`The imported route ${plan.name} matches the declared exact build selectors: ${Object.entries(plan.match).map(([key, value]) => `${key} “${value}”`).join(", ")}.`),
          progressionEvidence,
          ...packEvidence(checkpoint.sourceIds, `${plan.id}/${checkpoint.id}`),
        ],
        requiredData,
        target: plan.name,
        progressionCheckpoint: { ...checkpoint, planName: plan.name, isNextCheckpoint, origin: "route_pack" as const },
      };
    });
  });
  return [...assignedSpecSteps, ...routePackSteps];
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
    const matchingTreeData = Boolean(targetVersion && passiveTreeData?.treeVersion === targetVersion);
    const canResolveNodeNames = comparison === "compared" && hasNodeDifference && matchingTreeData;
    const factsFor = (nodeIds: readonly number[] | undefined): PassiveNodeFact[] | undefined => {
      if (!matchingTreeData || !nodeIds || !passiveTreeData) return undefined;
      return nodeIds.map((nodeId) => passiveTreeData.nodes[String(nodeId)] ?? { id: nodeId, stats: [] });
    };
    const addedNodes = factsFor(addedNodeIds);
    const removedNodes = factsFor(removedNodeIds);
    const retainedNodeIds = comparison === "compared"
      ? targetNodeIds.filter((nodeId) => currentNodeSet.has(nodeId))
      : undefined;
    const allocationResult = matchingTreeData && targetVersion && passiveTreeData
      ? orderPassiveTreeAllocations({
          dataset: passiveTreeData,
          treeVersion: targetVersion,
          targetNodeIds,
          className: build.className,
          ...(retainedNodeIds ? { retainedNodeIds } : {}),
        })
      : {
          status: "unavailable" as const,
          nodeIds: [] as readonly number[],
          missingNodeIds: [] as readonly number[],
          note: targetVersion
            ? `Import the local tree export for ${targetVersion} to generate a topology-based allocation order.`
            : "The PoB tree version is missing. Confirm a version before importing local tree topology.",
        };
    const allocationOrderNodes = allocationResult.nodeIds.map((nodeId) =>
      passiveTreeData?.nodes[String(nodeId)] ?? { id: nodeId, stats: [] },
    );
    const allocationCheckpoints = createPassiveTreeAllocationCheckpoints(allocationOrderNodes);
    const requiredData: RouteDataRequirement[] = [];

    if (allocationResult.status === "unavailable") {
      requiredData.push({
        category: "personal",
        key: "poe1_passive_tree_order_data",
        description: allocationResult.note,
      });
    }

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
      ...(allocationOrderNodes.length ? { allocationOrder: allocationOrderNodes } : {}),
      ...(allocationCheckpoints.length ? { allocationCheckpoints } : {}),
      allocationOrderStatus: allocationResult.status,
      ...(allocationResult.missingNodeIds.length ? { allocationOrderMissingNodeIds: allocationResult.missingNodeIds } : {}),
      allocationOrderNote: allocationResult.note,
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
      ? ` Matching local tree data identifies ${addedSummary} and ${removedSummary}.`
      : "";
    const allocationSummary = allocationResult.status === "complete"
      ? " A suggested allocation traversal is available below."
      : allocationResult.status === "partial"
        ? " A partial allocation traversal is available below; it omits nodes the imported links could not connect."
        : " No allocation order is shown until matching local tree links are available.";
    const action = comparison === "compared"
      ? aligned
        ? `This target PoB spec exactly matches the ACTIVE spec “${passiveTree.baselineSpecName}” by node ID in tree ${targetVersion}. The route preserves the saved spec and does not independently rank or optimize passives.${allocationSummary}`
        : `Load the target spec in Path of Building and review its allocation difference from ACTIVE “${passiveTree.baselineSpecName}” in tree ${targetVersion}: add ${addedNodeIds?.length ?? 0} node IDs and review ${removedNodeIds?.length ?? 0} ACTIVE nodes omitted by the target.${nodeSummary} The route does not estimate respec cost or optimize nodes.${allocationSummary}`
      : comparison === "missing_current"
        ? `Load this saved PoB spec in Path of Building: ${targetName} (${targetVersion ?? "tree version not recorded"}, ${targetNodeIds.length} allocated node IDs). The target tree is preserved, but no current-tree gap is claimed without an ACTIVE node snapshot.${allocationSummary}`
        : `Load this saved PoB spec in Path of Building: ${targetName} (${targetVersion ?? "tree version not recorded"}, ${targetNodeIds.length} allocated node IDs). Its node IDs are not compared because the ACTIVE and target tree versions are missing or differ.${allocationSummary}`;
    const currentBuildEvidence: RouteEvidence[] = currentBuild && currentSpec
      ? [{
          source: "build_manifest",
          version: `build-manifest-schema-${currentBuild.schemaVersion}`,
          reference: currentBuild.id,
          detail: `ACTIVE baseline spec ${passiveTree.baselineSpecName ?? "unknown"} uses tree ${currentVersion ?? "unknown"} with ${currentNodeIds.length} node IDs.`,
        }]
      : [];
    const treeDataEvidence: RouteEvidence[] = matchingTreeData && passiveTreeData
      ? [{
          source: "local_tree_export",
          version: passiveTreeData.treeVersion,
          reference: passiveTreeData.sourceFile,
          detail: "Node labels and graph links were resolved from a player-selected local tree export. Its tree version was confirmed by the player from the imported PoB spec; the route traversal follows these links and does not optimize the allocation order.",
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

function createPassiveTreeAllocationCheckpoints(
  nodes: readonly PassiveNodeFact[],
): PassiveTreeAllocationCheckpoint[] {
  const checkpoints: PassiveTreeAllocationCheckpoint[] = [];
  for (let offset = 0; offset < nodes.length; offset += PASSIVE_TREE_CHECKPOINT_SIZE) {
    const group = nodes.slice(offset, offset + PASSIVE_TREE_CHECKPOINT_SIZE);
    checkpoints.push({
      number: checkpoints.length + 1,
      firstNodeIndex: offset + 1,
      lastNodeIndex: offset + group.length,
      nodes: group,
    });
  }
  return checkpoints;
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

function countGoalMatches(goal: ItemGoal, stash: RouteStashSnapshot): number | undefined {
  return countStashMatches(stash, {
    names: goal.match.itemNames,
    baseTypes: goal.match.baseTypes,
    tags: goal.match.anyTags,
  });
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
