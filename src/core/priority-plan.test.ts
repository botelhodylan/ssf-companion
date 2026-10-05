import { describe, expect, it } from "vitest";
import { buildPriorityPlan, serializePriorityPlan } from "./priority-plan";
import { scoreItemRelevance } from "./relevance";
import { SAMPLE_BUILD_MANIFEST } from "./sample-build";

describe("priority plan export", () => {
  it("serializes an inspectable PoE 1 JSON plan without raw build codes", () => {
    const candidate = { name: "The Taming", baseType: "Prismatic Ring" };
    const relevance = scoreItemRelevance(candidate, [SAMPLE_BUILD_MANIFEST]);
    const plan = buildPriorityPlan({
      league: "SSF Standard",
      character: "Test Elementalist",
      progressionStage: "atlas",
      builds: [{
        id: SAMPLE_BUILD_MANIFEST.id,
        name: SAMPLE_BUILD_MANIFEST.name,
        role: SAMPLE_BUILD_MANIFEST.role,
        source: SAMPLE_BUILD_MANIFEST.source,
      }],
      priorities: [{ item: candidate.name, baseType: candidate.baseType, relevance }],
    });

    const serialized = serializePriorityPlan(plan, "json");
    const decoded = JSON.parse(serialized) as typeof plan;
    expect(decoded).toMatchObject({
      product: "SSF Companion",
      game: "poe1",
      league: "SSF Standard",
      character: "Test Elementalist",
      progressionStage: "atlas",
      priorities: [{ item: "The Taming", baseType: "Prismatic Ring", score: relevance.score }],
    });
    expect(serialized).not.toContain("rawCode");
  });

  it("quotes CSV fields and guards formula-like item names", () => {
    const candidate = { name: '=HYPERLINK("https://example.invalid")', baseType: "Ring, unique" };
    const relevance = scoreItemRelevance(candidate, [SAMPLE_BUILD_MANIFEST]);
    const plan = buildPriorityPlan({
      progressionStage: "atlas",
      builds: [],
      priorities: [{ item: candidate.name, baseType: candidate.baseType, relevance }],
    });

    const csv = serializePriorityPlan(plan, "csv");
    expect(csv.split("\r\n")[0]).toBe("item,base_type,score,recommendation,matched_builds,why");
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://example.invalid\"\")\"");
    expect(csv).toContain('"Ring, unique"');
  });

  it("creates a FilterBlade review guide without telling players to replace styles or hide low priorities", () => {
    const candidate = { name: "The Taming", baseType: "Prismatic Ring" };
    const testBuild = {
      ...SAMPLE_BUILD_MANIFEST,
      name: "Sample Winter Orb Elementalist",
      itemGoals: [{
        id: "test-taming",
        kind: "equip" as const,
        priority: 5 as const,
        match: { itemNames: [candidate.name], baseTypes: [candidate.baseType] },
        why: "Test target for the handoff export.",
        progressionStage: "atlas" as const,
      }],
    };
    const relevance = scoreItemRelevance(candidate, [testBuild]);
    const plan = buildPriorityPlan({
      league: "SSF Standard",
      character: "Test Elementalist",
      progressionStage: "atlas",
      builds: [{
        id: testBuild.id,
        name: testBuild.name,
        role: testBuild.role,
        source: testBuild.source,
      }],
      priorities: [{ item: candidate.name, baseType: candidate.baseType, relevance }],
    });

    const guide = serializePriorityPlan(plan, "markdown");
    expect(guide).toContain("not an importable FilterBlade module");
    expect(guide).toContain("keep your existing FilterBlade/NeverSink styles, sounds, and strictness");
    expect(guide).toContain("The Taming (Prismatic Ring)");
    expect(guide).toContain("ACTIVE: Sample Winter Orb Elementalist");
    expect(guide).toContain("it is not a hide or disable instruction");
    expect(guide).toContain("My Modules → Create new module");
    expect(guide).toContain("Overview → Modules");
    expect(guide).toContain("it cannot be uploaded as a module");
  });
});
