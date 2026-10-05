import { describe, expect, it } from "vitest";
import { auditFilterBladeFile } from "./filterblade-audit";
import { attachFilterBladeCustomizerNames, parseFilterBladeCustomizerOptions } from "./filterblade-options";

describe("FilterBlade Customizer option index", () => {
  it("indexes literal QuickUI rules, human labels, and canonical FilterBlade IDs", () => {
    const options = [
      "// QuickUI([0.0, \\\"commented out\\\", \\\"currency->none\\\"]);",
      "QuickUI([0.0, \"Delirium Orbs Tier 2\", \"currency->deliriumorbs;t2\"], \"SH\", [], \"A Tier\", [\"DeliriumOrbs\", \"O\"]);",
      "QuickUI([1.0, \"Loreweave Rings\", \"uniques;recipeuniquerings\"], \"SD\", [\"ItemLevel\"]);",
      "Function Example($s) { QuickUI($s, \"SH\", [\"BaseType\"]); }",
      "Description(\"A string mentioning QuickUI([0.0, \\\"not a rule\\\", \\\"currency;fake\\\"]);\");",
    ].join("\n");

    const parsed = parseFilterBladeCustomizerOptions(options, "C:\\User\\FilterBlade\\CustomizerDefault.options");

    expect(parsed).toMatchObject({
      sourceFile: "CustomizerDefault.options",
      quickUiCalls: 3,
      indexedRuleCount: 2,
      unmappedQuickUiCalls: 1,
    });
    expect(parsed.rules["currency;deliriumorbs;t2"]).toEqual({
      id: "currency;deliriumorbs;t2",
      name: "Delirium Orbs Tier 2",
      title: "A Tier",
    });
    expect(parsed.rules["uniques;recipeuniquerings"]?.name).toBe("Loreweave Rings");
  });

  it("only attaches an exact, unambiguous customizer ID match to filter audit candidates", () => {
    const audit = auditFilterBladeFile([
      "Show # $type->uniques $tier->recipeuniquerings",
      'BaseType == "Prismatic Ring"',
      "Hide # $type->uniques $tier->other",
      'BaseType "Prismatic Ring"',
    ].join("\n"), "NeverSink.filter", [{ item: "The Taming", baseType: "Prismatic Ring" }]);
    const options = parseFilterBladeCustomizerOptions([
      'QuickUI([0.0, "Loreweave Rings", "uniques;recipeuniquerings"], "SH", [], "Recipe Rings");',
      'QuickUI([0.0, "Other", "uniques;other"], "SH", []);',
    ].join("\n"), "CustomizerDefault.options");

    const enriched = attachFilterBladeCustomizerNames(audit, options);

    expect(enriched.targets[0]?.rules[0]?.customizerRule).toEqual({
      id: "uniques;recipeuniquerings",
      name: "Loreweave Rings",
      title: "Recipe Rings",
    });
    expect(enriched.targets[0]?.rules[1]?.customizerRule?.name).toBe("Other");

    const compoundTierAudit = auditFilterBladeFile([
      "Show # $type->currency $tier->deliriumorbs;t2",
      'BaseType "Delirium Orb"',
    ].join("\n"), "NeverSink.filter", [{ item: "Delirium Orb", baseType: "Delirium Orb" }]);
    const compoundTierOptions = parseFilterBladeCustomizerOptions(
      'QuickUI([0.0, "Delirium Orbs Tier 2", "currency->deliriumorbs;t2"], "SH", [], "A Tier");',
      "CustomizerDefault.options",
    );
    const compoundTierEnriched = attachFilterBladeCustomizerNames(compoundTierAudit, compoundTierOptions);
    expect(compoundTierEnriched.targets[0]?.rules[0]?.filterBladeRuleId).toBe("currency;deliriumorbs;t2");
    expect(compoundTierEnriched.targets[0]?.rules[0]?.customizerRule?.name).toBe("Delirium Orbs Tier 2");
  });

  it("withholds ambiguous IDs, ignores comments, and rejects malformed or oversized input", () => {
    const duplicate = parseFilterBladeCustomizerOptions([
      'QuickUI([0.0, "First", "currency;duplicate"], "SH", []);',
      'QuickUI([0.0, "Second", "currency;duplicate"], "SH", []);',
      'QuickUI([0.0, "Valid", "currency;valid"], "SH", []); // QuickUI([0.0, "comment", "currency;comment"]);',
    ].join("\n"), "options.txt");

    expect(duplicate.duplicateRuleIds).toEqual(["currency;duplicate"]);
    expect(duplicate.rules["currency;duplicate"]).toBeUndefined();
    expect(duplicate.rules["currency;valid"]?.name).toBe("Valid");
    expect(() => parseFilterBladeCustomizerOptions("TextOnly();", "empty.options")).toThrow("No unambiguous literal");
    expect(() => parseFilterBladeCustomizerOptions("x".repeat(1_000_001), "large.options")).toThrow("too large");
    expect(() => parseFilterBladeCustomizerOptions(Array.from({ length: 5_001 }, () => "QuickUI($s);").join("\n"), "many.options"))
      .toThrow("too many QuickUI entries");
  });
});
