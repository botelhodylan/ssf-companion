export interface FilterAuditTargetInput {
  readonly item: string;
  readonly baseType?: string | null;
}

export interface FilterAuditBaseTypeClause {
  readonly text: string;
  readonly values: readonly string[];
  readonly relation: "include" | "exclude";
  readonly exact: boolean;
  readonly mentionsTarget: boolean;
}

export interface FilterAuditRuleReference {
  readonly order: number;
  readonly line: number;
  readonly effect: "Show" | "Hide" | "Minimal";
  readonly filterBladeRuleId?: string;
  readonly baseTypeClauses: readonly FilterAuditBaseTypeClause[];
  readonly otherRuleLines: readonly string[];
  readonly presentation: readonly string[];
  /** Comment-free source body retained in memory for a reviewed style-copy export. */
  readonly bodyLines: readonly string[];
  /** False when the source rule body exceeded audit bounds or parser coverage. */
  readonly bodyComplete: boolean;
  readonly continues: boolean;
  /** Optional exact UI label from a player-selected FilterBlade options file. */
  readonly customizerRule?: {
    readonly id: string;
    readonly name: string;
    readonly title?: string;
  };
}

export interface FilterAuditTarget {
  readonly item: string;
  readonly baseType: string | null;
  readonly status: "base_unknown" | "no_reference" | "references_found";
  readonly rules: readonly FilterAuditRuleReference[];
}

export interface FilterBladeAudit {
  readonly sourceFile: string;
  readonly activeRuleCount: number;
  readonly importCount: number;
  readonly customizerOptions?: {
    readonly sourceFile: string;
    readonly indexedRuleCount: number;
    readonly quickUiCalls: number;
    readonly unmappedQuickUiCalls: number;
    readonly duplicateRuleIds: readonly string[];
  };
  readonly limitations: readonly string[];
  readonly targets: readonly FilterAuditTarget[];
}

const MAX_FILTER_BYTES = 8_000_000;
const MAX_FILTER_LINES = 180_000;
const MAX_RULES = 30_000;
const MAX_TARGETS = 500;
const MAX_REFERENCES_PER_TARGET = 100;
const MAX_VALUES_PER_CLAUSE = 80;
const MAX_BASE_TYPE_CLAUSES_PER_RULE = 50;
const MAX_TARGET_VALUE_COMPARISONS = 10_000_000;
const MAX_CAPTURED_DIRECTIVES = 20;
const MAX_CAPTURED_CONDITIONS = 30;
const MAX_LINE_LENGTH = 260;
const MAX_RULE_BODY_LINES = 160;
const MAX_RULE_BODY_CHARACTERS = 32_000;

const PRESENTATION_DIRECTIVES = new Set([
  "SetFontSize",
  "SetTextColor",
  "SetBorderColor",
  "SetBackgroundColor",
  "SetAlpha",
  "PlayAlertSound",
  "PlayAlertSoundPositional",
  "CustomAlertSound",
  "CustomAlertSoundOptional",
  "MinimapIcon",
  "PlayEffect",
  "DisableDropSound",
  "EnableDropSound",
  "DisableDropSoundIfAlertSound",
  "EnableDropSoundIfAlertSound",
]);

const AUDIT_LIMITATIONS = [
  "These are candidate BaseType mentions only; the audit does not evaluate every game-filter condition or prove that an item will show or hide.",
  "Import directives are counted, but imported filter files are not opened or analyzed.",
  "FilterBlade rule IDs, conditions, and presentation directives are shown as text for manual review; no FilterBlade customizer data is changed.",
] as const;

interface ParsedBaseTypeClause {
  readonly text: string;
  readonly values: readonly string[];
  readonly relation: "include" | "exclude";
  readonly exact: boolean;
}

interface MutableRule {
  readonly order: number;
  readonly line: number;
  readonly effect: FilterAuditRuleReference["effect"];
  readonly filterBladeRuleId?: string;
  readonly baseTypeClauses: ParsedBaseTypeClause[];
  readonly otherRuleLines: string[];
  readonly presentation: string[];
  readonly bodyLines: string[];
  bodyCharacters: number;
  bodyComplete: boolean;
  continues: boolean;
}

/**
 * Read-only, partial audit of a player-selected PoE item-filter export. It
 * records active rule order, BaseType mentions, nearby conditions, and styles;
 * it does not evaluate the whole filter or follow Import directives.
 */
export function auditFilterBladeFile(
  content: string,
  sourceFile: string,
  targets: readonly FilterAuditTargetInput[],
): FilterBladeAudit {
  if (new TextEncoder().encode(content).byteLength > MAX_FILTER_BYTES) {
    throw new Error("That filter file is too large to audit safely.");
  }
  if (targets.length > MAX_TARGETS) {
    throw new Error("That priority plan contains too many targets to audit safely.");
  }

  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length > MAX_FILTER_LINES) {
    throw new Error("That filter file has too many lines to audit safely.");
  }

  const rules: MutableRule[] = [];
  const coverageLimits = new Set<string>();
  let active: MutableRule | undefined;
  let importCount = 0;
  const finishRule = () => {
    if (!active) return;
    rules.push(active);
    active = undefined;
    if (rules.length > MAX_RULES) {
      throw new Error("That filter file contains too many active rules to audit safely.");
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const uncommented = stripComment(rawLine).trim();
    const importMatch = /^Import\s+"(?:[^"\\]|\\.)*"(?:\s+Optional)?\s*$/i.exec(uncommented);
    if (importMatch) {
      finishRule();
      importCount += 1;
      continue;
    }

    const header = /^(Show|Hide|Minimal)\b/i.exec(uncommented);
    if (header) {
      finishRule();
      const effect = header[1]?.toLowerCase() as "show" | "hide" | "minimal";
      const metadataComment = extractHeaderComment(rawLine);
      const typeTag = metadataComment.match(/\$type->([\w.-]+)/i)?.[1];
      const tierTag = metadataComment.match(/\$tier->([\w.-]+(?:;[\w.-]+)*)/i)?.[1];
      active = {
        order: rules.length + 1,
        line: index + 1,
        effect: effect === "show" ? "Show" : effect === "hide" ? "Hide" : "Minimal",
        ...(typeTag && tierTag ? { filterBladeRuleId: `${typeTag};${tierTag}` } : {}),
        baseTypeClauses: [],
        otherRuleLines: [],
        presentation: [],
        bodyLines: [],
        bodyCharacters: 0,
        bodyComplete: true,
        continues: false,
      };
      continue;
    }
    if (!active) continue;

    if (
      !uncommented ||
      uncommented.length > MAX_LINE_LENGTH ||
      active.bodyLines.length >= MAX_RULE_BODY_LINES ||
      active.bodyCharacters + uncommented.length > MAX_RULE_BODY_CHARACTERS
    ) {
      active.bodyComplete = false;
      coverageLimits.add(`Rule bodies above ${MAX_RULE_BODY_LINES} lines, ${MAX_RULE_BODY_CHARACTERS} characters, or ${MAX_LINE_LENGTH} characters per line cannot be copied safely.`);
    } else {
      active.bodyLines.push(uncommented);
      active.bodyCharacters += uncommented.length;
    }

    if (/^Continue\s*$/i.test(uncommented)) {
      active.continues = true;
      continue;
    }

    const baseType = /^BaseType\s*(==|!=|=|!)?\s*(.*)$/i.exec(uncommented);
    if (baseType) {
      const operator = baseType[1] ?? "";
      const parsedValues = quotedValues(baseType[2] ?? "", MAX_VALUES_PER_CLAUSE);
      if (parsedValues.truncated) {
        coverageLimits.add(`A BaseType clause with more than ${MAX_VALUES_PER_CLAUSE} values was only partially scanned.`);
        active.bodyComplete = false;
      }
      if (parsedValues.values.length && active.baseTypeClauses.length < MAX_BASE_TYPE_CLAUSES_PER_RULE) {
        active.baseTypeClauses.push({
          text: uncommented.slice(0, MAX_LINE_LENGTH),
          values: parsedValues.values,
          relation: operator === "!" || operator === "!=" ? "exclude" : "include",
          exact: operator === "==",
        });
      } else if (parsedValues.values.length) {
        coverageLimits.add(`Rules with more than ${MAX_BASE_TYPE_CLAUSES_PER_RULE} BaseType clauses were only partially scanned.`);
        active.bodyComplete = false;
      }
      continue;
    }

    const directive = /^([A-Za-z][A-Za-z0-9]*)\b/.exec(uncommented)?.[1];
    if (directive && PRESENTATION_DIRECTIVES.has(directive)) {
      if (active.presentation.length < MAX_CAPTURED_DIRECTIVES) {
        active.presentation.push(uncommented.slice(0, MAX_LINE_LENGTH));
      }
    } else if (active.otherRuleLines.length < MAX_CAPTURED_CONDITIONS) {
      active.otherRuleLines.push(uncommented.slice(0, MAX_LINE_LENGTH));
    }
  }
  finishRule();

  const estimatedValueComparisons = targets.length * rules.reduce((count, rule) =>
    count + rule.baseTypeClauses.reduce((clauseCount, clause) => clauseCount + clause.values.length, 0), 0);
  if (estimatedValueComparisons > MAX_TARGET_VALUE_COMPARISONS) {
    throw new Error("That filter and priority plan contain too many BaseType comparisons to audit safely.");
  }

  const auditTargets = targets.map((target) => {
      const baseType = target.baseType?.trim() || null;
      if (!baseType) return { item: target.item, baseType: null, status: "base_unknown" as const, rules: [] };
      const references: FilterAuditRuleReference[] = [];
      for (const rule of rules) {
        const hasMention = rule.baseTypeClauses.some((clause) =>
          clause.values.some((value) => baseTypeValueMentions(value, baseType, clause.exact)),
        );
        if (!hasMention) continue;
        if (references.length >= MAX_REFERENCES_PER_TARGET) {
          coverageLimits.add(`A target with more than ${MAX_REFERENCES_PER_TARGET} candidate rules shows only its first ${MAX_REFERENCES_PER_TARGET}.`);
          continue;
        }
        references.push({
          order: rule.order,
          line: rule.line,
          effect: rule.effect,
          ...(rule.filterBladeRuleId ? { filterBladeRuleId: rule.filterBladeRuleId } : {}),
          baseTypeClauses: rule.baseTypeClauses.map((clause) => ({
            ...clause,
            mentionsTarget: clause.values.some((value) => baseTypeValueMentions(value, baseType, clause.exact)),
          })),
          otherRuleLines: [...rule.otherRuleLines],
          presentation: [...rule.presentation],
          // Share the bounded parsed body across matching targets instead of
          // duplicating up to 32 KB for every target/rule reference pair.
          bodyLines: rule.bodyLines,
          bodyComplete: rule.bodyComplete,
          continues: rule.continues,
        });
      }
      return {
        item: target.item,
        baseType,
        status: references.length ? "references_found" as const : "no_reference" as const,
        rules: references,
      };
    });
  return {
    sourceFile: safeFileName(sourceFile),
    activeRuleCount: rules.length,
    importCount,
    limitations: [...AUDIT_LIMITATIONS, ...coverageLimits],
    targets: auditTargets,
  };
}

function baseTypeValueMentions(value: string, baseType: string, exact: boolean): boolean {
  const candidate = normalizeForComparison(baseType);
  const clauseValue = normalizeForComparison(value);
  return exact ? candidate === clauseValue : candidate.includes(clauseValue);
}

function normalizeForComparison(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

function stripComment(line: string): string {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (character === "#" && !inString) return line.slice(0, index);
  }
  return line;
}

function extractHeaderComment(line: string): string {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (character === "#" && !inString) return line.slice(index + 1);
  }
  return "";
}

function quotedValues(value: string, maxValues: number): { values: string[]; truncated: boolean } {
  const values: string[] = [];
  const expression = /"((?:[^"\\]|\\.)*)"/g;
  let truncated = false;
  for (const match of value.matchAll(expression)) {
    const unescaped = (match[1] ?? "").replace(/\\(["\\])/g, "$1").trim();
    if (!unescaped) continue;
    if (values.length >= maxValues) {
      truncated = true;
      break;
    }
    values.push(unescaped);
  }
  return { values, truncated };
}

function safeFileName(value: string): string {
  return value.split(/[\\/]/).pop()?.trim().slice(0, 128) || "filter.filter";
}
