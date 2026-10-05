import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ItemGoal } from "./types";
import { acquisitionRoutesForGoal, craftPlanForGoal, parsePoe1RouteKnowledgePack } from "./poe1-route-pack";

const SOURCE = { id: "wiki", title: "PoE Wiki guide", url: "https://example.org/guide", checkedOn: "2026-10-05" };
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
  }],
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
  }],
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
