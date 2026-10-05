export interface SampleModeProfileState {
  readonly hasLeagues: boolean;
  readonly hasCharacters: boolean;
  readonly hasSavedBuilds: boolean;
  readonly hasSessionBuilds: boolean;
}

/** Show bundled examples only before the player has created or imported anything. */
export function shouldShowSampleBuilds(state: SampleModeProfileState): boolean {
  return !state.hasLeagues
    && !state.hasCharacters
    && !state.hasSavedBuilds
    && !state.hasSessionBuilds;
}
