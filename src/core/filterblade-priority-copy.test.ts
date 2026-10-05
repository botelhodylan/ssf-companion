import { describe, expect, it } from "vitest";
import { auditFilterBladeFile } from "./filterblade-audit";
import { createFilterBladePriorityCopy } from "./filterblade-priority-copy";

describe("style-preserving FilterBlade priority copy", () => {
  it("prepends an exact target Show rule with its original conditions and presentation", () => {
    const original = [
      "# FilterBlade 8.20.1 · custom style",
      "Hide # $type->currency $tier->low",
      'BaseType "Scroll of Wisdom"',
      "Show # $type->uniques $tier->ringtier2",
      'BaseType == "Prismatic Ring"',
      "Rarity Unique",
      "ItemLevel >= 2",
      "SetFontSize 40",
      "SetTextColor 220 180 90",
      "PlayAlertSound 6 300",
      "MinimapIcon 2 Yellow Star",
    ].join("\r\n");
    const audit = auditFilterBladeFile(original, "NeverSink.filter", [
      { item: "The Taming", baseType: "Prismatic Ring" },
    ]);

    const copy = createFilterBladePriorityCopy(original, audit, [{
      item: "The Taming",
      baseType: "Prismatic Ring",
      score: 82,
      recommendation: "keep",
    }]);

    expect(copy.addedRuleCount).toBe(1);
    expect(copy.targets[0]).toMatchObject({ status: "added", sourceRuleOrder: 2 });
    expect(copy.overlayText).toContain("Show # SSF Companion KEEP priority 82: The Taming (Prismatic Ring); presentation copied from rule 2");
    expect(copy.overlayText).toContain('BaseType == "Prismatic Ring"\r\nRarity Unique\r\nItemLevel >= 2');
    expect(copy.overlayText).toContain("SetTextColor 220 180 90\r\nPlayAlertSound 6 300\r\nMinimapIcon 2 Yellow Star");
    expect(copy.content?.slice((copy.overlayText?.length ?? 0) + 2)).toBe(original);
    expect(copy.overlayText).not.toContain("$type->");
  });

  it("keeps a UTF-8 BOM first and deduplicates the same base type across targets", () => {
    const original = [
      "Show # $type->currency $tier->priority",
      'BaseType == "Orb of Annulment"',
      "SetFontSize 40",
      "SetTextColor 255 255 255",
    ].join("\n");
    const source = `\uFEFF${original}`;
    const audit = auditFilterBladeFile(source, "Custom.filter", [
      { item: "Orb of Annulment", baseType: "Orb of Annulment" },
      { item: "Second goal", baseType: "Orb of Annulment" },
    ]);

    const copy = createFilterBladePriorityCopy(source, audit, [
      { item: "Orb of Annulment", baseType: "Orb of Annulment", score: 72, recommendation: "keep" },
      { item: "Second goal", baseType: "Orb of Annulment", score: 48, recommendation: "consider" },
    ]);

    expect(copy.addedRuleCount).toBe(1);
    expect(copy.targets.map((target) => target.status)).toEqual(["added", "covered"]);
    expect(copy.content?.startsWith("\uFEFF# SSF Companion priority overlay")).toBe(true);
    expect(copy.content?.endsWith(original)).toBe(true);
  });

  it("never promotes low-priority targets or guesses broad, hidden, continuing, or styleless rules", () => {
    const filter = [
      "Show",
      'BaseType "Prismatic Ring"',
      "SetFontSize 40",
      "Show",
      'BaseType == "Leather Belt"',
      "SetFontSize 40",
      "Continue",
      "Show",
      'BaseType == "Gold Ring"',
      "Rarity Unique",
      "Show",
      'BaseType == "Iron Ring"',
      "Rarity Unique",
      "Hide",
      'BaseType == "Coral Ring"',
      "SetFontSize 40",
    ].join("\n");
    const goals = [
      { item: "Broad", baseType: "Prismatic Ring" },
      { item: "Continuing", baseType: "Leather Belt" },
      { item: "Styleless", baseType: "Gold Ring" },
      { item: "Hidden", baseType: "Coral Ring" },
      { item: "Not needed", baseType: "Iron Ring" },
    ];
    const audit = auditFilterBladeFile(filter, "manual.filter", goals);

    const copy = createFilterBladePriorityCopy(filter, audit, goals.map(({ item, baseType }, index) => ({
      item,
      baseType,
      score: index === 4 ? 12 : 65,
      recommendation: index === 4 ? "low_priority" as const : "keep" as const,
    })));

    expect(copy.addedRuleCount).toBe(0);
    expect(copy.content).toBeUndefined();
    expect(copy.targets.every((target) => target.status === "skipped")).toBe(true);
    expect(copy.targets[0]?.reason).toContain("No complete, exact-BaseType Show rule");
    expect(copy.targets[1]?.reason).toContain("No complete, exact-BaseType Show rule");
    expect(copy.targets[2]?.reason).toContain("No complete, exact-BaseType Show rule");
    expect(copy.targets[3]?.reason).toContain("No complete, exact-BaseType Show rule");
    expect(copy.targets[4]?.reason).toContain("Low-priority items are left");
  });

  it("withholds a source rule when its audited body was truncated", () => {
    const filter = [
      "Show",
      'BaseType == "Prismatic Ring"',
      ...Array.from({ length: 161 }, (_, index) => `Class Class${index}`),
      "SetFontSize 40",
    ].join("\n");
    const audit = auditFilterBladeFile(filter, "very-large-rule.filter", [
      { item: "The Taming", baseType: "Prismatic Ring" },
    ]);

    const copy = createFilterBladePriorityCopy(filter, audit, [{
      item: "The Taming",
      baseType: "Prismatic Ring",
      score: 80,
      recommendation: "keep",
    }]);

    expect(audit.targets[0]?.rules[0]?.bodyComplete).toBe(false);
    expect(copy.addedRuleCount).toBe(0);
    expect(copy.targets[0]?.reason).toContain("No complete, exact-BaseType Show rule");
  });

  it("refuses to layer a second copy over an existing SSF Companion overlay", () => {
    const existing = "# SSF Companion priority overlay - review before using in Path of Exile\nShow\n";
    const audit = auditFilterBladeFile(existing, "prioritized.filter", []);
    expect(() => createFilterBladePriorityCopy(existing, audit, [])).toThrow("already contains an SSF Companion overlay");
  });

  it("does not mistake an incidental later comment for an existing overlay", () => {
    const source = [
      "# A FilterBlade export",
      "# SSF Companion priority overlay was discussed in a note",
      "Show",
      'BaseType == "Prismatic Ring"',
      "SetFontSize 40",
    ].join("\n");
    const audit = auditFilterBladeFile(source, "source.filter", [{ item: "The Taming", baseType: "Prismatic Ring" }]);
    const copy = createFilterBladePriorityCopy(source, audit, [{
      item: "The Taming",
      baseType: "Prismatic Ring",
      score: 80,
      recommendation: "keep",
    }]);

    expect(copy.addedRuleCount).toBe(1);
    expect(copy.content?.endsWith(source)).toBe(true);
  });
});
