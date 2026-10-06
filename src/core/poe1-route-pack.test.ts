import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ItemGoal } from "./types";
import { acquisitionRoutesForGoal, craftPlanForGoal, parsePoe1RouteKnowledgePack } from "./poe1-route-pack";

const SOURCE = { id: "wiki", title: "PoE Wiki guide", url: "https://example.org/guide", checkedOn: "2026-10-05" };
type TestMatch = { itemNames?: string[]; baseTypes?: string[]; anyTags?: string[] };
type TestAcquisitionRoute = {
  id: string; match: TestMatch; stage: string; method: string; title: string; steps: string[];
  atlasTreeName?: string; atlasNodeNames?: string[]; atlasShareUrl?: string; mechanicPlanId?: string; sourceIds: string[];
};
type TestCraftPlan = {
  id: string; match: TestMatch; stage: string; title: string; baseType: string; requiredItemLevel?: number;
  prerequisites: string[]; materials: Array<{ name: string; quantity: number }>; steps: string[]; stopCondition: string; sourceIds: string[];
};
type TestMechanicPlan = {
  id: string; mechanicId: string; name: string; match: TestMatch; stage: string; objective: string;
  prerequisites: string[]; setupSteps: string[]; executionSteps: string[];
  decisionRules: Array<{ when: string; do: string }>; stopCondition: string; sourceIds: string[];
};
const VALID_PACK = {
  schemaVersion: 1,
  game: "poe1",
  id: "test-pack",
  name: "Test SSF pack",
  contentVersion: "3.28.0",
  sources: [SOURCE],
  acquisitionRoutes: [{
    id: "taming-card-route",
    match: { itemNames: ["The Taming"] },
    stage: "atlas",
    method: "divination_card",
    title: "Collect the card set",
    steps: ["Unlock the listed map pool.", "Run maps that can drop the card."],
    atlasTreeName: "Card-focused Atlas",
    atlasNodeNames: ["Card Chance"],
    atlasShareUrl: "https://www.pathofexile.com/atlas-skill-tree/AAAABgAAAfdPAAA=",
    sourceIds: ["wiki"],
  }] as TestAcquisitionRoute[],
  craftPlans: [{
    id: "mask-craft",
    match: { baseTypes: ["Torturer's Mask"] },
    stage: "early_mapping",
    title: "Life and resistance helmet",
    baseType: "Torturer's Mask",
    requiredItemLevel: 75,
    prerequisites: ["Have the required crafting bench unlock."],
    materials: [{ name: "Orb of Alteration", quantity: 4 }],
    steps: ["Use the named currency on the base.", "Inspect the result before continuing."],
    stopCondition: "Stop when the listed life and resistance targets are met.",
    sourceIds: ["wiki"],
  }] as TestCraftPlan[],
  mechanicPlans: [] as TestMechanicPlan[],
};

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

describe("PoE 1 route knowledge packs", () => {
  it("keeps the repository template importable and empty of gameplay claims", () => {
    const template = readFileSync(new URL("../../data/poe1-route-pack-template.json", import.meta.url), "utf8");
    const pack = parsePoe1RouteKnowledgePack(template);

    expect(pack.acquisitionRoutes).toEqual([]);
    expect(pack.craftPlans).toEqual([]);
    expect(pack.mechanicPlans).toEqual([]);
    expect(pack.progressionPlans).toEqual([]);
  });

  it("loads a bounded, patch-versioned pack with source-backed farming and craft plans", () => {
    const pack = parsePoe1RouteKnowledgePack(serialize(VALID_PACK));

    expect(pack).toMatchObject({
      id: "test-pack",
      contentVersion: "3.28.0",
      sources: [{ id: "wiki", url: "https://example.org/guide" }],
      acquisitionRoutes: [{ method: "divination_card", atlasTreeName: "Card-focused Atlas", atlasShareUrl: "https://www.pathofexile.com/atlas-skill-tree/AAAABgAAAfdPAAA=" }],
      craftPlans: [{ baseType: "Torturer's Mask", requiredItemLevel: 75 }],
    });
  });

  it("loads exact-build level checkpoints with ordered steps and cited Atlas setup", () => {
    const pack = parsePoe1RouteKnowledgePack(serialize({
      ...VALID_PACK,
      progressionPlans: [{
        id: "winter-orb-route",
        name: "Winter Orb progression route",
        match: { className: "Witch", ascendancy: "Elementalist", mainSkillName: "Winter Orb" },
        checkpoints: [
          {
            id: "campaign-transition",
            level: 33,
            title: "Campaign transition",
            objective: "Fixture checkpoint objective.",
            steps: ["Fixture action one.", "Fixture action two."],
            passiveSpecName: "Campaign",
            sourceIds: ["wiki"],
          },
          {
            id: "atlas-specialization",
            level: 86,
            title: "Atlas specialization",
            objective: "Fixture Atlas checkpoint objective.",
            steps: ["Review the imported tree before using it."],
            atlasTreeName: "Fixture Atlas tree",
            atlasNodeNames: ["Fixture node"],
            atlasShareUrl: "https://www.pathofexile.com/atlas-skill-tree/AAAABgAAAfdPAAA=",
            sourceIds: ["wiki"],
          },
        ],
      }],
    }));

    expect(pack.progressionPlans).toMatchObject([{
      id: "winter-orb-route",
      match: { className: "Witch", ascendancy: "Elementalist", mainSkillName: "Winter Orb" },
      checkpoints: [
        { id: "campaign-transition", level: 33, passiveSpecName: "Campaign", steps: ["Fixture action one.", "Fixture action two."] },
        { id: "atlas-specialization", level: 86, atlasTreeName: "Fixture Atlas tree", atlasShareUrl: "https://www.pathofexile.com/atlas-skill-tree/AAAABgAAAfdPAAA=" },
      ],
    }]);
  });

  it("rejects ambiguous build selectors, unsorted levels, missing evidence, and unsupported Atlas links", () => {
    const checkpoint = {
      id: "level-40",
      level: 40,
      title: "Fixture checkpoint",
      objective: "Synthetic only.",
      steps: ["Synthetic only."],
      sourceIds: ["wiki"],
    };
    const progressionPlan = {
      id: "fixture-progression",
      name: "Fixture route",
      match: { className: "Witch" },
      checkpoints: [checkpoint],
    };
    expect(() => parsePoe1RouteKnowledgePack(serialize({
      ...VALID_PACK,
      progressionPlans: [{ ...progressionPlan, match: {} }],
    }))).toThrow(/needs a className, ascendancy, or mainSkillName/);
    expect(() => parsePoe1RouteKnowledgePack(serialize({
      ...VALID_PACK,
      progressionPlans: [{ ...progressionPlan, checkpoints: [checkpoint, { ...checkpoint, id: "level-35", level: 35 }] }],
    }))).toThrow(/strictly increasing level/);
    expect(() => parsePoe1RouteKnowledgePack(serialize({
      ...VALID_PACK,
      progressionPlans: [{ ...progressionPlan, checkpoints: [{ ...checkpoint, sourceIds: ["missing"] }] }],
    }))).toThrow(/not declared in sources/);
    expect(() => parsePoe1RouteKnowledgePack(serialize({
      ...VALID_PACK,
      progressionPlans: [{ ...progressionPlan, checkpoints: [{ ...checkpoint, atlasTreeName: "Unsupported" }] }],
    }))).toThrow(/validated GGG Atlas share URL/);
  });

  it("rejects non-HTTPS and credential-bearing source URLs", () => {
    for (const url of ["http://example.org/guide", "https://user:pass@example.org/guide"]) {
      expect(() => parsePoe1RouteKnowledgePack(serialize({ ...VALID_PACK, sources: [{ ...SOURCE, url }] })))
        .toThrow(/HTTPS URL/);
    }
  });

  it("requires each route to cite a declared source", () => {
    const value = structuredClone(VALID_PACK);
    value.acquisitionRoutes[0].sourceIds = ["missing"];
    expect(() => parsePoe1RouteKnowledgePack(serialize(value))).toThrow(/not declared in sources/);
  });

  it("accepts source-backed mechanic playbooks linked to exact league-mechanic routes", () => {
    const value = structuredClone(VALID_PACK);
    value.acquisitionRoutes.push({
      id: "taming-syndicate-route",
      match: { itemNames: ["The Taming"] },
      stage: "atlas",
      method: "league_mechanic",
      title: "Run the Betrayal reward route",
      steps: ["Complete the cited route."],
      mechanicPlanId: "betrayal-taming",
      sourceIds: ["wiki"],
    });
    value.mechanicPlans.push({
      id: "betrayal-taming",
      mechanicId: "betrayal",
      name: "Betrayal Taming plan",
      match: { itemNames: ["the taming"] },
      stage: "atlas",
      objective: "Use the selected Betrayal reward route to pursue the target.",
      prerequisites: ["Reach maps."],
      setupSteps: ["Check the cited reward table."],
      executionSteps: ["Run encounters until the source-backed reward condition is met."],
      decisionRules: [{ when: "The target reward is not available.", do: "Follow the cited fallback route." }],
      stopCondition: "Stop when the target is acquired or the source-backed condition changes.",
      sourceIds: ["wiki"],
    });

    const pack = parsePoe1RouteKnowledgePack(serialize(value));
    expect(pack.mechanicPlans).toMatchObject([{ mechanicId: "betrayal", name: "Betrayal Taming plan" }]);
    expect(pack.acquisitionRoutes[1].mechanicPlanId).toBe("betrayal-taming");
  });

  it("rejects playbook links with the wrong acquisition method, stage, target, or missing plan", () => {
    const base = structuredClone(VALID_PACK);
    base.mechanicPlans.push({
      id: "betrayal-taming",
      mechanicId: "betrayal",
      name: "Betrayal Taming plan",
      match: { itemNames: ["The Taming"] },
      stage: "atlas",
      objective: "Pursue the item.",
      prerequisites: [],
      setupSteps: [],
      executionSteps: [],
      decisionRules: [],
      stopCondition: "Stop when done.",
      sourceIds: ["wiki"],
    });
    const route = {
      id: "taming-mechanic-route",
      match: { itemNames: ["The Taming"] },
      stage: "atlas",
      method: "league_mechanic",
      title: "Taming route",
      steps: ["Run the mechanic."],
      mechanicPlanId: "betrayal-taming",
      sourceIds: ["wiki"],
    };

    const wrongMethod = structuredClone(base);
    wrongMethod.acquisitionRoutes.push({ ...route, method: "drop" });
    expect(() => parsePoe1RouteKnowledgePack(serialize(wrongMethod))).toThrow(/only when method is league_mechanic/);

    const wrongStage = structuredClone(base);
    wrongStage.acquisitionRoutes.push({ ...route, stage: "endgame" });
    expect(() => parsePoe1RouteKnowledgePack(serialize(wrongStage))).toThrow(/same progression stage/);

    const wrongTarget = structuredClone(base);
    wrongTarget.acquisitionRoutes.push({ ...route, match: { itemNames: ["The Squire"] } });
    expect(() => parsePoe1RouteKnowledgePack(serialize(wrongTarget))).toThrow(/share an exact item or base target/);

    const missingPlan = structuredClone(VALID_PACK);
    missingPlan.acquisitionRoutes.push(route);
    expect(() => parsePoe1RouteKnowledgePack(serialize(missingPlan))).toThrow(/not declared in mechanicPlans/);
  });

  it("continues to import legacy route packs without the optional mechanicPlans field", () => {
    const legacy = structuredClone(VALID_PACK) as Record<string, unknown>;
    delete legacy.mechanicPlans;
    expect(parsePoe1RouteKnowledgePack(serialize(legacy)).mechanicPlans).toEqual([]);
  });

  it("rejects trade routes and non-exact tag-only route matches", () => {
    const trade = structuredClone(VALID_PACK);
    trade.acquisitionRoutes[0].method = "trade";
    expect(() => parsePoe1RouteKnowledgePack(serialize(trade))).toThrow(/not supported by the SSF route planner/);

    const tagOnly = JSON.parse(serialize(VALID_PACK)) as { acquisitionRoutes: Array<{ match: unknown }> };
    tagOnly.acquisitionRoutes[0].match = { anyTags: ["unique-ring"] };
    expect(() => parsePoe1RouteKnowledgePack(serialize(tagOnly))).toThrow(/exact item name or base type/);
  });

  it("requires a valid official Atlas share URL when an Atlas setup is named", () => {
    const invalidAtlas = structuredClone(VALID_PACK);
    invalidAtlas.acquisitionRoutes[0].atlasShareUrl = "https://example.org/atlas-tree";
    expect(() => parsePoe1RouteKnowledgePack(serialize(invalidAtlas))).toThrow(/pathofexile.com/);

    const missingAtlas = structuredClone(VALID_PACK);
    delete (missingAtlas.acquisitionRoutes[0] as { atlasShareUrl?: string }).atlasShareUrl;
    expect(() => parsePoe1RouteKnowledgePack(serialize(missingAtlas))).toThrow(/must include a validated GGG Atlas share URL/);
  });

  it("rejects duplicate route IDs, duplicate materials, and invalid material quantities", () => {
    const duplicateRoutes = structuredClone(VALID_PACK);
    duplicateRoutes.acquisitionRoutes.push({ ...duplicateRoutes.acquisitionRoutes[0] });
    expect(() => parsePoe1RouteKnowledgePack(serialize(duplicateRoutes))).toThrow(/invalid or duplicated/);

    const duplicateMaterials = structuredClone(VALID_PACK);
    duplicateMaterials.craftPlans[0].materials.push({ name: "Orb of Alteration", quantity: 1 });
    expect(() => parsePoe1RouteKnowledgePack(serialize(duplicateMaterials))).toThrow(/duplicate names/);

    const badQuantity = structuredClone(VALID_PACK);
    badQuantity.craftPlans[0].materials[0].quantity = 0;
    expect(() => parsePoe1RouteKnowledgePack(serialize(badQuantity))).toThrow(/positive integer/);
  });

  it("rejects unsupported patches, oversized packs, and invalid JSON", () => {
    expect(parsePoe1RouteKnowledgePack(serialize({ ...VALID_PACK, contentVersion: "3.29.3b" })).contentVersion)
      .toBe("3.29.3b");
    expect(() => parsePoe1RouteKnowledgePack(serialize({ ...VALID_PACK, contentVersion: "current" })))
      .toThrow(/identify a PoE patch/);
    expect(() => parsePoe1RouteKnowledgePack("x".repeat(1_500_001))).toThrow(/1.5 MB import limit/);
    expect(() => parsePoe1RouteKnowledgePack("😀".repeat(400_001))).toThrow(/1.5 MB import limit/);
    expect(() => parsePoe1RouteKnowledgePack("not JSON")).toThrow(/valid JSON/);
  });

  it("matches routes only by normalized exact item names or base types", () => {
    const pack = parsePoe1RouteKnowledgePack(serialize(VALID_PACK));
    const uniqueGoal: ItemGoal = {
      id: "unique-ring",
      kind: "equip",
      priority: 4,
      match: { itemNames: ["the-taming"] },
    };
    const baseGoal: ItemGoal = {
      id: "helmet-base",
      kind: "crafting",
      priority: 3,
      match: { baseTypes: ["Torturer's Mask"] },
    };
    const tagGoal: ItemGoal = {
      id: "tag-goal",
      kind: "equip",
      priority: 3,
      match: { anyTags: ["unique-ring"] },
    };

    expect(acquisitionRoutesForGoal(uniqueGoal, pack)).toHaveLength(1);
    expect(craftPlanForGoal(baseGoal, pack)?.id).toBe("mask-craft");
    expect(acquisitionRoutesForGoal(tagGoal, pack)).toEqual([]);
    expect(craftPlanForGoal(tagGoal, pack)).toBeUndefined();
  });
});
