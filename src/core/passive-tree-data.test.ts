import { describe, expect, it } from "vitest";
import { parsePassiveTreeExport } from "./passive-tree-data";

const TREE_EXPORT = JSON.stringify({
  tree: "Default",
  nodes: {
    "100": { skill: 100, name: "Heart of Flame", isNotable: true, stats: ["10% increased Fire Damage"] },
    "101": { skill: 101, stats: ["12% increased Fire Damage"] },
    "102": { skill: 102, isKeystone: true, stats: ["Critical Strikes do not deal extra Damage"] },
  },
});

describe("parsePassiveTreeExport", () => {
  it("normalizes named node facts and trusts only the explicitly selected version", () => {
    const data = parsePassiveTreeExport(TREE_EXPORT, "3_29", "C:\\exports\\data.json");

    expect(data).toMatchObject({
      treeVersion: "3_29",
      sourceFile: "data.json",
      nodes: {
        "100": { id: 100, name: "Heart of Flame", kind: "notable", stats: ["10% increased Fire Damage"] },
        "101": { id: 101, stats: ["12% increased Fire Damage"] },
        "102": { id: 102, kind: "keystone", stats: ["Critical Strikes do not deal extra Damage"] },
      },
    });
    expect(data.importedAt).toMatch(/^\d{4}-\d\d-/);
  });

  it("keeps only node IDs present in imported build specs when requested", () => {
    const data = parsePassiveTreeExport(TREE_EXPORT, "3_29", "data.json", [101]);
    expect(Object.keys(data.nodes)).toEqual(["101"]);
  });

  it("rejects malformed, incompatible, and mismatched imports", () => {
    expect(() => parsePassiveTreeExport("{", "3_29", "data.json")).toThrow("not valid JSON");
    expect(() => parsePassiveTreeExport(TREE_EXPORT, "3.29", "data.json")).toThrow("Choose a PoB tree version");
    expect(() => parsePassiveTreeExport(JSON.stringify({ nodes: [] }), "3_29", "data.json")).toThrow("nodes object");
    expect(() => parsePassiveTreeExport(TREE_EXPORT, "3_29", "data.json", [999])).toThrow("No selected build node IDs");
  });
});
