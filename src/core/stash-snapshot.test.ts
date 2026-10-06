import { describe, expect, it } from "vitest";
import {
  countStashMatches,
  createStashSnapshotTemplate,
  parseLocalStashSnapshot,
} from "./stash-snapshot";

function makeSnapshot(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: "ssf-companion-stash-snapshot",
    schemaVersion: 1,
    game: "poe1",
    leagueName: "Standard SSF",
    coverage: "complete",
    items: [
      { name: "Orb of Alteration", baseType: "Orb of Alteration", quantity: 12, tags: ["currency"] },
      { name: "Orb of Alteration", baseType: "Orb of Alteration", quantity: 3, tags: ["Crafting Currency"] },
      { name: "The Taming", baseType: "Prismatic Ring", quantity: 1 },
    ],
    ...overrides,
  });
}

describe("local league stash snapshots", () => {
  it("normalizes the player-authored file and aggregates duplicate names and bases", () => {
    const snapshot = parseLocalStashSnapshot(makeSnapshot(), "Standard SSF");

    expect(snapshot).toMatchObject({
      format: "ssf-companion-stash-snapshot",
      schemaVersion: 1,
      game: "poe1",
      leagueName: "Standard SSF",
      coverage: "complete",
    });
    expect(snapshot.items).toEqual([
      {
        name: "Orb of Alteration",
        baseType: "Orb of Alteration",
        tags: ["Crafting Currency", "currency"],
        quantity: 15,
      },
      { name: "The Taming", baseType: "Prismatic Ring", quantity: 1 },
    ]);
  });

  it("requires the selected league and supported local format", () => {
    expect(() => parseLocalStashSnapshot(makeSnapshot(), "Hardcore SSF"))
      .toThrow(/different league/);
    expect(() => parseLocalStashSnapshot(JSON.stringify({ league: "Standard SSF", items: [] }), "Standard SSF"))
      .toThrow(/supported SSF Companion/);
    expect(() => parseLocalStashSnapshot(makeSnapshot({ schemaVersion: 2 }), "Standard SSF"))
      .toThrow(/supported SSF Companion/);
  });

  it("rejects malformed counts, labels, and overlarge item lists", () => {
    expect(() => parseLocalStashSnapshot(makeSnapshot({
      items: [{ name: "Chaos Orb", quantity: 0 }],
    }), "Standard SSF")).toThrow(/quantity/);
    expect(() => parseLocalStashSnapshot(makeSnapshot({
      items: [{ name: "Chaos Orb", quantity: 1, tags: "currency" }],
    }), "Standard SSF")).toThrow(/tags/);
    expect(() => parseLocalStashSnapshot(makeSnapshot({
      items: Array.from({ length: 10_001 }, () => ({ name: "Chaos Orb", quantity: 1 })),
    }), "Standard SSF")).toThrow(/10,000/);
    expect(() => parseLocalStashSnapshot("{", "Standard SSF")).toThrow(/valid JSON/);
  });

  it("treats absent items as unknown in partial snapshots and zero in complete snapshots", () => {
    const partial = parseLocalStashSnapshot(makeSnapshot({ coverage: "partial" }), "Standard SSF");
    const complete = parseLocalStashSnapshot(makeSnapshot(), "Standard SSF");

    expect(countStashMatches(partial, { names: ["THE-TAMING"] })).toBe(1);
    expect(countStashMatches(partial, { names: ["Orb of Annulment"] })).toBeUndefined();
    expect(countStashMatches(complete, { names: ["Orb of Annulment"] })).toBe(0);
    expect(countStashMatches(partial, { baseTypes: ["prismatic ring"] })).toBe(1);
    expect(countStashMatches(partial, { tags: ["crafting currency"] })).toBe(15);
  });

  it("creates a partial template scoped to the selected league", () => {
    const template = createStashSnapshotTemplate("Necropolis SSF");
    expect(parseLocalStashSnapshot(template, "Necropolis SSF")).toMatchObject({
      leagueName: "Necropolis SSF",
      coverage: "partial",
      items: [],
    });
  });
});
