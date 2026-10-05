import { describe, expect, it } from "vitest";
import { auditFilterBladeFile } from "./filterblade-audit";

describe("FilterBlade filter audit", () => {
  it("keeps rule order, FilterBlade IDs, conditions, presentation, and Continue visible", () => {
    const filter = [
      "Show # $type->uniques $tier->recipeuniquerings",
      'BaseType == "Prismatic Ring"',
      "ItemLevel >= 2",
      "SetFontSize 45",
      "SetTextColor 255 120 30 255",
      "PlayAlertSound 6 300",
      "MinimapIcon 2 Red Star",
      "Continue",
      "Hide # $type->rarearmour $tier->low",
      'BaseType "Ring"',
    ].join("\n");

    const audit = auditFilterBladeFile(filter, "C:\\Users\\Player\\NeverSink.filter", [
      { item: "The Taming", baseType: "Prismatic Ring" },
    ]);
    const rules = audit.targets[0]?.rules ?? [];

    expect(audit).toMatchObject({ sourceFile: "NeverSink.filter", activeRuleCount: 2, importCount: 0 });
    expect(audit.targets[0]?.status).toBe("references_found");
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({
      order: 1,
      line: 1,
      effect: "Show",
      filterBladeRuleId: "uniques;recipeuniquerings",
      otherRuleLines: ["ItemLevel >= 2"],
      presentation: [
        "SetFontSize 45",
        "SetTextColor 255 120 30 255",
        "PlayAlertSound 6 300",
        "MinimapIcon 2 Red Star",
      ],
      continues: true,
    });
    expect(rules[0]?.baseTypeClauses[0]).toMatchObject({
      relation: "include",
      exact: true,
      mentionsTarget: true,
    });
    expect(rules[1]).toMatchObject({ order: 2, line: 9, effect: "Hide" });
    expect(rules[1]?.baseTypeClauses[0]).toMatchObject({ mentionsTarget: true, exact: false });
  });

  it("ignores commented-out rules, preserves exclusion context, and treats other clauses as conditions", () => {
    const filter = [
      "#Show",
      '# BaseType "Prismatic Ring"',
      "Show",
      'BaseType "Prismatic Ring"',
      'BaseType ! "Rustic Sash"',
      "Rarity Rare",
      "Hide",
      'BaseType ! "Prismatic Ring" # intentionally excluded',
    ].join("\n");

    const audit = auditFilterBladeFile(filter, "test.filter", [
      { item: "The Taming", baseType: "Prismatic Ring" },
    ]);
    const rules = audit.targets[0]?.rules ?? [];

    expect(audit.activeRuleCount).toBe(2);
    expect(rules).toHaveLength(2);
    expect(rules[0]?.otherRuleLines).toEqual(["Rarity Rare"]);
    expect(rules[0]?.baseTypeClauses.map((clause) => [clause.relation, clause.mentionsTarget])).toEqual([
      ["include", true],
      ["exclude", false],
    ]);
    expect(rules[1]?.baseTypeClauses[0]).toMatchObject({ relation: "exclude", mentionsTarget: true });
  });

  it("counts Import without following it and reports unknown or unmatched bases", () => {
    const filter = [
      'Import "My Modules\\personal.filter" Optional',
      "Show",
      'BaseType == "Vaal Regalia"',
    ].join("\n");

    const audit = auditFilterBladeFile(filter, "sample.filter", [
      { item: "Unknown target" },
      { item: "Heavy Belt", baseType: "Heavy Belt" },
    ]);

    expect(audit.importCount).toBe(1);
    expect(audit.activeRuleCount).toBe(1);
    expect(audit.targets.map((target) => target.status)).toEqual(["base_unknown", "no_reference"]);
    expect(audit.limitations.some((limitation) => limitation.includes("does not evaluate every game-filter condition"))).toBe(true);
  });

  it("handles quoted comment markers and escaped quotes", () => {
    const audit = auditFilterBladeFile(
      [
        "Show # $type->currency $tier->hash",
        'BaseType "Orb #1" "Maven \\"Fragment\\""',
      ].join("\n"),
      "filter.filter",
      [{ item: "Orb target", baseType: "Orb #1" }],
    );

    expect(audit.targets[0]?.rules[0]?.filterBladeRuleId).toBe("currency;hash");
    expect(audit.targets[0]?.rules[0]?.baseTypeClauses[0]?.values).toEqual(["Orb #1", 'Maven "Fragment"']);
  });

  it("reports when safety limits truncate unusually large clauses or reference lists", () => {
    const manyValues = Array.from({ length: 81 }, (_, index) => `"Value ${index}"`).join(" ");
    const manyRules = Array.from({ length: 101 }, () => ['Show', 'BaseType "Torturer\'s Mask"'].join("\n")).join("\n");
    const audit = auditFilterBladeFile(
      [`Show`, `BaseType ${manyValues}`, manyRules].join("\n"),
      "large.filter",
      [{ item: "Mask", baseType: "Torturer's Mask" }],
    );

    expect(audit.targets[0]?.rules).toHaveLength(100);
    expect(audit.limitations.some((limitation) => limitation.includes("more than 80 values"))).toBe(true);
    expect(audit.limitations.some((limitation) => limitation.includes("more than 100 candidate rules"))).toBe(true);
  });

  it("rejects oversized filters and excessive target plans", () => {
    expect(() => auditFilterBladeFile("x".repeat(8_000_001), "filter.filter", [])).toThrow("too large");
    expect(() => auditFilterBladeFile("", "filter.filter", Array.from({ length: 501 }, () => ({ item: "x" })))).toThrow("too many targets");
  });
});
