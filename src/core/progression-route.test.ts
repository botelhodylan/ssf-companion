import { describe, expect, it } from "vitest";
import type { BuildManifest } from "./types";
import { parsePoe1RouteKnowledgePack } from "./poe1-route-pack";
import {
  buildProgressionRoute,
  POE1_ROUTE_RULES_VERSION,
  type RouteProgressionSnapshot,
  type RouteStashSnapshot,
} from "./progression-route";

const BUILD: BuildManifest = {
  schemaVersion: 1,
  game: "poe1",
  id: "build-winter-orb",
  name: "Winter Orb Elementalist",
  className: "Witch",
  ascendancy: "Elementalist",
  level: 86,
  role: "ACTIVE",
  progressionStage: "atlas",
  source: { kind: "manual", importState: "complete" },
  confidence: "high",
  passiveAllocationCount: 112,
  itemGoals: [
    {
      id: "goal-ring",
      kind: "equip",
      priority: 5,
      match: { itemNames: ["The Taming"] },
      why: "Planned unique ring.",
    },
    {
      id: "goal-helmet-base",
      kind: "crafting",
      priority: 4,
      match: { baseTypes: ["Torturer's Mask"] },
      why: "Hybrid evasion and energy shield helmet base.",
    },
    {
      id: "goal-alteration",
      kind: "crafting",
      priority: 3,
      match: { itemNames: ["Orb of Alteration"] },
      why: "Crafting currency goal.",
    },
  ],
};

const PROGRESSION: RouteProgressionSnapshot = {
  stage: "early_mapping",
  version: "character-sync-12",
  source: "official_character",
  characterLevel: 78,
  passiveAllocationCount: 94,
};

const STASH: RouteStashSnapshot = {
  version: "league-stash-31",
  source: "official_import",
  items: [
    { id: "base-1", name: "Torturer's Mask", baseType: "Torturer's Mask", quantity: 1 },
    { id: "currency-1", name: "Orb of Alteration", quantity: 15 },
  ],
};

describe("buildProgressionRoute", () => {
  it("orders gear gaps, crafting, farming, passive tree, then loot-filter work", () => {
    const route = buildProgressionRoute({ build: BUILD, progression: PROGRESSION, stash: STASH });
    const kinds = route.steps.map((step) => step.kind);

    expect(route).toMatchObject({
      game: "poe1",
      rulesVersion: POE1_ROUTE_RULES_VERSION,
      currentStage: "early_mapping",
      targetStage: "atlas",
    });
    expect(kinds.slice(0, 2)).toEqual(["gear_gap", "gear_gap"]);
    expect(kinds.slice(2, 4)).toEqual(["crafting_plan", "crafting_plan"]);
    expect(kinds[4]).toBe("farming_atlas");
    expect(kinds[5]).toBe("passive_tree");
    expect(kinds.slice(6).every((kind) => kind === "loot_filter_priority")).toBe(true);
    expect(route.steps.map((step) => step.order)).toEqual(route.steps.map((_step, index) => index + 1));
  });

  it("uses exact stash facts for gaps and includes snapshot versions as evidence", () => {
    const route = buildProgressionRoute({ build: BUILD, progression: PROGRESSION, stash: STASH });
    const ring = route.steps.find((step) => step.goalId === "goal-ring" && step.kind === "gear_gap");
    const helmet = route.steps.find((step) => step.goalId === "goal-helmet-base" && step.kind === "gear_gap");

    expect(ring).toMatchObject({ status: "ready", target: "The Taming", targetQuantity: 1, ownedQuantity: 0 });
    expect(helmet).toMatchObject({ status: "complete", target: "Torturer's Mask", ownedQuantity: 1 });
    expect(ring?.dataVersion).toEqual({
      routeRules: POE1_ROUTE_RULES_VERSION,
      buildManifestSchema: 1,
      progressionSnapshot: "character-sync-12",
      stashSnapshot: "league-stash-31",
      curatedData: "not-loaded",
    });
    expect(ring?.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "build_manifest", reference: "build-winter-orb/goal-ring" }),
      expect.objectContaining({ source: "progression_snapshot", version: "character-sync-12" }),
      expect.objectContaining({ source: "stash_snapshot", version: "league-stash-31" }),
    ]));
    expect(ring?.confidence).toBe("high");
  });

  it("does not claim a gear gap when no stash snapshot was supplied", () => {
    const route = buildProgressionRoute({ build: BUILD, progression: PROGRESSION });
    const ring = route.steps.find((step) => step.goalId === "goal-ring" && step.kind === "gear_gap");

    expect(ring).toMatchObject({ status: "needs_personal_data", confidence: "low" });
    expect(ring?.ownedQuantity).toBeUndefined();
    expect(ring?.requiredData).toContainEqual(expect.objectContaining({
      category: "personal",
      key: "league_stash_snapshot",
    }));
    expect(ring?.action).toContain("availability is unknown");
  });

  it("marks the current stage unknown until a local or official snapshot is supplied", () => {
    const route = buildProgressionRoute({
      build: BUILD,
      progression: { stage: "unknown", version: "unset", source: "unknown" },
    });
    const farming = route.steps.find((step) => step.kind === "farming_atlas");

    expect(route.currentStage).toBe("unknown");
    expect(farming).toMatchObject({ status: "needs_personal_and_curated_data" });
    expect(farming?.action).toContain("Current stage: Unknown stage");
    expect(farming?.requiredData).toContainEqual(expect.objectContaining({ key: "current_progression_stage" }));
  });

  it("does not turn an abstract tag goal into a fabricated exact gear gap", () => {
    const tagOnlyBuild: BuildManifest = {
      ...BUILD,
      itemGoals: [{
        id: "goal-hybrid-defense-tag",
        kind: "equip",
        priority: 4,
        match: { anyTags: ["hybrid-defense"] },
      }],
    };
    const route = buildProgressionRoute({ build: tagOnlyBuild, progression: PROGRESSION, stash: STASH });
    const gap = route.steps.find((step) => step.goalId === "goal-hybrid-defense-tag");

    expect(gap).toMatchObject({ status: "needs_curated_data", confidence: "low" });
    expect(gap?.ownedQuantity).toBeUndefined();
    expect(gap?.requiredData).toContainEqual(expect.objectContaining({ key: "poe1_item_tag_taxonomy" }));
    expect(gap?.action).toContain("does not prove an exact gear gap");
  });

  it("uses an exact-match local pack for cited farm routes, Atlas nodes, and step-by-step crafts", () => {
    const pack = parsePoe1RouteKnowledgePack(JSON.stringify({
      schemaVersion: 1,
      game: "poe1",
      id: "route-pack-test",
      name: "Test route pack",
      contentVersion: "3.28.0",
      sources: [{ id: "wiki", title: "Example source", url: "https://example.org/route", checkedOn: "2026-10-05" }],
      acquisitionRoutes: [{
        id: "taming-card-route",
        match: { itemNames: ["The Taming"] },
        stage: "atlas",
        method: "divination_card",
        title: "Collect the card set",
        steps: ["Run the named map."],
        atlasTreeName: "Card Atlas",
        atlasNodeNames: ["Card Chance"],
        atlasShareUrl: "https://www.pathofexile.com/atlas-skill-tree/AAAABgAAAfdPAAA=",
        sourceIds: ["wiki"],
      }],
      craftPlans: [{
        id: "mask-craft-plan",
        match: { baseTypes: ["Torturer's Mask"] },
        stage: "early_mapping",
        title: "Life and resistance helmet",
        baseType: "Torturer's Mask",
        requiredItemLevel: 75,
        prerequisites: ["Unlock the crafting bench."],
        materials: [{ name: "Orb of Alteration", quantity: 4 }],
        steps: ["Apply the named currency.", "Inspect the result."],
        stopCondition: "Stop after the target modifiers roll.",
        sourceIds: ["wiki"],
      }],
    }));
    const route = buildProgressionRoute({ build: BUILD, progression: PROGRESSION, stash: STASH, routeKnowledgePack: pack });
    const craft = route.steps.find((step) => step.goalId === "goal-helmet-base" && step.kind === "crafting_plan");
    const farm = route.steps.find((step) => step.goalId === "goal-ring" && step.kind === "farming_atlas");

    expect(route.dataVersion.curatedData).toBe("route-pack-test@3.28.0");
    expect(craft).toMatchObject({
      status: "ready",
      knowledgePlan: {
        heading: "Life and resistance helmet",
        stage: "early_mapping",
        baseType: "Torturer's Mask",
        requiredItemLevel: 75,
        materials: [{ name: "Orb of Alteration", quantity: 4, ownedQuantity: 15 }],
        steps: ["Apply the named currency.", "Inspect the result."],
        stopCondition: "Stop after the target modifiers roll.",
      },
    });
    expect(craft?.evidence).toContainEqual(expect.objectContaining({
      source: "route_knowledge_pack",
      url: "https://example.org/route",
    }));
    expect(farm).toMatchObject({
      status: "ready",
      title: "Target divination card: Collect the card set",
      knowledgePlan: {
        heading: "Collect the card set",
        atlasTreeName: "Card Atlas",
        atlasNodeNames: ["Card Chance"],
        atlasShareUrl: "https://www.pathofexile.com/atlas-skill-tree/AAAABgAAAfdPAAA=",
        steps: ["Run the named map."],
      },
    });
    expect(route.steps.filter((step) => step.kind === "farming_atlas")).toHaveLength(2);
    expect(route.steps.find((step) => step.kind === "farming_atlas" && !step.goalId)?.action).toContain("Torturer's Mask");
  });

  it("attaches the cited mechanic playbook to its exact farm route and explains the mechanic loop", () => {
    const pack = parsePoe1RouteKnowledgePack(JSON.stringify({
      schemaVersion: 1,
      game: "poe1",
      id: "mechanic-pack-test",
      name: "Test mechanic pack",
      contentVersion: "3.29.3",
      sources: [{ id: "wiki", title: "Mechanic reference", url: "https://example.org/mechanic", checkedOn: "2026-10-05" }],
      acquisitionRoutes: [{
        id: "taming-betrayal-route",
        match: { itemNames: ["The Taming"] },
        stage: "atlas",
        method: "league_mechanic",
        title: "Pursue the target through Betrayal",
        steps: ["Use the cited SSF acquisition route."],
        mechanicPlanId: "betrayal-taming-playbook",
        sourceIds: ["wiki"],
      }],
      craftPlans: [],
      mechanicPlans: [{
        id: "betrayal-taming-playbook",
        mechanicId: "betrayal",
        name: "Betrayal target plan",
        match: { itemNames: ["the-taming"] },
        stage: "atlas",
        objective: "Pursue the exact gear goal with the cited reward strategy.",
        prerequisites: ["Reach Atlas progression."],
        setupSteps: ["Review the current reward state."],
        executionSteps: ["Complete the selected encounter loop."],
        decisionRules: [{ when: "The target output is not available.", do: "Use the cited fallback mechanic." }],
        stopCondition: "Stop when the target is acquired or the source conditions no longer apply.",
        sourceIds: ["wiki"],
      }],
    }));
    const route = buildProgressionRoute({ build: BUILD, progression: PROGRESSION, stash: STASH, routeKnowledgePack: pack });
    const farm = route.steps.find((step) => step.goalId === "goal-ring" && step.kind === "farming_atlas");

    expect(farm).toMatchObject({
      kind: "farming_atlas",
      action: expect.stringContaining("Betrayal target plan playbook"),
      knowledgePlan: {
        mechanicPlaybook: {
          mechanicId: "betrayal",
          objective: "Pursue the exact gear goal with the cited reward strategy.",
          setupSteps: ["Review the current reward state."],
          executionSteps: ["Complete the selected encounter loop."],
          decisionRules: [{ when: "The target output is not available.", do: "Use the cited fallback mechanic." }],
          stopCondition: "Stop when the target is acquired or the source conditions no longer apply.",
        },
      },
    });
    expect(farm?.evidence).toContainEqual(expect.objectContaining({
      source: "route_knowledge_pack",
      reference: "betrayal-taming-playbook/wiki",
    }));
  });

  it("compares saved target PoB specs with the ACTIVE tree only when versions match", () => {
    const currentBuild: BuildManifest = {
      ...BUILD,
      id: "active-winter-orb",
      name: "Current Winter Orb",
      role: "ACTIVE",
      passiveSpecs: [{
        id: 1,
        name: "Current mapping",
        treeVersion: "3_26",
        isActive: true,
        allocatedNodeIds: [1, 2, 4],
      }],
    };
    const targetBuild: BuildManifest = {
      ...BUILD,
      id: "next-winter-orb",
      name: "Next Winter Orb",
      role: "NEXT",
      passiveSpecs: [
        { id: 1, name: "Early", treeVersion: "3_26", isActive: false, allocatedNodeIds: [1, 2, 3] },
        { id: 2, name: "Mapping", treeVersion: "3_26", isActive: true, allocatedNodeIds: [1, 2, 3, 4, 5] },
      ],
    };
    const route = buildProgressionRoute({ build: targetBuild, currentBuild, progression: PROGRESSION });
    const passiveSteps = route.steps.filter((step) => step.kind === "passive_tree");

    expect(passiveSteps).toHaveLength(2);
    expect(passiveSteps[0]).toMatchObject({
      status: "ready",
      title: "PoB tree spec: Early",
      passiveTree: {
        specId: 1,
        treeVersion: "3_26",
        comparison: "compared",
        baselineSpecName: "Current mapping",
        addedNodeIds: [3],
        removedNodeIds: [4],
      },
    });
    expect(passiveSteps[1]?.passiveTree).toMatchObject({
      specId: 2,
      specName: "Mapping",
      comparison: "compared",
      addedNodeIds: [3, 5],
      removedNodeIds: [],
    });
    expect(passiveSteps[0]?.action).toContain("does not estimate respec cost");
  });

  it("does not compare passive node IDs across different or missing tree versions", () => {
    const currentBuild: BuildManifest = {
      ...BUILD,
      role: "ACTIVE",
      passiveSpecs: [{ id: 1, name: "Current", treeVersion: "3_26", isActive: true, allocatedNodeIds: [1, 2] }],
    };
    const targetBuild: BuildManifest = {
      ...BUILD,
      role: "NEXT",
      passiveSpecs: [{ id: 3, name: "Target", treeVersion: "3_27", isActive: true, allocatedNodeIds: [1, 2, 3] }],
    };
    const mismatch = buildProgressionRoute({ build: targetBuild, currentBuild, progression: PROGRESSION })
      .steps.find((step) => step.kind === "passive_tree");
    const missingCurrent = buildProgressionRoute({ build: targetBuild, progression: PROGRESSION })
      .steps.find((step) => step.kind === "passive_tree");

    expect(mismatch).toMatchObject({
      status: "needs_personal_and_curated_data",
      passiveTree: { comparison: "version_mismatch" },
    });
    expect(mismatch?.passiveTree).not.toHaveProperty("addedNodeIds");
    expect(missingCurrent).toMatchObject({
      status: "needs_personal_data",
      passiveTree: { comparison: "missing_current" },
    });
    expect(missingCurrent?.action).toContain("no current-tree gap is claimed");
  });

  it("adds node names only when the imported tree data matches both spec versions", () => {
    const currentBuild: BuildManifest = {
      ...BUILD,
      id: "active-named-tree",
      role: "ACTIVE",
      passiveSpecs: [{ id: 1, name: "Current", treeVersion: "3_26", isActive: true, allocatedNodeIds: [1, 2] }],
    };
    const targetBuild: BuildManifest = {
      ...BUILD,
      id: "next-named-tree",
      role: "NEXT",
      passiveSpecs: [{ id: 2, name: "Target", treeVersion: "3_26", isActive: true, allocatedNodeIds: [1, 2, 3] }],
    };
    const data = {
      treeVersion: "3_26",
      sourceFile: "data.json",
      importedAt: "2026-10-05T00:00:00.000Z",
      classStartNodeIds: { Witch: 1 },
      nodes: {
        "1": { id: 1, name: "WITCH", stats: [], neighbors: [2] },
        "2": { id: 2, name: "Path", stats: [], neighbors: [1, 3] },
        "3": { id: 3, name: "Heart of Flame", kind: "notable" as const, stats: ["10% increased Fire Damage"], neighbors: [2] },
      },
    };
    const matched = buildProgressionRoute({ build: targetBuild, currentBuild, progression: PROGRESSION, passiveTreeData: data })
      .steps.find((step) => step.kind === "passive_tree");
    const wrongVersion = buildProgressionRoute({
      build: targetBuild,
      currentBuild,
      progression: PROGRESSION,
      passiveTreeData: { ...data, treeVersion: "3_27" },
    }).steps.find((step) => step.kind === "passive_tree");

    expect(matched?.passiveTree).toMatchObject({
      addedNodeIds: [3],
      addedNodes: [{ id: 3, name: "Heart of Flame", kind: "notable" }],
      allocationOrderStatus: "complete",
      allocationOrder: [{ id: 3, name: "Heart of Flame" }],
    });
    expect(matched?.action).toContain("Heart of Flame");
    expect(matched?.passiveTree?.allocationOrderNote).toContain("not a PoB-authored or performance-optimized leveling order");
    expect(matched?.evidence).toContainEqual(expect.objectContaining({
      source: "local_tree_export",
      version: "3_26",
      reference: "data.json",
    }));
    expect(wrongVersion?.passiveTree).not.toHaveProperty("addedNodes");
    expect(wrongVersion?.passiveTree?.allocationOrderStatus).toBe("unavailable");
    expect(wrongVersion?.evidence).not.toContainEqual(expect.objectContaining({ source: "local_tree_export" }));
  });

  it("orders a target tree from its class start when no current allocation is available", () => {
    const targetBuild: BuildManifest = {
      ...BUILD,
      className: "Witch",
      role: "NEXT",
      passiveSpecs: [{ id: 4, name: "Target", treeVersion: "3_26", isActive: true, allocatedNodeIds: [1, 2, 3, 4, 5] }],
    };
    const passiveTreeData = {
      treeVersion: "3_26",
      sourceFile: "data.json",
      importedAt: "2026-10-05T00:00:00.000Z",
      classStartNodeIds: { Witch: 1 },
      nodes: {
        "1": { id: 1, name: "WITCH", stats: [], neighbors: [2] },
        "2": { id: 2, name: "Path", stats: [], neighbors: [1, 3, 4] },
        "3": { id: 3, name: "Branch A", stats: [], neighbors: [2] },
        "4": { id: 4, name: "Branch B", stats: [], neighbors: [2, 5] },
        "5": { id: 5, name: "Notable", stats: [], neighbors: [4] },
      },
    };
    const route = buildProgressionRoute({ build: targetBuild, progression: PROGRESSION, passiveTreeData });
    const step = route.steps.find((item) => item.kind === "passive_tree");

    expect(step?.passiveTree).toMatchObject({
      comparison: "missing_current",
      allocationOrderStatus: "complete",
      allocationOrder: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
    });
    expect(step?.passiveTree?.allocationOrderNote).toContain("from the class start node");
    expect(step?.passiveTree?.allocationOrderNote).toContain("not a PoB-authored or performance-optimized leveling order");
  });

  it("seeds same-version allocation order from retained current nodes and reports disconnected gaps", () => {
    const currentBuild: BuildManifest = {
      ...BUILD,
      role: "ACTIVE",
      passiveSpecs: [{ id: 1, treeVersion: "3_26", isActive: true, allocatedNodeIds: [1, 2] }],
    };
    const targetBuild: BuildManifest = {
      ...BUILD,
      role: "NEXT",
      passiveSpecs: [{ id: 2, treeVersion: "3_26", isActive: true, allocatedNodeIds: [1, 2, 3, 4, 9] }],
    };
    const passiveTreeData = {
      treeVersion: "3_26",
      sourceFile: "data.json",
      importedAt: "2026-10-05T00:00:00.000Z",
      nodes: {
        "1": { id: 1, stats: [], neighbors: [2] },
        "2": { id: 2, stats: [], neighbors: [1, 3, 4] },
        "3": { id: 3, stats: [], neighbors: [2] },
        "4": { id: 4, stats: [], neighbors: [2] },
        "9": { id: 9, stats: [] },
      },
    };
    const step = buildProgressionRoute({ build: targetBuild, currentBuild, progression: PROGRESSION, passiveTreeData })
      .steps.find((item) => item.kind === "passive_tree");

    expect(step?.passiveTree).toMatchObject({
      allocationOrderStatus: "partial",
      allocationOrder: [{ id: 3 }, { id: 4 }],
      allocationOrderMissingNodeIds: [9],
    });
    expect(step?.passiveTree?.allocationOrderNote).toContain("list is incomplete");
  });

  it("groups long passive traversals into ten-node review checkpoints", () => {
    const currentBuild: BuildManifest = {
      ...BUILD,
      role: "ACTIVE",
      passiveSpecs: [{ id: 1, treeVersion: "3_26", isActive: true, allocatedNodeIds: [1, 2] }],
    };
    const targetBuild: BuildManifest = {
      ...BUILD,
      role: "NEXT",
      passiveSpecs: [{ id: 2, treeVersion: "3_26", isActive: true, allocatedNodeIds: Array.from({ length: 14 }, (_, index) => index + 1) }],
    };
    const nodes = Object.fromEntries(Array.from({ length: 14 }, (_, index) => {
      const id = index + 1;
      return [String(id), {
        id,
        name: `Node ${id}`,
        stats: [],
        neighbors: [id - 1, id + 1].filter((neighbor) => neighbor > 0 && neighbor <= 14),
      }];
    }));
    const passiveTreeData = {
      treeVersion: "3_26",
      sourceFile: "data.json",
      importedAt: "2026-10-05T00:00:00.000Z",
      nodes,
    };
    const step = buildProgressionRoute({ build: targetBuild, currentBuild, progression: PROGRESSION, passiveTreeData })
      .steps.find((item) => item.kind === "passive_tree");

    expect(step?.passiveTree?.allocationOrder?.map((node) => node.id)).toEqual(Array.from({ length: 12 }, (_, index) => index + 3));
    expect(step?.passiveTree?.allocationCheckpoints?.map((checkpoint) => ({
      number: checkpoint.number,
      range: [checkpoint.firstNodeIndex, checkpoint.lastNodeIndex],
      ids: checkpoint.nodes.map((node) => node.id),
    }))).toEqual([
      { number: 1, range: [1, 10], ids: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      { number: 2, range: [11, 12], ids: [13, 14] },
    ]);
  });

  it("withholds target order when class-start or imported tree topology is unavailable", () => {
    const targetBuild: BuildManifest = {
      ...BUILD,
      className: undefined,
      role: "NEXT",
      passiveSpecs: [{ id: 2, treeVersion: "3_26", isActive: true, allocatedNodeIds: [1, 2] }],
    };
    const passiveTreeData = {
      treeVersion: "3_26",
      sourceFile: "legacy-data.json",
      importedAt: "2026-10-05T00:00:00.000Z",
      nodes: { "1": { id: 1, stats: [] }, "2": { id: 2, stats: [] } },
    };
    const step = buildProgressionRoute({ build: targetBuild, progression: PROGRESSION, passiveTreeData })
      .steps.find((item) => item.kind === "passive_tree");

    expect(step?.passiveTree?.allocationOrderStatus).toBe("unavailable");
    expect(step?.passiveTree?.allocationOrder).toBeUndefined();
    expect(step?.passiveTree?.allocationOrderNote).toContain("PoB class is missing");
  });

  it("marks recipes, atlas routes, passive nodes, and filter rules as needing curated data", () => {
    const route = buildProgressionRoute({ build: BUILD, progression: PROGRESSION, stash: STASH });
    const crafting = route.steps.find((step) => step.kind === "crafting_plan");
    const farming = route.steps.find((step) => step.kind === "farming_atlas");
    const passive = route.steps.find((step) => step.kind === "passive_tree");
    const filter = route.steps.find((step) => step.kind === "loot_filter_priority");

    expect(crafting).toMatchObject({ status: "needs_curated_data", confidence: "low" });
    expect(crafting?.requiredData).toContainEqual(expect.objectContaining({ key: "poe1_crafting_recipes_and_mod_pool" }));
    expect(crafting?.action).toContain("Do not assume an affix recipe");
    expect(farming).toMatchObject({ status: "needs_curated_data", confidence: "low" });
    expect(farming?.requiredData).toContainEqual(expect.objectContaining({ key: "poe1_atlas_routes_and_drop_sources" }));
    expect(farming?.action).not.toMatch(/T16|Delirium|Breach|boss name/i);
    expect(passive).toMatchObject({ status: "needs_personal_and_curated_data", confidence: "low" });
    expect(passive?.action).toContain("Counts alone cannot identify missing nodes");
    expect(filter).toMatchObject({ status: "needs_curated_data", confidence: "low" });
    expect(filter?.action).toContain("preserving the existing FilterBlade/NeverSink presentation");
    expect(filter?.requiredData).toContainEqual(expect.objectContaining({ key: "poe1_filter_item_classes" }));
  });

  it("surfaces ACTIVE-to-target PoB equipment label differences without calling them upgrades", () => {
    const currentBuild: BuildManifest = {
      ...BUILD,
      id: "active-setup",
      name: "Active setup",
      role: "ACTIVE",
      equippedItems: [
        { slotName: "Ring 1", itemId: "1", rarity: "UNIQUE", uniqueName: "The Taming", baseType: "Prismatic Ring" },
        { slotName: "Helmet", itemId: "2", rarity: "RARE", itemName: "Doom Visor", baseType: "Bone Helmet" },
        { slotName: "Boots", itemId: "3", rarity: "RARE", itemName: "Storm March", baseType: "Fugitive Boots" },
        { slotName: "Belt", itemId: "4", rarity: "RARE" },
      ],
    };
    const targetBuild: BuildManifest = {
      ...BUILD,
      id: "next-setup",
      name: "Next setup",
      role: "NEXT",
      equippedItems: [
        { slotName: "Ring 1", itemId: "10", rarity: "UNIQUE", uniqueName: "The Taming", baseType: "Prismatic Ring" },
        { slotName: "Helmet", itemId: "20", rarity: "RARE", itemName: "Dread Brow", baseType: "Bone Helmet" },
        { slotName: "Amulet", itemId: "30", rarity: "UNIQUE", uniqueName: "Presence of Chayula", baseType: "Onyx Amulet" },
        { slotName: "Belt", itemId: "40", rarity: "RARE" },
      ],
    };

    const route = buildProgressionRoute({ build: targetBuild, currentBuild, progression: PROGRESSION });
    const comparisons = route.steps.filter((step) => step.kind === "equipment_comparison");

    expect(comparisons).toHaveLength(4);
    expect(comparisons.find((step) => step.target === "Helmet")).toMatchObject({
      status: "needs_personal_and_curated_data",
      confidence: "low",
      equipmentComparison: {
        relation: "changed",
        activeItem: { label: "Doom Visor (Bone Helmet)" },
        targetItem: { label: "Dread Brow (Bone Helmet)" },
      },
    });
    const amuletComparison = comparisons.find((step) => step.target === "Amulet")?.equipmentComparison;
    expect(amuletComparison).toMatchObject({
      relation: "target_only",
      targetItem: { label: "Presence of Chayula (Onyx Amulet)" },
    });
    expect(amuletComparison).not.toHaveProperty("activeItem");
    const bootsComparison = comparisons.find((step) => step.target === "Boots")?.equipmentComparison;
    expect(bootsComparison).toMatchObject({
      relation: "active_only",
      activeItem: { label: "Storm March (Fugitive Boots)" },
    });
    expect(bootsComparison).not.toHaveProperty("targetItem");
    expect(comparisons.find((step) => step.target === "Belt")?.equipmentComparison).toMatchObject({
      relation: "unresolved",
      activeItem: { label: "Item details unavailable" },
      targetItem: { label: "Item details unavailable" },
    });
    expect(comparisons.find((step) => step.target === "Belt")?.action).toContain("do not contain enough complete item facts to compare");
    expect(comparisons.some((step) => step.target === "Ring 1")).toBe(false);
    expect(comparisons.find((step) => step.target === "Helmet")?.action).toContain("no affix-tier or build-value calculation proves the target is better");
    expect(comparisons.find((step) => step.target === "Helmet")?.requiredData).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "confirmed_current_character_equipment", category: "personal" }),
      expect.objectContaining({ key: "poe1_item_modifier_and_build_value_rules", category: "curated" }),
    ]));
  });

  it("surfaces imported item-text changes for matching gear without ranking either item", () => {
    const activeItem = {
      slotName: "Ring 1",
      itemId: "active-ring",
      rarity: "RARE",
      itemName: "Foe Loop",
      baseType: "Two-Stone Ring",
      itemLevel: 76,
      quality: 20,
      socketLayout: "R-G",
      itemProperties: [{ name: "Fire Resistance", value: "+12%" }],
      modifierLines: ["+74 to maximum Life", "+36% to Lightning Resistance"],
      itemFlags: [],
      detailTextComplete: true,
    };
    const targetItem = {
      ...activeItem,
      itemId: "target-ring",
      itemLevel: 82,
      modifierLines: ["+92 to maximum Life", "+41% to Lightning Resistance"],
    };
    const currentBuild: BuildManifest = {
      ...BUILD,
      id: "active-ring-facts",
      role: "ACTIVE",
      equippedItems: [activeItem],
    };
    const targetBuild: BuildManifest = {
      ...BUILD,
      id: "next-ring-facts",
      role: "NEXT",
      equippedItems: [targetItem],
    };

    const route = buildProgressionRoute({ build: targetBuild, currentBuild, progression: PROGRESSION });
    const comparison = route.steps.find((step) => step.kind === "equipment_comparison");

    expect(comparison).toMatchObject({
      status: "needs_personal_and_curated_data",
      equipmentComparison: {
        relation: "changed",
        activeItem: { itemLevel: 76, modifierLines: ["+74 to maximum Life", "+36% to Lightning Resistance"] },
        targetItem: { itemLevel: 82, modifierLines: ["+92 to maximum Life", "+41% to Lightning Resistance"] },
      },
    });
    expect(comparison?.action).toContain("no affix-tier or build-value calculation proves the target is better");
    expect(comparison?.requiredData).toContainEqual(expect.objectContaining({
      category: "curated",
      key: "poe1_item_modifier_and_build_value_rules",
    }));

    const sameDetails = buildProgressionRoute({
      build: { ...targetBuild, equippedItems: [activeItem] },
      currentBuild,
      progression: PROGRESSION,
    });
    const incompleteDetails = buildProgressionRoute({
      build: { ...targetBuild, equippedItems: [{ ...activeItem, detailTextComplete: false }] },
      currentBuild,
      progression: PROGRESSION,
    });
    expect(sameDetails.steps.some((step) => step.kind === "equipment_comparison")).toBe(false);
    expect(incompleteDetails.steps.find((step) => step.kind === "equipment_comparison")?.equipmentComparison?.relation).toBe("unresolved");
  });

  it("compares ACTIVE and target main-skill support gems while requiring current and reviewed gem data", () => {
    const currentBuild: BuildManifest = {
      ...BUILD,
      id: "active-skill-setup",
      role: "ACTIVE",
      skills: {
        activeSkillSetId: 1,
        gemRoleMethod: "name_suffix_heuristic",
        mainSkillName: "Winter Orb",
        supportGemNames: ["Controlled Destruction Support", "Inspiration Support"],
        groups: [{
          index: 1,
          isMainSkillGroup: true,
          mainSkillName: "Winter Orb",
          supportGemNames: ["Controlled Destruction Support", "Inspiration Support"],
          gems: [],
        }],
      },
    };
    const targetBuild: BuildManifest = {
      ...BUILD,
      id: "target-skill-setup",
      role: "NEXT",
      skills: {
        activeSkillSetId: 1,
        gemRoleMethod: "name_suffix_heuristic",
        mainSkillName: "Spark",
        supportGemNames: ["Controlled Destruction Support", "Added Lightning Damage Support"],
        groups: [{
          index: 1,
          isMainSkillGroup: true,
          mainSkillName: "Spark",
          supportGemNames: ["Controlled Destruction Support", "Added Lightning Damage Support"],
          gems: [],
        }],
      },
    };

    const step = buildProgressionRoute({ build: targetBuild, currentBuild, progression: PROGRESSION })
      .steps.find((candidate) => candidate.kind === "skill_transition");

    expect(step).toMatchObject({
      status: "needs_personal_and_curated_data",
      confidence: "low",
      skillTransition: {
        mainSkillChanged: true,
        activeMainSkill: "Winter Orb",
        targetMainSkill: "Spark",
        activeSupportGems: ["Controlled Destruction Support", "Inspiration Support"],
        targetSupportGems: ["Controlled Destruction Support", "Added Lightning Damage Support"],
        addedSupportGems: ["Added Lightning Damage Support"],
        removedSupportGems: ["Inspiration Support"],
      },
    });
    expect(step?.requiredData).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "confirmed_current_skill_setup", category: "personal" }),
      expect.objectContaining({ key: "poe1_gem_unlock_and_progression", category: "curated" }),
    ]));
    expect(step?.action).toContain("not proof of the character's live sockets");
  });

  it("ignores casing and ordering when ACTIVE and target main skill groups contain the same gems", () => {
    const currentBuild: BuildManifest = {
      ...BUILD,
      id: "active-skill-setup",
      role: "ACTIVE",
      skills: {
        gemRoleMethod: "name_suffix_heuristic",
        supportGemNames: [],
        groups: [{
          index: 1,
          isMainSkillGroup: true,
          mainSkillName: "Winter Orb",
          supportGemNames: ["Inspiration Support", "Controlled Destruction Support"],
          gems: [],
        }],
      },
    };
    const targetBuild: BuildManifest = {
      ...BUILD,
      id: "target-skill-setup",
      role: "NEXT",
      skills: {
        gemRoleMethod: "name_suffix_heuristic",
        supportGemNames: [],
        groups: [{
          index: 1,
          isMainSkillGroup: true,
          mainSkillName: "winter orb",
          supportGemNames: ["controlled destruction support", "inspiration support"],
          gems: [],
        }],
      },
    };

    const route = buildProgressionRoute({ build: targetBuild, currentBuild, progression: PROGRESSION });

    expect(route.steps.some((step) => step.kind === "skill_transition")).toBe(false);
  });

  it("is deterministic for identical snapshots", () => {
    const input = { build: BUILD, progression: PROGRESSION, stash: STASH } as const;
    expect(buildProgressionRoute(input)).toEqual(buildProgressionRoute(input));
  });
});
