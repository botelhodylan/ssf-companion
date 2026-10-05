import type { BuildManifest, ItemCandidate } from "./types";

/** Clearly labeled demo data for the first PoE 1 relevance experience. */
export const SAMPLE_BUILD_MANIFEST: BuildManifest = {
  schemaVersion: 1,
  game: "poe1",
  id: "poe1-demo-winter-orb-elementalist",
  name: "Demo: Winter Orb Elementalist",
  className: "Witch",
  ascendancy: "Elementalist",
  level: 86,
  role: "ACTIVE",
  progressionStage: "atlas",
  source: { kind: "sample", importState: "complete" },
  itemGoals: [
    {
      id: "demo-winter-orb-helmet-base",
      kind: "crafting",
      priority: 4,
      match: { baseTypes: ["Torturer's Mask"] },
      why: "A hybrid evasion and energy shield helmet base can support the build's defenses.",
      progressionStage: "atlas",
    },
    {
      id: "demo-winter-orb-alteration",
      kind: "crafting",
      priority: 3,
      match: { itemNames: ["Orb of Alteration"] },
      why: "Alteration Orbs help roll useful affixes on magic crafting bases.",
      progressionStage: "atlas",
    },
    {
      id: "demo-winter-orb-resistance-craft",
      kind: "crafting",
      priority: 2,
      match: { anyTags: ["resistance-crafting", "life-crafting"] },
      why: "Useful crafting inputs can help fill defensive suffixes during progression.",
    },
  ],
};

/** Example candidates only; `demo` lets the UI label them as examples, not stash data. */
export const SAMPLE_ITEM_CANDIDATES: readonly ItemCandidate[] = [
  {
    id: "demo-torturers-mask",
    name: "Torturer's Mask",
    baseType: "Torturer's Mask",
    tags: ["helmet", "evasion", "energy-shield", "hybrid-defense"],
    demo: true,
    scarcity: 0.45,
    clutterCost: 2,
  },
  {
    id: "demo-orb-of-alteration",
    name: "Orb of Alteration",
    tags: ["currency", "crafting-currency", "alteration"],
    demo: true,
    scarcity: 0.25,
    clutterCost: 0.5,
  },
  {
    id: "demo-life-craft-input",
    name: "Life craft input",
    tags: ["life-crafting"],
    demo: true,
    scarcity: 0.2,
    clutterCost: 1,
  },
  {
    id: "demo-unmatched-clutter",
    name: "Unmatched clutter",
    demo: true,
    scarcity: 0.1,
    clutterCost: 8,
  },
];

export const SAMPLE_BUILD_SET: readonly BuildManifest[] = [
  SAMPLE_BUILD_MANIFEST,
  {
    schemaVersion: 1,
    game: "poe1",
    id: "poe1-sample-next-rf",
    name: "Demo: Next Righteous Fire Chieftain",
    className: "Marauder",
    ascendancy: "Chieftain",
    role: "NEXT",
    progressionStage: "early_mapping",
    source: { kind: "sample", importState: "complete" },
    itemGoals: [
      {
        id: "sample-next-life-craft",
        kind: "crafting",
        priority: 4,
        match: { anyTags: ["life-crafting"] },
        why: "Life crafting materials support the planned character transition.",
      },
    ],
  },
  {
    schemaVersion: 1,
    game: "poe1",
    id: "poe1-sample-interested-spark",
    name: "Demo: Interested Spark Inquisitor",
    className: "Templar",
    ascendancy: "Inquisitor",
    role: "INTERESTED",
    progressionStage: "atlas",
    source: { kind: "sample", importState: "complete" },
    itemGoals: [
      {
        id: "sample-interested-lightning",
        kind: "upgrade",
        priority: 3,
        match: { anyTags: ["lightning-upgrade"] },
        why: "This item could improve a build the player is considering.",
      },
    ],
  },
];
