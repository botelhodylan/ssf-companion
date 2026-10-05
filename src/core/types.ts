/**
 * Domain types for the PoE 1 SSF Companion core.
 *
 * The provider boundary is intentionally game-neutral. Only `poe1` has a
 * provider implementation in this slice; adding PoE 2 requires a separate
 * provider and must not leak PoE 1 item or progression assumptions into it.
 */

export type GameId = "poe1";

export type BuildRole = "ACTIVE" | "NEXT" | "INTERESTED";

export type ProgressionStage =
  | "campaign"
  | "early_mapping"
  | "atlas"
  | "endgame";

export type BuildSourceKind =
  | "pob_code"
  | "pobb_in"
  | "maxroll"
  | "manual"
  | "sample";

export type BuildImportState = "complete" | "partial";
export type BuildManifestConfidence = "high" | "medium" | "low";

export type ItemGoalKind = "equip" | "upgrade" | "crafting" | "progression";

/** A provider supplies game-specific identity and stage comparison rules. */
export interface GameProviderBoundary<
  TGame extends string = string,
  TStage extends string = string,
> {
  readonly game: TGame;
  normalizeItemIdentity(value: string): string;
  progressionDistance(from: TStage, to: TStage): number;
}

/**
 * A desired item, base, or crafting input for a build. Match fields are exact
 * after case and punctuation normalization; tags use any-of semantics.
 */
export interface ItemGoal {
  readonly id: string;
  readonly kind: ItemGoalKind;
  readonly priority: 1 | 2 | 3 | 4 | 5;
  readonly match: {
    readonly itemNames?: readonly string[];
    readonly baseTypes?: readonly string[];
    readonly anyTags?: readonly string[];
  };
  readonly why?: string;
  readonly progressionStage?: ProgressionStage;
  readonly targetQuantity?: number;
}

export interface BuildGemFact {
  /** Display name from the PoB Gem `nameSpec` attribute when available. */
  readonly name?: string;
  readonly role: "support" | "other" | "unknown";
  readonly gemId?: string;
  readonly skillId?: string;
  readonly level?: number;
  readonly quality?: number;
  readonly enabled?: boolean;
}

export interface BuildSkillGroup {
  /** One-based order inside its source SkillSet. */
  readonly index: number;
  readonly label?: string;
  readonly socketedIn?: string;
  readonly enabled?: boolean;
  readonly includeInFullDps?: boolean;
  readonly mainActiveSkillIndex?: number;
  readonly isMainSkillGroup: boolean;
  readonly mainSkillName?: string;
  readonly supportGemNames: readonly string[];
  readonly gems: readonly BuildGemFact[];
}

export interface BuildSkillSummary {
  readonly activeSkillSetId?: number;
  readonly activeSkillSetName?: string;
  readonly mainSkillGroupIndex?: number;
  readonly mainSkillName?: string;
  /** Support roles are inferred from displayed gem names, not a DPS data set. */
  readonly gemRoleMethod: "name_suffix_heuristic";
  readonly supportGemNames: readonly string[];
  readonly groups: readonly BuildSkillGroup[];
}

/** One named PoB skill-set loadout; only the active set has a selected main group. */
export interface BuildSkillSetFact {
  readonly id: number;
  readonly name?: string;
  readonly isActive: boolean;
  readonly groups: readonly BuildSkillGroup[];
}

export interface EquippedItemFact {
  readonly slotName: string;
  readonly itemId: string;
  /** The raw item-text rarity normalized to uppercase, if present. */
  readonly rarity?: string;
  /** Rare or unique display name, when the item text contains one. */
  readonly itemName?: string;
  readonly uniqueName?: string;
  readonly baseType?: string;
}

/** One named PoB gear loadout. Items refer only to item records in that set. */
export interface BuildEquipmentSetFact {
  readonly id: number;
  readonly name?: string;
  readonly isActive: boolean;
  readonly useSecondWeaponSet?: boolean;
  readonly equippedItems: readonly EquippedItemFact[];
}

/** A single saved tree in a PoB export. Node IDs are preserved as source facts. */
export interface PassiveSpecFact {
  readonly id: number;
  readonly name?: string;
  readonly treeVersion?: string;
  /** True only for the spec selected by the source PoB export. */
  readonly isActive?: boolean;
  readonly allocatedNodeIds: readonly number[];
}

export interface BuildManifest {
  readonly schemaVersion: 1;
  readonly game: "poe1";
  readonly id: string;
  readonly name: string;
  readonly className?: string;
  readonly ascendancy?: string;
  readonly level?: number;
  readonly role: BuildRole;
  /** Best-known stage for the build/character; imports may estimate it. */
  readonly progressionStage: ProgressionStage;
  readonly source: {
    readonly kind: BuildSourceKind;
    /** External URL only. PoB codes are not retained in the manifest. */
    readonly reference?: string;
    readonly importState: BuildImportState;
  };
  /** Summarized from the active PoB skill set; no damage calculation is done. */
  readonly skills?: BuildSkillSummary;
  /** Every imported PoB skill set, including inactive alternatives. */
  readonly skillSets?: readonly BuildSkillSetFact[];
  /** Facts from the active PoB item set, without importing item modifiers. */
  readonly equippedItems?: readonly EquippedItemFact[];
  /** Every imported PoB item set, including inactive alternatives. */
  readonly equipmentSets?: readonly BuildEquipmentSetFact[];
  /** Count of unique numeric node IDs stored in the active PoB Spec. */
  readonly passiveAllocationCount?: number;
  /** Named passive specs from the export; this does not rank or simulate nodes. */
  readonly passiveSpecs?: readonly PassiveSpecFact[];
  readonly parseWarnings?: readonly string[];
  readonly confidence?: BuildManifestConfidence;
  readonly itemGoals: readonly ItemGoal[];
}

export interface ItemCandidate {
  readonly id?: string;
  readonly name: string;
  readonly baseType?: string;
  readonly tags?: readonly string[];
  /** Set only on bundled examples so the UI never presents them as user data. */
  readonly demo?: boolean;
  /** Scarcity is 0 for readily replaceable through 1 for very scarce. */
  readonly scarcity?: number;
  /** Space/attention cost from 0 (none) through 10 (high). */
  readonly clutterCost?: number;
  /** Existing copies already available in the selected league stash. */
  readonly ownedCount?: number;
}

export interface RelevanceContext {
  /** Current character/league stage, when known. */
  readonly progressionStage?: ProgressionStage;
}

export interface RelevanceReason {
  readonly code:
    | "build_goal"
    | "scarcity"
    | "clutter_cost"
    | "already_owned";
  readonly text: string;
  /** Signed score contribution before final 0-100 clamping. */
  readonly points: number;
  readonly buildId?: string;
  readonly role?: BuildRole;
}

export interface ItemRelevance {
  readonly itemId: string;
  readonly itemName: string;
  readonly score: number;
  readonly recommendation: "keep" | "consider" | "low_priority";
  readonly matchedBuilds: readonly {
    readonly id: string;
    readonly name: string;
    readonly role: BuildRole;
  }[];
  readonly reasons: readonly RelevanceReason[];
}

export type BuildImportSource = "pob_code" | "pobb_in_url" | "maxroll_url" | "unknown";

/** No network fetch is implied by this result: URLs are recognized only. */
export interface BuildImportResult {
  readonly status: "complete" | "partial" | "unsupported";
  readonly source: BuildImportSource;
  readonly manifest?: BuildManifest;
  readonly reference?: string;
  /**
   * Safe, provider-specific request metadata for the desktop main process.
   * The importer itself never performs this request or follows redirects.
   */
  readonly fetchPlan?: BuildSourceFetchPlan;
  readonly message: string;
  readonly limitations: readonly string[];
}

export interface BuildSourceFetchPlan {
  readonly provider: "pobb_in" | "maxroll";
  readonly method: "GET";
  readonly url: string;
  readonly responseKind: "pob_code_or_xml" | "provider_payload";
  /** pobb.in asks integrations to identify themselves with a contact User-Agent. */
  readonly userAgentPolicy: "app_identity_and_configured_contact" | "app_identity";
  readonly allowedHost: "pobb.in" | "maxroll.gg";
}
