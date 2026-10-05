import { describe, expect, it } from "vitest";
import type { BuildManifest } from "./types";
import { createPobCharacterDraft } from "./pob-character-draft";

const activePobBuild: BuildManifest = {
  schemaVersion: 1,
  game: "poe1",
  id: "pob-winter-orb",
  name: "Winter Orb Mapping Setup",
  className: "Witch",
  ascendancy: "Elementalist",
  level: 84,
  role: "ACTIVE",
  progressionStage: "atlas",
  source: { kind: "pob_code", importState: "complete" },
  skills: {
    activeSkillSetId: 2,
    activeSkillSetName: "Mapping",
    gemRoleMethod: "name_suffix_heuristic",
    supportGemNames: ["Hypothermia Support"],
    groups: [],
  },
  skillSets: [{ id: 2, name: "Mapping", isActive: true, groups: [] }],
  equippedItems: [{ slotName: "Ring 1", itemId: "item-1", uniqueName: "The Taming", baseType: "Prismatic Ring" }],
  equipmentSets: [{
    id: 1,
    name: "Mapping",
    isActive: true,
    equippedItems: [{ slotName: "Ring 1", itemId: "item-1", uniqueName: "The Taming", baseType: "Prismatic Ring" }],
  }],
  passiveSpecs: [{ id: 2, name: "Mapping", treeVersion: "3_26", isActive: true, allocatedNodeIds: [10, 11] }],
  itemGoals: [],
};

describe("PoB to local character snapshot draft", () => {
  it("binds the reviewed draft to the selected league and preserves import provenance", () => {
    expect(createPobCharacterDraft(activePobBuild, " league-ssf ")).toEqual({
      leagueId: "league-ssf",
      name: "Winter Orb Mapping Setup",
      className: "Witch",
      level: 84,
      progressionStage: "atlas",
      sourceBuildId: "pob-winter-orb",
      sourceKind: "pob_code",
      importState: "complete",
    });
  });

  it("requires league selection and an explicitly ACTIVE imported PoB build", () => {
    expect(() => createPobCharacterDraft(activePobBuild, " ")).toThrow("Select a league");
    expect(() => createPobCharacterDraft({ ...activePobBuild, role: "NEXT" }, "league-ssf")).toThrow("marked ACTIVE");
    expect(() => createPobCharacterDraft({ ...activePobBuild, source: { kind: "sample", importState: "complete" } }, "league-ssf")).toThrow("Path of Building");
  });

  it("omits out-of-range imported levels so the player must review them", () => {
    const draft = createPobCharacterDraft({ ...activePobBuild, level: 101 }, "league-ssf");
    expect(draft.level).toBeUndefined();
  });
});
