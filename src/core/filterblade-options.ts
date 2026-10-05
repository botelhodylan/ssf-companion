const MAX_OPTIONS_BYTES = 1_000_000;
const MAX_OPTIONS_CALLS = 5_000;
const MAX_INDEXED_RULES = 3_000;
const MAX_OPTIONS_LINE_LENGTH = 100_000;

export interface FilterBladeCustomizerRule {
  /** Stable FilterBlade type;tier identity carried in .filter comments. */
  readonly id: string;
  /** Name-id from the QuickUI option definition. */
  readonly name: string;
  /** Optional visible tier/button title supplied as QuickUI's fourth argument. */
  readonly title?: string;
}

export interface FilterBladeCustomizerOptions {
  readonly sourceFile: string;
  readonly rules: Readonly<Record<string, FilterBladeCustomizerRule>>;
  readonly quickUiCalls: number;
  readonly indexedRuleCount: number;
  readonly duplicateRuleIds: readonly string[];
  readonly unmappedQuickUiCalls: number;
}

interface ScannedCall {
  readonly args: readonly string[];
}

/**
 * Build a small read-only index from FilterBlade's local CustomizerDefault.options
 * file. This extracts only literal QuickUI rule identities and labels; it does
 * not execute the .options DSL or read/write FilterBlade user customizations.
 */
export function parseFilterBladeCustomizerOptions(
  content: string,
  sourceFile: string,
): FilterBladeCustomizerOptions {
  if (new TextEncoder().encode(content).byteLength > MAX_OPTIONS_BYTES) {
    throw new Error("That FilterBlade options file is too large to index safely.");
  }
  if (content.split(/\r?\n/).some((line) => line.length > MAX_OPTIONS_LINE_LENGTH)) {
    throw new Error("That FilterBlade options file contains an unusually long line.");
  }

  const calls = scanQuickUiCalls(content);
  if (calls.length > MAX_OPTIONS_CALLS) {
    throw new Error("That FilterBlade options file contains too many QuickUI entries to index safely.");
  }

  const rules: Record<string, FilterBladeCustomizerRule> = Object.create(null) as Record<string, FilterBladeCustomizerRule>;
  const duplicates = new Set<string>();
  let unmappedQuickUiCalls = 0;
  for (const call of calls) {
    const identity = parseQuickUiIdentity(call.args[0] ?? "");
    if (!identity) {
      unmappedQuickUiCalls += 1;
      continue;
    }
    if (rules[identity.id]) {
      duplicates.add(identity.id);
      delete rules[identity.id];
      continue;
    }
    if (duplicates.has(identity.id)) continue;
    const title = parseStringLiteral(call.args[3] ?? "");
    rules[identity.id] = {
      id: identity.id,
      name: identity.name,
      ...(title?.trim() ? { title: title.trim() } : {}),
    };
    if (Object.keys(rules).length > MAX_INDEXED_RULES) {
      throw new Error("That FilterBlade options file contains too many literal rules to index safely.");
    }
  }

  for (const id of duplicates) delete rules[id];
  if (Object.keys(rules).length === 0) {
    throw new Error("No unambiguous literal FilterBlade rule entries were found in that options file.");
  }

  return {
    sourceFile: safeFileName(sourceFile),
    rules,
    quickUiCalls: calls.length,
    indexedRuleCount: Object.keys(rules).length,
    duplicateRuleIds: [...duplicates].sort(),
    unmappedQuickUiCalls,
  };
}

/** Attach control labels only where the filter's exact stable ID matches. */
export function attachFilterBladeCustomizerNames<T extends {
  readonly targets: readonly {
    readonly rules: readonly ({ readonly filterBladeRuleId?: string; readonly customizerRule?: FilterBladeCustomizerRule })[];
  }[];
}>(audit: T, options: FilterBladeCustomizerOptions): T {
  return {
    ...audit,
    customizerOptions: {
      sourceFile: options.sourceFile,
      indexedRuleCount: options.indexedRuleCount,
      quickUiCalls: options.quickUiCalls,
      unmappedQuickUiCalls: options.unmappedQuickUiCalls,
      duplicateRuleIds: options.duplicateRuleIds,
    },
    targets: audit.targets.map((target) => ({
      ...target,
      rules: target.rules.map((rule) => {
        const customizerRule = rule.filterBladeRuleId ? options.rules[rule.filterBladeRuleId] : undefined;
        return customizerRule ? { ...rule, customizerRule } : rule;
      }),
    })),
  } as T;
}

function scanQuickUiCalls(content: string): ScannedCall[] {
  const calls: ScannedCall[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const character = content[cursor];
    if (character === '"') {
      cursor = skipString(content, cursor);
      continue;
    }
    if (character === "/" && content[cursor + 1] === "/") {
      cursor = skipLineComment(content, cursor + 2);
      continue;
    }
    if (!isIdentifierStart(character)) {
      cursor += 1;
      continue;
    }

    const tokenStart = cursor;
    cursor += 1;
    while (isIdentifierPart(content[cursor])) cursor += 1;
    if (content.slice(tokenStart, cursor) !== "QuickUI") continue;
    let open = cursor;
    while (/\s/.test(content[open] ?? "")) open += 1;
    if (content[open] !== "(") continue;
    const close = findCallClose(content, open);
    if (close < 0) continue;
    calls.push({ args: splitTopLevelArguments(content.slice(open + 1, close)) });
    if (calls.length > MAX_OPTIONS_CALLS) {
      throw new Error("That FilterBlade options file contains too many QuickUI entries to index safely.");
    }
    cursor = close + 1;
  }
  return calls;
}

function findCallClose(content: string, open: number): number {
  let depth = 1;
  let cursor = open + 1;
  while (cursor < content.length) {
    const character = content[cursor];
    if (character === '"') {
      cursor = skipString(content, cursor);
      continue;
    }
    if (character === "/" && content[cursor + 1] === "/") {
      cursor = skipLineComment(content, cursor + 2);
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
    cursor += 1;
  }
  return -1;
}

function splitTopLevelArguments(source: string): string[] {
  const args: string[] = [];
  let start = 0;
  const stack: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const character = source[cursor];
    if (character === '"') {
      cursor = skipString(source, cursor);
      continue;
    }
    if (character === "/" && source[cursor + 1] === "/") {
      cursor = skipLineComment(source, cursor + 2);
      continue;
    }
    if (character === "(" || character === "[" || character === "{") stack.push(character);
    else if (character === ")" || character === "]" || character === "}") stack.pop();
    else if (character === "," && stack.length === 0) {
      args.push(source.slice(start, cursor).trim());
      start = cursor + 1;
    }
    cursor += 1;
  }
  const tail = source.slice(start).trim();
  if (tail || args.length) args.push(tail);
  return args;
}

function parseQuickUiIdentity(argument: string): { id: string; name: string } | undefined {
  const value = argument.trim();
  if (!value.startsWith("[") || !value.endsWith("]")) return undefined;
  const values = splitTopLevelArguments(value.slice(1, -1));
  if (values.length !== 3 || !/^\d+(?:\.\d+)?$/.test(values[0] ?? "")) return undefined;
  const name = parseStringLiteral(values[1] ?? "");
  const rawId = parseStringLiteral(values[2] ?? "");
  if (!name?.trim() || !rawId?.trim()) return undefined;
  const id = canonicalFilterBladeId(rawId.trim());
  return id ? { id, name: name.trim() } : undefined;
}

function canonicalFilterBladeId(value: string): string | undefined {
  const arrow = value.indexOf("->");
  if (arrow >= 0) {
    const type = value.slice(0, arrow).trim();
    const tier = value.slice(arrow + 2).trim();
    return type && tier && !type.includes(";") ? `${type};${tier}` : undefined;
  }
  const separator = value.indexOf(";");
  if (separator <= 0 || separator === value.length - 1) return undefined;
  return value;
}

function parseStringLiteral(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function skipString(source: string, quote: number): number {
  let cursor = quote + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") cursor += 2;
    else if (source[cursor] === '"') return cursor + 1;
    else cursor += 1;
  }
  return source.length;
}

function skipLineComment(source: string, start: number): number {
  const newline = source.indexOf("\n", start);
  return newline < 0 ? source.length : newline + 1;
}

function isIdentifierStart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z_$]/.test(value);
}

function isIdentifierPart(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_$]/.test(value);
}

function safeFileName(value: string): string {
  return value.split(/[\\/]/).pop()?.trim().slice(0, 128) || "CustomizerDefault.options";
}
