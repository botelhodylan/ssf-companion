import type { BuildManifest, BuildRole, ItemRelevance, ProgressionStage } from "./types";
import type { FilterBladeAudit } from "./filterblade-audit";

export interface PriorityPlanBuild {
  readonly id: string;
  readonly name: string;
  readonly role: BuildRole;
  readonly source: BuildManifest["source"];
}

export interface PriorityPlanEntry {
  readonly item: string;
  readonly baseType?: string;
  readonly relevance: ItemRelevance;
}

export interface PriorityPlan {
  readonly schemaVersion: 1;
  readonly product: "SSF Companion";
  readonly game: "poe1";
  readonly league: string | null;
  readonly character: string | null;
  readonly progressionStage: ProgressionStage;
  readonly presentation: string;
  readonly builds: readonly PriorityPlanBuild[];
  readonly priorities: readonly {
    readonly item: string;
    readonly baseType: string | null;
    readonly score: number;
    readonly recommendation: ItemRelevance["recommendation"];
    readonly reasons: readonly Pick<ItemRelevance["reasons"][number], "code" | "points" | "text">[];
    readonly matchedBuilds: ItemRelevance["matchedBuilds"];
  }[];
}

export type PriorityPlanFormat = "json" | "csv" | "markdown";

export function buildPriorityPlan(input: {
  readonly league?: string;
  readonly character?: string;
  readonly progressionStage: ProgressionStage;
  readonly builds: readonly PriorityPlanBuild[];
  readonly priorities: readonly PriorityPlanEntry[];
}): PriorityPlan {
  return {
    schemaVersion: 1,
    product: "SSF Companion",
    game: "poe1",
    league: input.league ?? null,
    character: input.character ?? null,
    progressionStage: input.progressionStage,
    presentation: "Keep the player's existing FilterBlade/NeverSink filter and styles.",
    builds: input.builds.map(({ id, name, role, source }) => ({ id, name, role, source })),
    priorities: input.priorities.map(({ item, baseType, relevance }) => ({
      item,
      baseType: baseType ?? null,
      score: relevance.score,
      recommendation: relevance.recommendation,
      reasons: relevance.reasons.map(({ code, points, text }) => ({ code, points, text })),
      matchedBuilds: relevance.matchedBuilds,
    })),
  };
}

export function serializePriorityPlan(
  plan: PriorityPlan,
  format: PriorityPlanFormat,
  filterAudit?: FilterBladeAudit,
): string {
  if (format === "json") return JSON.stringify(plan, null, 2);
  if (format === "markdown") return serializeFilterBladeHandoff(plan, filterAudit);
  return [
    ["item", "base_type", "score", "recommendation", "matched_builds", "why"].map(csvCell).join(","),
    ...plan.priorities.map((priority) => [
      priority.item,
      priority.baseType ?? "",
      priority.score,
      priority.recommendation,
      priority.matchedBuilds.map((build) => `${build.role}: ${build.name}`).join("; "),
      priority.reasons.map((reason) => reason.text).join(" "),
    ].map(csvCell).join(",")),
  ].join("\r\n");
}

function serializeFilterBladeHandoff(plan: PriorityPlan, filterAudit?: FilterBladeAudit): string {
  const lines = [
    "# SSF Companion → FilterBlade handoff",
    "",
    "> Manual review guide. This is not an importable FilterBlade module or a generated `.filter` file.",
    "> It contains semantic priorities only; keep your existing FilterBlade/NeverSink styles, sounds, and strictness.",
    "",
    "## Context",
    "",
    `- Game: Path of Exile 1`,
    `- League: ${markdownText(plan.league ?? "Not selected")}`,
    `- Character: ${markdownText(plan.character ?? "Not selected")}`,
    `- Progression stage: ${markdownText(humanize(plan.progressionStage))}`,
    `- Builds: ${plan.builds.map((build) => `${build.role} — ${markdownText(build.name)}`).join("; ") || "None"}`,
    "",
    "## Apply in FilterBlade",
    "",
    "1. Open your existing PoE 1 filter through FilterBlade’s **My Filters** workflow.",
    "2. Find each target in its existing item or base-type tier list and review the recommendation below.",
    "3. Keep or promote useful targets with your existing visual style. This handoff never asks you to choose colors or sounds.",
    "4. Treat **Lower priority** as ‘no new highlight suggested’; it is not a hide or disable instruction.",
    "5. Review the result in FilterBlade’s simulator, then export it from FilterBlade when it looks right.",
    "",
    "## Optional: reuse these choices as a FilterBlade module",
    "",
    "To reuse selected changes across filters, start with FilterBlade **My Modules → Create new module**, choose the matching base filter and strictness, apply the targets you want in the customizer, then save through **Advanced → My Modules**. Later, apply your saved module from **Overview → Modules**.",
    "",
    "This generated guide is reference text only; it cannot be uploaded as a module.",
    "",
    ...(filterAudit ? serializeFilterAudit(filterAudit) : []),
    "## Targets",
    "",
    "| Target / base type | SSF priority | Score | Matched builds | Why |",
    "| --- | --- | ---: | --- | --- |",
    ...plan.priorities.map((priority) => {
      const target = priority.baseType && priority.baseType !== priority.item
        ? `${priority.item} (${priority.baseType})`
        : priority.item;
      const action = priority.recommendation === "keep"
        ? "Keep visible / highlight"
        : priority.recommendation === "consider"
          ? "Consider keeping visible"
          : "Lower priority (no hide instruction)";
      const builds = priority.matchedBuilds.map((build) => `${build.role}: ${build.name}`).join("; ") || "None";
      const reasons = priority.reasons.map((reason) => reason.text).join(" ") || "No explanation recorded.";
      return `| ${markdownCell(target)} | ${action} | ${priority.score} | ${markdownCell(builds)} | ${markdownCell(reasons)} |`;
    }),
    "",
    "## Limits",
    "",
    "These suggestions reflect the imported build goals and the data available when this file was exported. They do not inspect your live stash, prove item drop sources, or edit a filter. Verify each item in your current league and filter before changing its rule.",
    "",
  ];
  return lines.join("\n");
}

function serializeFilterAudit(audit: FilterBladeAudit): string[] {
  const maxTargets = 100;
  let remainingRuleReferences = 80;
  let omittedRuleReferences = 0;
  const lines = [
    "## Optional read-only audit of your current filter",
    "",
    `- Local file: ${markdownText(audit.sourceFile)}`,
    `- Active rules scanned: ${audit.activeRuleCount}`,
    `- Import directives counted but not opened: ${audit.importCount}`,
    "",
    "The entries below are candidate literal BaseType references. They do not evaluate the full rule stack or imported files and are not proof that an item will show or hide.",
    "",
  ];

  for (const target of audit.targets.slice(0, maxTargets)) {
    const baseType = target.baseType ? ` (${markdownText(target.baseType)})` : "";
    const status = target.status === "base_unknown"
      ? "base type unknown"
      : target.status === "no_reference"
        ? "no literal BaseType candidate found in the scanned file"
        : "candidate references found; inspect the full rules";
    lines.push(`- **${markdownText(target.item)}${baseType}** — ${status}`);

    const shownRules = target.rules.slice(0, remainingRuleReferences);
    remainingRuleReferences -= shownRules.length;
    omittedRuleReferences += target.rules.length - shownRules.length;
    for (const rule of shownRules) {
      const ruleId = rule.filterBladeRuleId ? ` · FilterBlade ID \`${markdownText(rule.filterBladeRuleId)}\`` : "";
      lines.push(`  - Rule ${rule.order}, line ${rule.line}: ${rule.effect}${ruleId}${rule.continues ? " · Continue" : ""}`);
      const candidateClauses = rule.baseTypeClauses.filter((clause) => clause.mentionsTarget).slice(0, 6);
      if (candidateClauses.length) {
        lines.push(`    - BaseType candidates: ${candidateClauses.map((clause) => `\`${markdownText(clause.text)}\``).join("; ")}`);
      }
      const conditions = rule.otherRuleLines.slice(0, 6);
      if (conditions.length) {
        lines.push(`    - Other conditions: ${conditions.map((condition) => `\`${markdownText(condition)}\``).join("; ")}`);
      }
      const presentation = rule.presentation.slice(0, 8);
      if (presentation.length) {
        lines.push(`    - Existing presentation: ${presentation.map((directive) => `\`${markdownText(directive)}\``).join("; ")}`);
      }
    }
  }

  const omittedTargets = Math.max(0, audit.targets.length - maxTargets);
  if (omittedTargets) lines.push(`- ${omittedTargets} additional targets were omitted to keep this guide compact.`);
  if (omittedRuleReferences) lines.push(`- ${omittedRuleReferences} additional candidate rule references were omitted to keep this guide compact.`);
  if (audit.limitations.length) {
    lines.push("", "Audit limits:", ...audit.limitations.map((limitation) => `- ${markdownText(limitation)}`));
  }
  lines.push("");
  return lines;
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function markdownText(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\\`*_{}\[\]<>!]/g, "\\$&")
    .replace(/\|/g, "\\|");
}

function markdownCell(value: string): string {
  return markdownText(value);
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  text = text.replace(/"/g, '""');
  return /[",\r\n]/.test(text) ? `"${text}"` : text;
}
