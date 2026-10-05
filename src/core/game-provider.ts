import type { GameProviderBoundary, ProgressionStage } from "./types";

const STAGE_ORDER: readonly ProgressionStage[] = [
  "campaign",
  "early_mapping",
  "atlas",
  "endgame",
];

/** PoE 1 identity and progression rules. There is no PoE 2 provider yet. */
export const poe1Provider: GameProviderBoundary<"poe1", ProgressionStage> = {
  game: "poe1",
  normalizeItemIdentity(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  },
  progressionDistance(from, to) {
    return STAGE_ORDER.indexOf(to) - STAGE_ORDER.indexOf(from);
  },
};
