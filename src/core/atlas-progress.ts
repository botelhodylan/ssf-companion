const MAX_REPORT_BYTES = 64_000;
const MAX_SOURCE_ROWS = 40;

export interface AtlasProgressSourceCount {
  readonly label: string;
  readonly completed: number;
  readonly total: number;
}

export interface ParsedAtlasProgressReport {
  /** Total Atlas passive points reported as earned by the game command. */
  readonly totalPoints: number;
  /** Points currently allocated on the league Atlas tree. */
  readonly allocatedPoints: number;
  /** Source counts are kept as labels from the report, not mapped to game rules. */
  readonly sources: readonly AtlasProgressSourceCount[];
}

/**
 * Parse the bounded English summary from the player's in-game /atlaspassives
 * report. This is deliberately a count importer; it does not infer objectives,
 * validate the current patch's point cap, or inspect the game client.
 */
export function parseAtlasProgressReport(content: string): ParsedAtlasProgressReport {
  if (new TextEncoder().encode(content).byteLength > MAX_REPORT_BYTES) {
    throw new Error("That Atlas progress report exceeds the 64 KB import limit.");
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)) {
    throw new Error("The Atlas progress report contains unsupported control characters.");
  }

  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 500) throw new Error("That Atlas progress report contains too many lines.");

  const totalLine = lines
    .map((line) => line.match(/^(\d{1,3})\s+total\s+Atlas\s+Passive\s+Skill\s+points?\s*\(\s*(\d{1,3})\s+allocated\s*\)$/i))
    .find((match) => match !== null);
  if (!totalLine) {
    throw new Error("No supported Atlas point total was found. Copy the full English output from /atlaspassives and review its format.");
  }

  const totalPoints = Number(totalLine[1]);
  const allocatedPoints = Number(totalLine[2]);
  if (totalPoints > 500 || allocatedPoints > totalPoints) {
    throw new Error("The Atlas point totals are outside the supported range or internally inconsistent.");
  }

  const sourcesByLabel = new Map<string, AtlasProgressSourceCount>();
  for (const line of lines) {
    if (line === totalLine[0]) continue;
    const countFirst = line.match(/^(\d{1,3})\s*\/\s*(\d{1,3})\s+(?:from\s+)?(.{2,100})$/i);
    const labelFirst = line.match(/^(.{2,100}?)\s*:\s*(\d{1,3})\s*\/\s*(\d{1,3})$/);
    const completed = countFirst ? Number(countFirst[1]) : labelFirst ? Number(labelFirst[2]) : undefined;
    const total = countFirst ? Number(countFirst[2]) : labelFirst ? Number(labelFirst[3]) : undefined;
    const label = (countFirst?.[3] ?? labelFirst?.[1] ?? "").replace(/\s+/g, " ").trim();
    if (completed === undefined || total === undefined || !label || total === 0 || completed > total) continue;

    const key = label.toLocaleLowerCase("en-US");
    if (!sourcesByLabel.has(key)) sourcesByLabel.set(key, { label: label.slice(0, 100), completed, total });
    if (sourcesByLabel.size >= MAX_SOURCE_ROWS) break;
  }

  return {
    totalPoints,
    allocatedPoints,
    sources: [...sourcesByLabel.values()],
  };
}
