import { describe, expect, it } from "vitest";
import { shouldShowSampleBuilds } from "./sample-mode";

describe("shouldShowSampleBuilds", () => {
  it("shows examples for a brand-new local profile", () => {
    expect(shouldShowSampleBuilds({
      hasLeagues: false,
      hasCharacters: false,
      hasSavedBuilds: false,
      hasSessionBuilds: false,
    })).toBe(true);
  });

  it.each([
    ["league", { hasLeagues: true }],
    ["character", { hasCharacters: true }],
    ["saved build", { hasSavedBuilds: true }],
    ["session build", { hasSessionBuilds: true }],
  ])("does not replace a real %s profile with demo builds", (_label, partial) => {
    expect(shouldShowSampleBuilds({
      hasLeagues: false,
      hasCharacters: false,
      hasSavedBuilds: false,
      hasSessionBuilds: false,
      ...partial,
    })).toBe(false);
  });
});
