import type { BuildManifest, BuildSourceKind, ProgressionStage } from "./types";

export type SupportedPobBuildSource = Extract<BuildSourceKind, "pob_code" | "pobb_in" | "maxroll">;

export interface PobCharacterDraft {
  readonly leagueId: string;
  readonly name: string;
  readonly className: string;
  readonly level?: number;
  readonly progressionStage: ProgressionStage;
  readonly sourceBuildId: string;
  readonly sourceKind: SupportedPobBuildSource;
  readonly importState: BuildManifest["source"]["importState"];
}

export function isPobBuildSource(kind: BuildSourceKind): kind is SupportedPobBuildSource {
  return kind === "pob_code" || kind === "pobb_in" || kind === "maxroll";
}

/**
 * Prepare a reviewed local-character form from the player's explicitly ACTIVE
 * PoB import. This is a local snapshot and never claims live GGG character data.
 */
export function createPobCharacterDraft(manifest: BuildManifest, leagueId: string): PobCharacterDraft {
  const normalizedLeagueId = leagueId.trim();
  if (!normalizedLeagueId) throw new Error("Select a league before creating a character from a PoB build.");
  if (manifest.role !== "ACTIVE") throw new Error("Only a build marked ACTIVE can seed the current-character snapshot.");
  if (!isPobBuildSource(manifest.source.kind)) throw new Error("Use a Path of Building, pobb.in, or Maxroll PoB import for this action.");

  return {
    leagueId: normalizedLeagueId,
    name: manifest.name.trim(),
    className: manifest.className?.trim() ?? "",
    ...(manifest.level !== undefined && Number.isInteger(manifest.level) && manifest.level >= 1 && manifest.level <= 100
      ? { level: manifest.level }
      : {}),
    progressionStage: manifest.progressionStage,
    sourceBuildId: manifest.id,
    sourceKind: manifest.source.kind,
    importState: manifest.source.importState,
  };
}
