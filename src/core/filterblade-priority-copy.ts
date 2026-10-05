import type { FilterBladeAudit, FilterAuditRuleReference } from "./filterblade-audit";
import type { ItemRelevance } from "./types";

const MAX_PRIORITY_TARGETS = 500;
const MAX_GENERATED_RULES = 100;
const MAX_OUTPUT_BYTES = 8_000_000;

export interface FilterPriorityCopyTarget {
  readonly item: string;
  readonly baseType?: string | null;
  readonly score: number;
  readonly recommendation: ItemRelevance["recommendation"];
}

export interface FilterPriorityCopyTargetResult {
  readonly item: string;
  readonly baseType: string | null;
  readonly score: number;
  readonly recommendation: ItemRelevance["recommendation"];
  readonly status: "added" | "covered" | "skipped";
  readonly reason: string;
  readonly sourceRuleOrder?: number;
  readonly block?: string;
}

export interface FilterBladePriorityCopy {
  readonly sourceFile: string;
  readonly sourceRuleCount: number;
  readonly targets: readonly FilterPriorityCopyTargetResult[];
  readonly addedRuleCount: number;
  /** Present only when at least one supported priority rule was generated. */
  readonly content?: string;
  /** Only the prepended rules; the selected source filter remains after them unchanged. */
  readonly overlayText?: string;
}

/**
 * Prepends bounded exact-BaseType Show rules copied from the selected filter.
 * Existing conditions and presentation commands stay in the copied rule body;
 * source text is preserved after the new overlay. This does not validate the
 * resulting filter with GGG or model imported rules.
 */
export function createFilterBladePriorityCopy(
  sourceContent: string,
  audit: FilterBladeAudit,
  targets: readonly FilterPriorityCopyTarget[],
): FilterBladePriorityCopy {
  if (targets.length > MAX_PRIORITY_TARGETS) {
    throw new Error("That priority plan contains too many targets to generate a filter copy safely.");
  }
  const sourceWithoutBom = sourceContent.replace(/^\uFEFF/, "");
  if (/^# SSF Companion priority overlay - review before using in Path of Exile(?:\r?\n|$)/.test(sourceWithoutBom)) {
    throw new Error("This filter already contains an SSF Companion overlay. Start again from the original FilterBlade export.");
  }

  const newline = sourceContent.includes("\r\n") ? "\r\n" : "\n";
  const targetResults: FilterPriorityCopyTargetResult[] = [];
  const generatedByBase = new Map<string, FilterPriorityCopyTargetResult>();
  const orderedTargets = [...targets].sort((left, right) =>
    recommendationRank(right.recommendation) - recommendationRank(left.recommendation) ||
    clampScore(right.score) - clampScore(left.score) ||
    normalize(left.item).localeCompare(normalize(right.item)),
  );
  for (const target of orderedTargets) {
    const baseType = target.baseType?.trim() || null;
    const score = clampScore(target.score);
    if (target.recommendation === "low_priority") {
      targetResults.push({
        item: target.item,
        baseType,
        score,
        recommendation: target.recommendation,
        status: "skipped",
        reason: "Low-priority items are left to the selected FilterBlade rules; this export never hides or disables them.",
      });
      continue;
    }
    if (!baseType) {
      targetResults.push({
        item: target.item,
        baseType: null,
        score,
        recommendation: target.recommendation,
        status: "skipped",
        reason: "The build goal has no exact base type, so a loot-filter rule cannot be generated safely.",
      });
      continue;
    }

    const targetAudit = audit.targets.find((entry) =>
      normalize(entry.item) === normalize(target.item) && entry.baseType && normalize(entry.baseType) === normalize(baseType),
    );
    const sourceRule = targetAudit?.rules.find((rule) => isCopyableExactShowRule(rule, baseType));
    if (!sourceRule) {
      const existing = generatedByBase.get(normalize(baseType));
      if (existing) {
        targetResults.push({
          item: target.item,
          baseType,
          score,
          recommendation: target.recommendation,
          status: "covered",
          reason: `This base type is already covered by the generated rule for ${existing.item}.`,
          sourceRuleOrder: existing.sourceRuleOrder,
        });
      } else {
        targetResults.push({
          item: target.item,
          baseType,
          score,
          recommendation: target.recommendation,
          status: "skipped",
          reason: "No complete, exact-BaseType Show rule with reusable presentation was found in the selected filter.",
        });
      }
      continue;
    }

    const existing = generatedByBase.get(normalize(baseType));
    if (existing) {
      targetResults.push({
        item: target.item,
        baseType,
        score,
        recommendation: target.recommendation,
        status: "covered",
        reason: `This base type is already covered by the generated rule for ${existing.item}.`,
        sourceRuleOrder: existing.sourceRuleOrder,
      });
      continue;
    }

    if (generatedByBase.size >= MAX_GENERATED_RULES) {
      targetResults.push({
        item: target.item,
        baseType,
        score,
        recommendation: target.recommendation,
        status: "skipped",
        reason: `The copy is limited to ${MAX_GENERATED_RULES} new priority rules; this target was left unchanged.`,
      });
      continue;
    }

    const priorityLabel = target.recommendation === "keep" ? "KEEP" : "CONSIDER";
    const comment = `Show # SSF Companion ${priorityLabel} priority ${score}: ${safeComment(target.item)} (${safeComment(baseType)}); presentation copied from rule ${sourceRule.order}`;
    const block = [comment, ...sourceRule.bodyLines].join(newline);
    const result: FilterPriorityCopyTargetResult = {
      item: target.item,
      baseType,
      score,
      recommendation: target.recommendation,
      status: "added",
      reason: `Copied all conditions and presentation from exact Show rule ${sourceRule.order}. Matching is by base type and those conditions, so other items with that base can also match.`,
      sourceRuleOrder: sourceRule.order,
      block,
    };
    generatedByBase.set(normalize(baseType), result);
    targetResults.push(result);
  }

  const addedBlocks = [...generatedByBase.values()];
  if (!addedBlocks.length) {
    return {
      sourceFile: audit.sourceFile,
      sourceRuleCount: audit.activeRuleCount,
      targets: targetResults,
      addedRuleCount: 0,
    };
  }

  const sourceHasBom = sourceContent.startsWith("\uFEFF");
  const original = sourceHasBom ? sourceContent.slice(1) : sourceContent;
  const overlayLines = [
    "# SSF Companion priority overlay - review before using in Path of Exile",
    `# Style and conditions copied from ${safeComment(audit.sourceFile)}; original rules follow unchanged.`,
    "",
    ...addedBlocks.flatMap(({ block }) => block ? [block, ""] : []),
  ];
  const overlayText = overlayLines.join(newline);
  const content = `${sourceHasBom ? "\uFEFF" : ""}${overlayText}${newline}${original}`;
  if (new TextEncoder().encode(content).byteLength > MAX_OUTPUT_BYTES) {
    throw new Error("The prioritized filter copy would exceed 8 MB. Reduce the number of included targets and try again.");
  }

  return {
    sourceFile: audit.sourceFile,
    sourceRuleCount: audit.activeRuleCount,
    targets: targetResults,
    addedRuleCount: addedBlocks.length,
    content,
    overlayText,
  };
}

function isCopyableExactShowRule(rule: FilterAuditRuleReference, baseType: string): boolean {
  if (rule.effect !== "Show" || rule.continues || !rule.bodyComplete || !rule.presentation.length) return false;
  if (rule.baseTypeClauses.length !== 1) return false;
  const [clause] = rule.baseTypeClauses;
  return Boolean(
    clause && clause.relation === "include" && clause.exact && clause.values.length === 1 &&
    normalize(clause.values[0] ?? "") === normalize(baseType) &&
    rule.bodyLines.length > 0 && rule.bodyLines.every((line) => !/^Continue\s*$/i.test(line)),
  );
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function recommendationRank(recommendation: ItemRelevance["recommendation"]): number {
  return recommendation === "keep" ? 2 : recommendation === "consider" ? 1 : 0;
}

function clampScore(score: number): number {
  return Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 0;
}

function safeComment(value: string): string {
  return value.replace(/[\r\n\t\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "unnamed target";
}
