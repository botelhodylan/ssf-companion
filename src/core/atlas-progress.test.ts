import { describe, expect, it } from "vitest";
import { parseAtlasProgressReport } from "./atlas-progress";

describe("parseAtlasProgressReport", () => {
  it("normalizes the Atlas total and labeled source counts without retaining report text", () => {
    expect(parseAtlasProgressReport([
      "132 total Atlas Passive Skill points (120 allocated)",
      "100/100 Bonus Objectives",
      "5/5 from Maven's Invitation: The Atlas",
      "Maven's Special Invitations: 4/6",
      "noise that is not a source count",
    ].join("\n"))).toEqual({
      totalPoints: 132,
      allocatedPoints: 120,
      sources: [
        { label: "Bonus Objectives", completed: 100, total: 100 },
        { label: "Maven's Invitation: The Atlas", completed: 5, total: 5 },
        { label: "Maven's Special Invitations", completed: 4, total: 6 },
      ],
    });
  });

  it("rejects unsupported summaries, inconsistent totals, and oversized input", () => {
    expect(() => parseAtlasProgressReport("100/100 Bonus Objectives"))
      .toThrow("No supported Atlas point total");
    expect(() => parseAtlasProgressReport("12 total Atlas Passive Skill points (13 allocated)"))
      .toThrow("internally inconsistent");
    expect(() => parseAtlasProgressReport("x".repeat(64_001)))
      .toThrow("64 KB import limit");
  });
});
