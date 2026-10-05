import type { BuildManifest, ItemCandidate, ItemGoal } from "./core/types";
import { SAMPLE_BUILD_SET } from "./core/sample-build";

export { SAMPLE_BUILD_SET };

export function candidateFromGoal(goal: ItemGoal): ItemCandidate {
  const name = goal.match.itemNames?.[0]
    ?? goal.match.baseTypes?.[0]
    ?? labelFromTag(goal.match.anyTags?.[0] ?? "SSF crafting material");
  const unique = Boolean(goal.match.itemNames?.length);
  return {
    id: `candidate-${goal.id}`,
    name,
    baseType: goal.match.baseTypes?.[0],
    tags: goal.match.anyTags,
    scarcity: unique ? 0.82 : goal.kind === "crafting" ? 0.36 : 0.52,
    clutterCost: goal.kind === "crafting" ? 1 : 2.5,
  };
}

export function goalsForBuilds(builds: readonly BuildManifest[], sampleMode: boolean): ItemCandidate[] {
  const unique = new Map<string, ItemCandidate>();
  for (const build of builds) {
    for (const goal of build.itemGoals) {
      const candidate = candidateFromGoal(goal);
      const key = normalize(candidate.name);
      const existing = unique.get(key);
      if (!existing || (candidate.scarcity ?? 0) > (existing.scarcity ?? 0)) unique.set(key, candidate);
    }
  }

  if (sampleMode && ![...unique.values()].some((candidate) => normalize(candidate.name) === "rare wand")) {
    unique.set("rare wand", {
      id: "example-rare-wand",
      name: "Rare wand",
      tags: ["generic-rare", "weapon"],
      scarcity: 0.08,
      clutterCost: 5,
    });
  }
  return [...unique.values()];
}

function labelFromTag(tag: string): string {
  return tag
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
