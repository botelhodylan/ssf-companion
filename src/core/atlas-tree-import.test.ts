import { describe, expect, it } from "vitest";
import { parseAtlasTreeDataset, parseAtlasTreeImport, parseAtlasTreeShareUrl, serializeAtlasTreeSnapshot } from "./atlas-tree-import";

const STANDARD_URL = "https://www.pathofexile.com/atlas-skill-tree/AAAABgAAAfdPAAA=";

describe("PoE 1 Atlas tree import", () => {
  it("reads node skill hashes from the official GGG Atlas share URL", () => {
    expect(parseAtlasTreeShareUrl(STANDARD_URL)).toEqual({
      sourceUrl: STANDARD_URL,
      ruleset: "standard",
      encodingVersion: 6,
      nodeSkillHashes: [0xf74f],
    });
  });

  it("accepts the historical version 5 Atlas URL layout", () => {
    expect(parseAtlasTreeShareUrl(urlForBytes([0, 0, 0, 5, 0, 0, 1, 0xf7, 0x4f, 0]))).toMatchObject({
      encodingVersion: 5,
      nodeSkillHashes: [0xf74f],
    });
  });

  it("recognizes Ruthless URLs and strips irrelevant query and fragment data", () => {
    const tree = parseAtlasTreeShareUrl("https://pathofexile.com/atlas-skill-tree/ruthless/AAAABgAAAfdPAAA=?utm_source=share#tree");
    expect(tree).toMatchObject({
      sourceUrl: "https://pathofexile.com/atlas-skill-tree/ruthless/AAAABgAAAfdPAAA=",
      ruleset: "ruthless",
      nodeSkillHashes: [0xf74f],
    });
  });

  it("round-trips a local SSF Companion Atlas snapshot against its original GGG URL", () => {
    const snapshot = serializeAtlasTreeSnapshot({
      name: "Expedition and Harvest",
      shareUrl: STANDARD_URL,
      ruleset: "standard",
      encodingVersion: 6,
      nodeSkillHashes: [0xf74f],
    });
    expect(parseAtlasTreeImport(snapshot)).toMatchObject({
      name: "Expedition and Harvest",
      sourceUrl: STANDARD_URL,
      nodeSkillHashes: [0xf74f],
    });
  });

  it("indexes labels and links from a player-selected GGG Atlas data export", () => {
    const dataset = parseAtlasTreeDataset(JSON.stringify({
      tree: "Atlas",
      points: { totalPoints: 138 },
      nodes: {
        root: { group: 0, out: ["1200"] },
        "63311": { skill: 63311, name: "Expedition Favors", isNotable: true, stats: ["Expedition Remnants in your Maps have 10% increased Quantity"] , in: [], out: ["1200"] },
        "1200": { skill: 1200, name: "Pack Size", stats: ["Maps have 1% increased Pack Size"], in: ["63311"], out: [] },
      },
    }), "C:\\users\\account\\data.json");

    expect(dataset.sourceFile).toBe("data.json");
    expect(dataset.nodes).toMatchObject({
      "63311": {
        skillHash: 63311,
        name: "Expedition Favors",
        kind: "notable",
        stats: ["Expedition Remnants in your Maps have 10% increased Quantity"],
        neighbors: [1200],
      },
      "1200": { skillHash: 1200, name: "Pack Size", neighbors: [63311] },
    });
    expect(dataset.nodes).not.toHaveProperty("root");
  });

  it("rejects non-Atlas JSON and oversized local data exports", () => {
    expect(() => parseAtlasTreeDataset(JSON.stringify({ tree: "Passive", nodes: { "10": { skill: 10, name: "Node", stats: [] } } }), "tree.json"))
      .toThrow("data.json file from GGG's Atlas tree export");
    expect(() => parseAtlasTreeDataset(" ".repeat(12_000_001), "data.json"))
      .toThrow("too large");
  });

  it("rejects remote lookalikes, non-HTTPS links, malformed routes, and non-Atlas payloads", () => {
    expect(() => parseAtlasTreeShareUrl("https://pathofexile.com.example/atlas-skill-tree/AAAABgAAAfdPAAA=")).toThrow("pathofexile.com");
    expect(() => parseAtlasTreeShareUrl("http://pathofexile.com/atlas-skill-tree/AAAABgAAAfdPAAA=")).toThrow("secure");
    expect(() => parseAtlasTreeShareUrl("https://pathofexile.com/passive-skill-tree/3.27.0/AAAABgAAAfdPAAA=")).toThrow("Atlas Skill Tree");
    expect(() => parseAtlasTreeShareUrl("https://pathofexile.com/atlas-skill-tree/AAAABwAAAfdPAAA=")).toThrow("format 7");
  });

  it("rejects class passives, extended hashes, malformed sizes, and snapshot tampering", () => {
    expect(() => parseAtlasTreeShareUrl(urlForBytes([0, 0, 0, 6, 1, 0, 0, 0]))).toThrow("class and ascendancy");
    expect(() => parseAtlasTreeShareUrl(urlForBytes([0, 0, 0, 6, 0, 0, 0, 1]))).toThrow("extended passive-tree hashes");
    expect(() => parseAtlasTreeShareUrl(urlForBytes([0, 0, 0, 6, 0, 0]))).toThrow("incomplete");

    const snapshot = JSON.parse(serializeAtlasTreeSnapshot({
      name: "Tree",
      shareUrl: STANDARD_URL,
      ruleset: "standard",
      encodingVersion: 6,
      nodeSkillHashes: [0xf74f],
    })) as { atlasTree: { nodeSkillHashes: number[] } };
    snapshot.atlasTree.nodeSkillHashes = [1234];
    expect(() => parseAtlasTreeImport(JSON.stringify(snapshot))).toThrow("does not match");
  });
});

function urlForBytes(bytes: readonly number[]): string {
  const binary = String.fromCharCode(...bytes);
  return `https://www.pathofexile.com/atlas-skill-tree/${btoa(binary)}`;
}
