import { describe, expect, it } from "vitest";
import { SAMPLE_BUILD_SET, SAMPLE_ITEM_CANDIDATES } from "./sample-build";
import { rankItemsByRelevance, scoreItemRelevance } from "./relevance";

describe("scoreItemRelevance", () => {
  it("explains an active build match, scarcity, crafting, stage, and clutter", () => {
    const result = scoreItemRelevance(
      {
        name: "Torturer's Mask",
        baseType: "Torturer's Mask",
        scarcity: 0.75,
        clutterCost: 1,
      },
      SAMPLE_BUILD_SET,
      { progressionStage: "atlas" },
    );

    expect(result.score).toBeGreaterThan(30);
    expect(result.matchedBuilds[0]?.role).toBe("ACTIVE");
    expect(result.reasons.some((reason) => reason.code === "build_goal" && reason.text.includes("ACTIVE"))).toBe(true);
    expect(result.reasons.some((reason) => reason.code === "scarcity")).toBe(true);
    expect(result.reasons.some((reason) => reason.code === "clutter_cost" && reason.points < 0)).toBe(true);
  });

  it("accounts for ACTIVE, NEXT, and INTERESTED build roles in inspectable reasons", () => {
    const result = scoreItemRelevance(
      { name: "Life craft input", tags: ["life-crafting"] },
      SAMPLE_BUILD_SET,
    );
    const roles = result.reasons
      .filter((reason) => reason.code === "build_goal")
      .map((reason) => reason.role);

    expect(roles).toEqual(["ACTIVE", "NEXT"]);
    expect(result.reasons.find((reason) => reason.role === "NEXT")?.points).toBeLessThan(
      result.reasons.find((reason) => reason.role === "ACTIVE")?.points ?? Infinity,
    );
  });

  it("reduces a build goal when the league stash already has the target quantity", () => {
    const build = SAMPLE_BUILD_SET[0];
    if (!build) throw new Error("sample active build missing");
    const withoutOwned = scoreItemRelevance({ name: "Torturer's Mask" }, [build]);
    const withOwned = scoreItemRelevance({ name: "Torturer's Mask", ownedCount: 1 }, [build]);

    expect(withOwned.score).toBeLessThan(withoutOwned.score);
    expect(withOwned.reasons.some((reason) => reason.code === "already_owned")).toBe(true);
  });

  it("ranks stronger build matches ahead of clutter with no current goal", () => {
    const results = rankItemsByRelevance(
      [
        { name: "Torturer's Mask", scarcity: 0.9 },
        { name: "Unmatched clutter", clutterCost: 10 },
      ],
      SAMPLE_BUILD_SET,
    );

    expect(results[0]?.itemName).toBe("Torturer's Mask");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("matches candidate names and bases without case-sensitive differences", () => {
    const result = scoreItemRelevance(
      { name: "torturer's mask" },
      SAMPLE_BUILD_SET,
    );

    expect(result.matchedBuilds.map((build) => build.role)).toContain("ACTIVE");
  });

  it("ships clearly labeled demo candidates for the Winter Orb example", () => {
    const helmet = SAMPLE_ITEM_CANDIDATES.find((candidate) => candidate.name === "Torturer's Mask");
    const alteration = SAMPLE_ITEM_CANDIDATES.find((candidate) => candidate.name === "Orb of Alteration");
    expect(helmet).toMatchObject({ demo: true, baseType: "Torturer's Mask" });
    expect(alteration).toMatchObject({ demo: true });
    expect(scoreItemRelevance(alteration!, SAMPLE_BUILD_SET).matchedBuilds[0]?.role).toBe("ACTIVE");
  });
});
