import { poe1Provider } from "./game-provider";
import type {
  BuildManifest,
  BuildRole,
  ItemCandidate,
  ItemGoal,
  ItemGoalKind,
  ItemRelevance,
  RelevanceContext,
  RelevanceReason,
} from "./types";

const ROLE_WEIGHT: Readonly<Record<BuildRole, number>> = {
  ACTIVE: 1,
  NEXT: 0.7,
  INTERESTED: 0.4,
};

const GOAL_BASE_POINTS: Readonly<Record<ItemGoalKind, number>> = {
  equip: 40,
  upgrade: 34,
  crafting: 30,
  progression: 24,
};

/**
 * Deterministic, inspectable PoE 1 SSF relevance scoring.
 * It scores only the supplied normalized item facts and Build Manifests.
 */
export function scoreItemRelevance(
  candidate: ItemCandidate,
  builds: readonly BuildManifest[],
  context: RelevanceContext = {},
): ItemRelevance {
  const reasons: RelevanceReason[] = [];
  const matchedBuilds: ItemRelevance["matchedBuilds"][number][] = [];
  const currentStage = context.progressionStage;
  let rawScore = 0;

  for (const build of builds) {
    const matching = build.itemGoals
      .filter((goal) => goalMatches(goal, candidate))
      .map((goal) => ({
        goal,
        points: goalPoints(goal, candidate, build, currentStage ?? build.progressionStage),
      }))
      .sort((left, right) => right.points - left.points || left.goal.id.localeCompare(right.goal.id));
    const best = matching[0];
    if (!best) continue;

    rawScore += best.points;
    matchedBuilds.push({ id: build.id, name: build.name, role: build.role });
    reasons.push({
      code: "build_goal",
      buildId: build.id,
      role: build.role,
      points: best.points,
      text: goalReason(candidate, best.goal, build, best.points),
    });
  }

  const scarcity = clamp(candidate.scarcity ?? 0, 0, 1);
  if (scarcity > 0 && rawScore > 0) {
    const points = Math.round(scarcity * 8);
    rawScore += points;
    reasons.push({
      code: "scarcity",
      points,
      text: `Scarcity raises the value of this matching item by ${points} points.`,
    });
  }

  const ownedCount = Math.max(0, Math.floor(candidate.ownedCount ?? 0));
  if (ownedCount > 0 && matchedBuilds.length > 0) {
    reasons.push({
      code: "already_owned",
      points: 0,
      text: `${ownedCount} matching ${ownedCount === 1 ? "copy is" : "copies are"} already recorded in the league stash.`,
    });
  }

  const clutterCost = clamp(candidate.clutterCost ?? 0, 0, 10);
  if (clutterCost > 0) {
    const points = -Math.round(clutterCost * 1.2);
    rawScore += points;
    reasons.push({
      code: "clutter_cost",
      points,
      text: `Clutter cost lowers the score by ${Math.abs(points)} points.`,
    });
  }

  const score = clamp(Math.round(rawScore), 0, 100);
  return {
    itemId: candidate.id ?? stableItemId(candidate),
    itemName: candidate.name,
    score,
    recommendation: score >= 60 ? "keep" : score >= 30 ? "consider" : "low_priority",
    matchedBuilds,
    reasons,
  };
}

export function rankItemsByRelevance(
  candidates: readonly ItemCandidate[],
  builds: readonly BuildManifest[],
  context: RelevanceContext = {},
): ItemRelevance[] {
  return candidates
    .map((candidate) => scoreItemRelevance(candidate, builds, context))
    .sort((left, right) => right.score - left.score || left.itemName.localeCompare(right.itemName));
}

function goalMatches(goal: ItemGoal, item: ItemCandidate): boolean {
  const normalize = poe1Provider.normalizeItemIdentity;
  const itemName = normalize(item.name);
  const baseType = normalize(item.baseType ?? "");
  const nameMatch = (goal.match.itemNames ?? []).some((name) => normalize(name) === itemName);
  const baseMatch = (goal.match.baseTypes ?? []).some((base) => {
    const normalizedBase = normalize(base);
    return normalizedBase === baseType || normalizedBase === itemName;
  });
  const itemTags = new Set((item.tags ?? []).map(normalize));
  const tagMatch = (goal.match.anyTags ?? []).some((tag) => itemTags.has(normalize(tag)));
  return nameMatch || baseMatch || tagMatch;
}

function goalPoints(
  goal: ItemGoal,
  item: ItemCandidate,
  build: BuildManifest,
  currentStage: BuildManifest["progressionStage"],
): number {
  const priorityFactor = 0.72 + goal.priority * 0.07;
  const roleFactor = ROLE_WEIGHT[build.role];
  const stageFactor = goal.progressionStage
    ? progressionFactor(currentStage, goal.progressionStage)
    : 1;
  const targetQuantity = Math.max(1, Math.floor(goal.targetQuantity ?? 1));
  const ownedCount = Math.max(0, Math.floor(item.ownedCount ?? 0));
  const ownershipFactor = ownedCount >= targetQuantity
    ? 0.25
    : (targetQuantity - ownedCount) / targetQuantity;
  return Math.round(
    GOAL_BASE_POINTS[goal.kind] * priorityFactor * roleFactor * stageFactor * ownershipFactor,
  );
}

function progressionFactor(
  current: BuildManifest["progressionStage"],
  target: BuildManifest["progressionStage"],
): number {
  const distance = poe1Provider.progressionDistance(current, target);
  if (distance <= 0) return distance === 0 ? 1 : 0.85;
  return Math.max(0.35, 0.7 ** distance);
}

function goalReason(
  item: ItemCandidate,
  goal: ItemGoal,
  build: BuildManifest,
  points: number,
): string {
  const role = build.role;
  const matchDescription = goal.why ?? defaultGoalDescription(item, goal);
  const stage = goal.progressionStage ? ` Target stage: ${humanize(goal.progressionStage)}.` : "";
  const ownership = item.ownedCount
    ? ` Existing stash copies reduced the need (${item.ownedCount} already owned).`
    : "";
  return `${role} build “${build.name}”: ${matchDescription} (+${points}).${stage}${ownership}`;
}

function defaultGoalDescription(item: ItemCandidate, goal: ItemGoal): string {
  const kind = goal.kind === "equip"
    ? "equipped item"
    : goal.kind === "upgrade"
      ? "upgrade"
      : goal.kind === "crafting"
        ? "crafting goal"
        : "progression goal";
  return `matches this build's ${kind} (${item.name})`;
}

function humanize(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stableItemId(item: ItemCandidate): string {
  const value = `${item.name}|${item.baseType ?? ""}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `item-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
