import { describe, expect, it } from "vitest";
import { parsePassiveTreeExport } from "./passive-tree-data";

const TREE_EXPORT = JSON.stringify({
  tree: "Default",
  classes: [{ name: "Witch" }, { name: "Marauder" }],
  nodes: {
    "100": { skill: 100, name: "Heart of Flame", isNotable: true, stats: ["10% increased Fire Damage"], out: ["101"] },
    "101": { skill: 101, stats: ["12% increased Fire Damage"], in: ["100"], out: ["102"] },
    "102": { skill: 102, isKeystone: true, stats: ["Critical Strikes do not deal extra Damage"], in: ["101"] },
    "200": { skill: 200, name: "WITCH", stats: [], classStartIndex: 0, out: ["100"] },
    "201": { skill: 201, name: "MARAUDER", stats: [], classStartIndex: 1 },
    "999": { skill: 999, name: "Unused", stats: [] },
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
      classStartNodeIds: { Witch: 200, Marauder: 201 },
    });
    expect(data.importedAt).toMatch(/^\d{4}-\d\d-/);
  });

  it("keeps only node IDs present in imported build specs when requested", () => {
    const data = parsePassiveTreeExport(TREE_EXPORT, "3_29", "data.json", [101]);
    expect(Object.keys(data.nodes).sort()).toEqual(["101", "200", "201"]);
    expect(data.nodes["101"]?.neighbors).toBeUndefined();
    expect(data.nodes["200"]?.neighbors).toBeUndefined();
  });

  it("retains local graph links between relevant nodes and each class start", () => {
    const data = parsePassiveTreeExport(TREE_EXPORT, "3_29", "data.json", [100, 101, 102]);

    expect(data.classStartNodeIds).toEqual({ Witch: 200, Marauder: 201 });
    expect(data.nodes["200"]?.neighbors).toEqual([100]);
    expect(data.nodes["100"]?.neighbors).toEqual([101, 200]);
    expect(data.nodes["101"]?.neighbors).toEqual([100, 102]);
    expect(data.nodes["102"]?.neighbors).toEqual([101]);
    expect(data.nodes["999"]).toBeUndefined();
  });

  it("rejects malformed, incompatible, and mismatched imports", () => {
    expect(() => parsePassiveTreeExport("{", "3_29", "data.json")).toThrow("not valid JSON");
    expect(() => parsePassiveTreeExport(TREE_EXPORT, "3.29", "data.json")).toThrow("Choose a PoB tree version");
    expect(() => parsePassiveTreeExport(JSON.stringify({ nodes: [] }), "3_29", "data.json")).toThrow("nodes object");
    expect(() => parsePassiveTreeExport(TREE_EXPORT, "3_29", "data.json", [998])).toThrow("No selected build node IDs");
  });
});
