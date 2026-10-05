import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FileCode2,
  FolderOpen,
  Home,
  ListFilter,
  Map,
  Plus,
  Route as RouteIcon,
  Settings2,
  UserRound,
} from "lucide-react";
import type { BuildManifest, BuildRole, ItemGoal, ProgressionStage } from "./core/types";
import { normalizeBuildInput } from "./core/build-import";
import { buildProgressionRoute, type ProgressionRouteStep } from "./core/progression-route";
import { auditFilterBladeFile, type FilterBladeAudit } from "./core/filterblade-audit";
import { attachFilterBladeCustomizerNames, parseFilterBladeCustomizerOptions, type FilterBladeCustomizerOptions } from "./core/filterblade-options";
import { parsePassiveTreeExport, type PassiveTreeDataset } from "./core/passive-tree-data";
import type { AtlasTreeDataset, AtlasTreeImport, SavedAtlasTree } from "./core/atlas-tree-import";
import { buildPriorityPlan, serializePriorityPlan, type PriorityPlanFormat } from "./core/priority-plan";
import { rankItemsByRelevance } from "./core/relevance";
import { AccountSyncStrip } from "./components/AccountSyncStrip";
import { AtlasTreesPage } from "./components/AtlasTreesPage";
import { ExplanationPanel } from "./components/ExplanationPanel";
import { Modal } from "./components/Modal";
import { PriorityTable, type PriorityRow } from "./components/PriorityTable";
import { goalsForBuilds, SAMPLE_BUILD_SET } from "./demo-data";

type Page = "Overview" | "Builds" | "Progression route" | "Atlas trees" | "Loot filter" | "Account";
type DialogKind = "connect" | "league" | "character" | null;
type StoredLeague = { id: string; name: string };
type StoredCharacter = {
  id: string;
  leagueId: string;
  name: string;
  className?: string;
  level?: number;
  progressionStage: ProgressionStage;
};
type StoredBuild = {
  manifest: BuildManifest;
  leagueId?: string;
  characterId?: string;
};
type StoredGoal = { buildId: string; goal: ItemGoal };
const GITHUB_ISSUES_URL = "https://github.com/botelhodylan/ssf-companion/issues";

const STORAGE = {
  leagues: "ssf-companion:leagues:v1",
  characters: "ssf-companion:characters:v1",
  builds: "ssf-companion:builds:v1",
  goals: "ssf-companion:goals:v1",
  leagueId: "ssf-companion:selected-league:v1",
  characterId: "ssf-companion:selected-character:v1",
  contact: "ssf-companion:pobb-contact:v2",
  legacyContact: "ssf-companion:pobb-contact:v1",
  passiveTreeData: "ssf-companion:passive-tree-data:v1",
  atlasTrees: "ssf-companion:atlas-trees:v1",
  atlasTreeData: "ssf-companion:atlas-tree-data:v1",
};

const ROLE_LABELS: readonly BuildRole[] = ["ACTIVE", "NEXT", "INTERESTED"];
const STAGE_OPTIONS: readonly { value: ProgressionStage; label: string }[] = [
  { value: "campaign", label: "Campaign" },
  { value: "early_mapping", label: "Early mapping" },
  { value: "atlas", label: "Atlas progression" },
  { value: "endgame", label: "Endgame" },
];
const PAGE_ICONS = {
  Overview: Home,
  Builds: BookOpen,
  "Progression route": RouteIcon,
  "Atlas trees": Map,
  "Loot filter": ListFilter,
  Account: UserRound,
} satisfies Record<Page, typeof Home>;

const ROUTE_STEP_LABELS: Record<ProgressionRouteStep["kind"], string> = {
  gear_gap: "Gear goal",
  equipment_comparison: "Gear transition",
  skill_transition: "Skill transition",
  crafting_plan: "Crafting",
  farming_atlas: "Farm & Atlas",
  passive_tree: "Character tree",
  loot_filter_priority: "Loot filter",
};

const ROUTE_STATUS_LABELS: Record<ProgressionRouteStep["status"], string> = {
  ready: "Ready to do",
  complete: "Covered by stash",
  already_aligned: "Already aligned",
  needs_personal_data: "Needs your data",
  needs_curated_data: "Needs verified game data",
  needs_personal_and_curated_data: "Needs player + game data",
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function useStoredValue<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStorage(key, initial));
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Keep the current session usable if storage is full. */ }
  }, [key, value]);
  return [value, setValue];
}

function formatStage(stage?: ProgressionStage): string {
  return STAGE_OPTIONS.find((option) => option.value === stage)?.label ?? "Unknown stage";
}

function sourceLabel(kind: BuildManifest["source"]["kind"]): string {
  if (kind === "pobb_in") return "pobb.in";
  if (kind === "maxroll") return "Maxroll PoB";
  if (kind === "pob_code") return "Path of Building";
  if (kind === "sample") return "Example data";
  return "Local import";
}

function extractProviderPayload(raw: string): string[] {
  const candidates = [raw.trim()];
  try {
    const decoded = JSON.parse(raw) as unknown;
    if (typeof decoded === "string") candidates.unshift(decoded);
    else if (decoded && typeof decoded === "object") {
      const record = decoded as Record<string, unknown>;
      for (const key of ["pobCode", "code", "buildCode", "data", "content"]) {
        if (typeof record[key] === "string") candidates.unshift(record[key] as string);
      }
    }
  } catch { /* Most supported endpoints return a raw PoB code. */ }
  return candidates;
}

function stageFromManifest(manifest: BuildManifest): ProgressionStage {
  return manifest.progressionStage;
}

export default function App() {
  const [page, setPage] = useState<Page>("Loot filter");
  const [leagues, setLeagues] = useStoredValue<StoredLeague[]>(STORAGE.leagues, []);
  const [characters, setCharacters] = useStoredValue<StoredCharacter[]>(STORAGE.characters, []);
  const [savedBuilds, setSavedBuilds] = useStoredValue<StoredBuild[]>(STORAGE.builds, []);
  const [savedGoals, setSavedGoals] = useStoredValue<StoredGoal[]>(STORAGE.goals, []);
  const [selectedLeagueId, setSelectedLeagueId] = useStoredValue<string>(STORAGE.leagueId, "");
  const [selectedCharacterId, setSelectedCharacterId] = useStoredValue<string>(STORAGE.characterId, "");
  const [pobbContact, setPobbContact] = useStoredValue<string>(
    STORAGE.contact,
    readStorage<string>(STORAGE.legacyContact, "").trim() || GITHUB_ISSUES_URL,
  );
  const [passiveTreeData, setPassiveTreeData] = useStoredValue<PassiveTreeDataset | null>(STORAGE.passiveTreeData, null);
  const [savedAtlasTrees, setSavedAtlasTrees] = useStoredValue<SavedAtlasTree[]>(STORAGE.atlasTrees, []);
  const [atlasTreeDataset, setAtlasTreeDataset] = useStoredValue<AtlasTreeDataset | null>(STORAGE.atlasTreeData, null);
  const [sessionBuilds, setSessionBuilds] = useState<BuildManifest[]>([]);
  const [roleTab, setRoleTab] = useState<BuildRole>("ACTIVE");
  const [selectedBuildId, setSelectedBuildId] = useState("");
  const [buildDetailsOpen, setBuildDetailsOpen] = useState(false);
  const [progressionOverride, setProgressionOverride] = useState<ProgressionStage>("atlas");
  const [progressionStageConfirmed, setProgressionStageConfirmed] = useState(false);
  const [selectedRouteStepId, setSelectedRouteStepId] = useState("");
  const [passiveTreeVersionSelection, setPassiveTreeVersionSelection] = useState("");
  const [filterAudit, setFilterAudit] = useState<{ audit: FilterBladeAudit; planKey: string } | null>(null);
  const [filterAuditModalOpen, setFilterAuditModalOpen] = useState(false);
  const [filterAuditImporting, setFilterAuditImporting] = useState(false);
  const [filterBladeOptions, setFilterBladeOptions] = useState<FilterBladeCustomizerOptions | null>(null);
  const [filterBladeOptionsImporting, setFilterBladeOptionsImporting] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [importInput, setImportInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [leagueNameInput, setLeagueNameInput] = useState("");
  const [characterNameInput, setCharacterNameInput] = useState("");
  const [characterClassInput, setCharacterClassInput] = useState("Ranger");
  const [characterLevelInput, setCharacterLevelInput] = useState("1");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [appVersion, setAppVersion] = useState("Source preview");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const passiveTreeFileInputRef = useRef<HTMLInputElement>(null);
  const filterFileInputRef = useRef<HTMLInputElement>(null);
  const filterBladeOptionsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void window.ssfDesktop?.getAppVersion().then(setAppVersion).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3300);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const selectedLeague = leagues.find((league) => league.id === selectedLeagueId);
  const leagueCharacters = characters.filter((character) => character.leagueId === selectedLeagueId);
  const selectedCharacter = leagueCharacters.find((character) => character.id === selectedCharacterId);

  useEffect(() => {
    if (selectedCharacterId && !characters.some((character) => character.id === selectedCharacterId && character.leagueId === selectedLeagueId)) {
      setSelectedCharacterId("");
    }
  }, [characters, selectedCharacterId, selectedLeagueId, setSelectedCharacterId]);

  const savedForCharacter = selectedCharacter
    ? savedBuilds.filter((record) => record.characterId === selectedCharacter.id && record.leagueId === selectedLeagueId)
    : [];
  const sessionAndSavedBuilds = [
    ...savedForCharacter.map((record) => record.manifest),
    ...sessionBuilds.filter((build) => !savedForCharacter.some((record) => record.manifest.id === build.id)),
  ];
  const sampleMode = !selectedCharacter && sessionBuilds.length === 0 && savedBuilds.length === 0;
  const visibleBuilds = sampleMode ? [...SAMPLE_BUILD_SET] : sessionAndSavedBuilds;
  const passiveTreeVersionOptions = [...new Set(visibleBuilds.flatMap((build) =>
    (build.passiveSpecs ?? []).flatMap((spec) => spec.treeVersion?.trim() ? [spec.treeVersion.trim()] : []),
  ))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const passiveTreeImportVersion = passiveTreeVersionOptions.includes(passiveTreeVersionSelection)
    ? passiveTreeVersionSelection
    : passiveTreeVersionOptions[0] ?? "";
  const roleBuilds = visibleBuilds.filter((build) => build.role === roleTab);
  const selectedBuild = roleBuilds.find((build) => build.id === selectedBuildId) ?? roleBuilds[0];
  const currentStage = selectedCharacter?.progressionStage ?? progressionOverride;
  const routeStage = selectedCharacter?.progressionStage
    ?? (sampleMode ? selectedBuild?.progressionStage : progressionStageConfirmed ? progressionOverride : undefined);

  const progressionRoute = useMemo(() => {
    if (!selectedBuild) return undefined;
    const source = selectedCharacter || progressionStageConfirmed
      ? "manual"
      : sampleMode
        ? "demo"
        : "unknown";
    const stage = routeStage ?? "unknown";
    const snapshotVersion = `local-${selectedCharacter?.id ?? (sampleMode ? "example" : "session")}-${stage}`;
    return buildProgressionRoute({
      build: selectedBuild,
      currentBuild: visibleBuilds.find((build) => build.role === "ACTIVE"),
      passiveTreeData,
      progression: {
        stage,
        source,
        version: snapshotVersion,
        ...(selectedCharacter?.level ? { characterLevel: selectedCharacter.level } : {}),
      },
    });
  }, [selectedBuild, visibleBuilds, selectedCharacter, progressionStageConfirmed, sampleMode, routeStage, passiveTreeData]);
  const selectedRouteStep = progressionRoute?.steps.find((step) => step.id === selectedRouteStepId)
    ?? progressionRoute?.steps[0];

  const buildsForScoring = useMemo(() => visibleBuilds.map((build) => ({
    ...build,
    itemGoals: [
      ...build.itemGoals,
      ...savedGoals.filter((entry) => entry.buildId === build.id).map((entry) => entry.goal),
    ],
  })), [visibleBuilds, savedGoals]);

  const candidates = useMemo(() => goalsForBuilds(buildsForScoring, sampleMode), [buildsForScoring, sampleMode]);
  const ranked = useMemo(() => rankItemsByRelevance(candidates, buildsForScoring, { progressionStage: currentStage }), [candidates, buildsForScoring, currentStage]);
  const rows = useMemo<PriorityRow[]>(() => ranked.map((relevance) => {
    const candidate = candidates.find((item) => item.id === relevance.itemId) ?? {
      id: relevance.itemId,
      name: relevance.itemName,
    };
    const goal = buildsForScoring.flatMap((build) => build.itemGoals).find((itemGoal) =>
      itemGoal.match.itemNames?.some((name) => name.toLowerCase() === candidate.name.toLowerCase())
      || itemGoal.match.baseTypes?.some((base) => base.toLowerCase() === candidate.baseType?.toLowerCase())
      || itemGoal.match.anyTags?.some((tag) => candidate.tags?.includes(tag)),
    );
    const kindLabel = goal?.kind === "equip" ? "Build item" : goal?.kind === "upgrade" ? "Upgrade target" : goal?.kind === "progression" ? "Progression" : "Crafting target";
    return { candidate, relevance, kindLabel };
  }), [ranked, candidates, buildsForScoring]);
  const selectedRow = rows.find((row) => row.relevance.itemId === selectedItemId) ?? rows[0];
  const pinnedIds = new Set(savedGoals.filter((entry) => entry.buildId === selectedBuild?.id).map((entry) => entry.goal.id.replace(/^user-pin-/, "")));
  const filterAuditPlanKey = useMemo(() => JSON.stringify({
    stage: currentStage,
    builds: buildsForScoring.map((build) => ({ id: build.id, role: build.role, goals: build.itemGoals })),
    targets: rows.map((row) => ({ item: row.candidate.name, baseType: row.candidate.baseType ?? null })),
  }), [currentStage, buildsForScoring, rows]);
  const currentFilterAudit = filterAudit?.planKey === filterAuditPlanKey ? filterAudit.audit : undefined;
  const filterAuditWithCustomizer = useMemo(() => currentFilterAudit && filterBladeOptions
    ? attachFilterBladeCustomizerNames(currentFilterAudit, filterBladeOptions)
    : currentFilterAudit,
  [currentFilterAudit, filterBladeOptions]);

  useEffect(() => {
    setFilterAudit(null);
    setFilterAuditModalOpen(false);
  }, [filterAuditPlanKey]);

  useEffect(() => {
    if (rows.length && !rows.some((row) => row.relevance.itemId === selectedItemId)) setSelectedItemId(rows[0].relevance.itemId);
    if (!rows.length) setSelectedItemId("");
  }, [rows, selectedItemId]);

  function notify(message: string) {
    setToast(message);
  }

  function handleLeagueSelection(value: string) {
    if (value === "__create") {
      setLeagueNameInput("");
      setDialog("league");
      return;
    }
    setSelectedLeagueId(value);
    setSelectedCharacterId("");
  }

  function handleCharacterSelection(value: string) {
    if (value === "__create") {
      setCharacterNameInput("");
      setCharacterClassInput("Ranger");
      setCharacterLevelInput("1");
      setDialog("character");
      return;
    }
    setSelectedCharacterId(value);
    const character = characters.find((item) => item.id === value);
    if (character) setProgressionOverride(character.progressionStage);
  }

  function createLeague(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = leagueNameInput.trim();
    if (!name) return;
    const duplicate = leagues.find((league) => league.name.toLowerCase() === name.toLowerCase());
    const league = duplicate ?? { id: `league-${crypto.randomUUID()}`, name };
    if (!duplicate) setLeagues((previous) => [...previous, league]);
    setSelectedLeagueId(league.id);
    setSelectedCharacterId("");
    setDialog(null);
  }

  function createCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLeagueId) return;
    const name = characterNameInput.trim();
    if (!name) return;
    const level = Number(characterLevelInput);
    const character: StoredCharacter = {
      id: `character-${crypto.randomUUID()}`,
      leagueId: selectedLeagueId,
      name,
      className: characterClassInput,
      ...(Number.isInteger(level) && level > 0 ? { level } : {}),
      progressionStage: "campaign",
    };
    setCharacters((previous) => [...previous, character]);
    setSelectedCharacterId(character.id);
    setProgressionOverride("campaign");
    setDialog(null);
  }

  function stageChanged(value: ProgressionStage) {
    setProgressionOverride(value);
    setProgressionStageConfirmed(true);
    if (selectedCharacter) {
      setCharacters((previous) => previous.map((character) => character.id === selectedCharacter.id
        ? { ...character, progressionStage: value }
        : character));
    }
  }

  function buildLocation(): { leagueId?: string; characterId?: string } {
    return selectedCharacter ? { leagueId: selectedLeagueId, characterId: selectedCharacter.id } : {};
  }

  function acceptManifest(
    manifest: BuildManifest,
    rawSourceKind: BuildManifest["source"]["kind"],
    reference?: string,
    warnings: readonly string[] = [],
  ) {
    const imported: BuildManifest = {
      ...manifest,
      role: roleTab,
      source: {
        ...manifest.source,
        kind: rawSourceKind,
        ...(reference ? { reference } : {}),
      },
    };
    const location = buildLocation();
    if (location.characterId) {
      setSavedBuilds((previous) => {
        const filtered = previous.filter((record) => record.manifest.id !== imported.id);
        return [...filtered, { manifest: imported, ...location }];
      });
      setSessionBuilds((previous) => previous.filter((build) => build.id !== imported.id));
      setImportMessage({ kind: warnings.length ? "info" : "success", text: `Imported ${imported.name} and saved it under ${selectedLeague?.name} → ${selectedCharacter?.name}.${warnings.length ? ` ${warnings.join(" ")}` : ""}` });
    } else {
      setSessionBuilds((previous) => [...previous.filter((build) => build.id !== imported.id), imported]);
      setImportMessage({ kind: warnings.length ? "info" : "success", text: `Imported ${imported.name} for this session. Choose a league, then a character, to save it in your local profile.${warnings.length ? ` ${warnings.join(" ")}` : ""}` });
    }
    setSelectedBuildId(imported.id);
    setBuildDetailsOpen(true);
    setRoleTab(roleTab);
    setProgressionOverride(stageFromManifest(imported));
    setSelectedItemId("");
    setImportInput("");
    setPage("Loot filter");
  }

  async function importBuild(rawInput: string) {
    const input = rawInput.trim();
    if (!input) {
      setImportMessage({ kind: "error", text: "Paste a PoB code, PoB XML, pobb.in link, or Maxroll PoB share URL first." });
      return;
    }
    if (input.length > 1_500_000) {
      setImportMessage({ kind: "error", text: "That import is too large. Choose a local PoB file or paste a smaller export." });
      return;
    }
    setImporting(true);
    setImportMessage({ kind: "info", text: "Reading the build locally…" });
    try {
      let result = await normalizeBuildInput(input);
      let providerKind: BuildManifest["source"]["kind"] = "pob_code";
      let reference: string | undefined;
      let warnings: readonly string[] = [];
      if (result.fetchPlan) {
        if (!window.ssfDesktop) throw new Error("Public-link fetching is available in the installed desktop app. Paste a PoB code for this preview.");
        const remote = await window.ssfDesktop.fetchBuildUrl(input, pobbContact);
        reference = input;
        providerKind = remote.kind === "pobb.in" ? "pobb_in" : "maxroll";
        let nextResult;
        let lastMessage = "The provider response did not contain a readable PoB payload.";
        for (const candidate of extractProviderPayload(remote.raw)) {
          nextResult = await normalizeBuildInput(candidate);
          if (nextResult.manifest) break;
          lastMessage = nextResult.message;
        }
        if (!nextResult?.manifest) throw new Error(lastMessage);
        result = nextResult;
      }
      if (!result.manifest) {
        setImportMessage({ kind: "error", text: `${result.message} ${result.limitations[0] ?? ""}`.trim() });
        return;
      }
      warnings = result.manifest.parseWarnings ?? [];
      if (!reference) reference = result.reference;
      acceptManifest(result.manifest, providerKind, reference, warnings);
    } catch (error) {
      setImportMessage({ kind: "error", text: error instanceof Error ? error.message : "The build could not be imported." });
    } finally {
      setImporting(false);
    }
  }

  async function openBuildFile() {
    if (window.ssfDesktop) {
      try {
        const file = await window.ssfDesktop.openBuildFile();
        if (file) await importBuild(file.content);
      } catch (error) {
        setImportMessage({ kind: "error", text: error instanceof Error ? error.message : "The file could not be opened." });
      }
      return;
    }
    fileInputRef.current?.click();
  }

  async function browserFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      setImportMessage({ kind: "error", text: "That file is too large to import safely." });
      event.target.value = "";
      return;
    }
    await importBuild(await file.text());
    event.target.value = "";
  }

  function importPassiveTreeFile(file: { name: string; content: string }) {
    if (!passiveTreeImportVersion) {
      notify("Import a PoB build with a passive-tree version before loading tree data.");
      return;
    }
    const relevantNodeIds = [...new Set(visibleBuilds.flatMap((build) =>
      (build.passiveSpecs ?? [])
        .filter((spec) => spec.treeVersion?.trim() === passiveTreeImportVersion)
        .flatMap((spec) => spec.allocatedNodeIds),
    ))];
    if (!relevantNodeIds.length) {
      notify(`No saved build contains node IDs for tree ${passiveTreeImportVersion}.`);
      return;
    }
    try {
      const imported = parsePassiveTreeExport(file.content, passiveTreeImportVersion, file.name, relevantNodeIds);
      setPassiveTreeData(imported);
      notify(`Loaded ${Object.keys(imported.nodes).length} relevant tree nodes for ${imported.treeVersion}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The passive-tree export could not be imported.");
    }
  }

  function saveAtlasTree(imported: AtlasTreeImport, name: string) {
    if (!selectedLeague) return;
    const importedAt = new Date().toISOString();
    const id = `atlas-${crypto.randomUUID()}`;
    setSavedAtlasTrees((previous) => {
      const existing = previous.find((tree) => tree.leagueId === selectedLeague.id && tree.sourceUrl === imported.sourceUrl);
      return [
        ...previous.filter((tree) => !(tree.leagueId === selectedLeague.id && tree.sourceUrl === imported.sourceUrl)),
        {
          ...imported,
          id: existing?.id ?? id,
          leagueId: selectedLeague.id,
          name,
          importedAt,
        },
      ];
    });
  }

  function removeAtlasTree(treeId: string) {
    setSavedAtlasTrees((previous) => previous.filter((tree) => tree.id !== treeId));
  }

  async function openPassiveTreeDataFile() {
    if (!passiveTreeImportVersion) {
      notify("Import a PoB build with a passive-tree version before loading tree data.");
      return;
    }
    if (window.ssfDesktop) {
      try {
        const file = await window.ssfDesktop.openPassiveTreeDataFile();
        if (file) importPassiveTreeFile(file);
      } catch (error) {
        notify(error instanceof Error ? error.message : "The passive-tree file could not be opened.");
      }
      return;
    }
    passiveTreeFileInputRef.current?.click();
  }

  async function browserPassiveTreeFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 12_000_000) {
      notify("That passive-tree export is too large to import safely.");
      event.target.value = "";
      return;
    }
    importPassiveTreeFile({ name: file.name, content: await file.text() });
    event.target.value = "";
  }

  function acceptFilterFile(file: { name: string; content: string }) {
    try {
      const audit = auditFilterBladeFile(file.content, file.name, rows.map((row) => ({
        item: row.candidate.name,
        baseType: row.candidate.baseType,
      })));
      setFilterAudit({ audit, planKey: filterAuditPlanKey });
      setFilterAuditModalOpen(true);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The filter file could not be audited.");
    }
  }

  function acceptFilterBladeOptionsFile(file: { name: string; content: string }) {
    try {
      const options = parseFilterBladeCustomizerOptions(file.content, file.name);
      setFilterBladeOptions(options);
      setToast(`Indexed ${options.indexedRuleCount.toLocaleString()} FilterBlade Customizer rule labels.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The FilterBlade options file could not be read.");
    }
  }

  async function openFilterBladeOptions() {
    if (window.ssfDesktop) {
      setFilterBladeOptionsImporting(true);
      try {
        const file = await window.ssfDesktop.openFilterBladeOptionsFile();
        if (file) acceptFilterBladeOptionsFile(file);
      } catch (error) {
        notify(error instanceof Error ? error.message : "The FilterBlade options file could not be opened.");
      } finally {
        setFilterBladeOptionsImporting(false);
      }
      return;
    }
    filterBladeOptionsInputRef.current?.click();
  }

  async function browserFilterBladeOptionsFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      notify("That FilterBlade options file is too large to index safely.");
      event.target.value = "";
      return;
    }
    acceptFilterBladeOptionsFile({ name: file.name, content: await file.text() });
    event.target.value = "";
  }

  async function openFilterAudit() {
    if (!rows.length) {
      notify("Import or select a build before auditing a FilterBlade export.");
      return;
    }
    if (window.ssfDesktop) {
      setFilterAuditImporting(true);
      try {
        const file = await window.ssfDesktop.openFilterFile();
        if (file) acceptFilterFile(file);
      } catch (error) {
        notify(error instanceof Error ? error.message : "The filter file could not be opened.");
      } finally {
        setFilterAuditImporting(false);
      }
      return;
    }
    filterFileInputRef.current?.click();
  }

  async function browserFilterFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8_000_000) {
      notify("That filter file is too large to audit safely.");
      event.target.value = "";
      return;
    }
    acceptFilterFile({ name: file.name, content: await file.text() });
    event.target.value = "";
  }

  function pinAsGoal(row: PriorityRow) {
    if (!selectedBuild) {
      notify("Import a build before adding a goal.");
      return;
    }
    if (pinnedIds.has(row.relevance.itemId)) return;
    const candidate = row.candidate;
    const match = candidate.baseType
      ? { baseTypes: [candidate.baseType] }
      : candidate.tags?.length
        ? { anyTags: [...candidate.tags] }
        : { itemNames: [candidate.name] };
    const goal: ItemGoal = {
      id: `user-pin-${row.relevance.itemId}`,
      kind: "upgrade",
      priority: 4,
      match,
      why: "Pinned from the loot-priority review as a personal SSF goal.",
      progressionStage: currentStage,
    };
    setSavedGoals((previous) => [...previous.filter((entry) => entry.goal.id !== goal.id), { buildId: selectedBuild.id, goal }]);
    notify(`${candidate.name} added as a goal for ${selectedBuild.name}.`);
  }

  function saveCurrentBuildToCharacter() {
    if (!selectedCharacter || !selectedLeague) {
      notify("Choose a league first, then create or select a character to save this build.");
      return;
    }
    if (!selectedBuild || selectedBuild.source.kind === "sample") {
      notify("Import a build before saving it to a character.");
      return;
    }
    setSavedBuilds((previous) => {
      const filtered = previous.filter((record) => record.manifest.id !== selectedBuild.id);
      return [...filtered, { manifest: selectedBuild, leagueId: selectedLeague.id, characterId: selectedCharacter.id }];
    });
    setSessionBuilds((previous) => previous.filter((build) => build.id !== selectedBuild.id));
    notify(`Saved ${selectedBuild.name} under ${selectedLeague.name} → ${selectedCharacter.name}.`);
  }

  async function openTrustedLink(url: string) {
    if (window.ssfDesktop) {
      await window.ssfDesktop.openTrustedLink(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function exportContent(format: PriorityPlanFormat) {
    if (!selectedBuild && !buildsForScoring.length) {
      notify("Import a build before exporting a priority plan.");
      setExportMenuOpen(false);
      return;
    }
    const plan = buildPriorityPlan({
      league: selectedLeague?.name,
      character: selectedCharacter?.name,
      progressionStage: currentStage,
      builds: buildsForScoring,
      priorities: rows.map((row) => ({
        item: row.candidate.name,
        baseType: row.candidate.baseType,
        relevance: row.relevance,
      })),
    });
    const content = serializePriorityPlan(plan, format, filterAuditWithCustomizer);
    const isHandoff = format === "markdown";
    const name = isHandoff ? "ssf-filterblade-handoff" : "ssf-priority-plan";
    if (window.ssfDesktop) {
      void window.ssfDesktop.saveExport(name, content, format).then((result) => {
        if (result.saved) notify(isHandoff ? "FilterBlade handoff exported as Markdown." : `Priority plan exported as ${format.toUpperCase()}.`);
      }).catch((error: unknown) => notify(error instanceof Error ? error.message : "Export failed."));
    } else {
      const mimeType = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/markdown";
      const blob = new Blob([content], { type: mimeType });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `${name}.${format === "markdown" ? "md" : format}`;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
      notify(isHandoff ? "FilterBlade handoff exported as Markdown." : `Priority plan exported as ${format.toUpperCase()}.`);
    }
    setExportMenuOpen(false);
  }

  function exportProgressionRoute() {
    if (!progressionRoute) {
      notify("Import or choose a build before exporting a progression route.");
      return;
    }
    const content = JSON.stringify({
      product: "SSF Companion",
      league: selectedLeague?.name ?? null,
      character: selectedCharacter?.name ?? null,
      route: progressionRoute,
    }, null, 2);
    if (window.ssfDesktop) {
      void window.ssfDesktop.saveExport("ssf-progression-route", content, "json").then((result) => {
        if (result.saved) notify("Progression route exported as JSON.");
      }).catch((error: unknown) => notify(error instanceof Error ? error.message : "Route export failed."));
      return;
    }
    const blob = new Blob([content], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = "ssf-progression-route.json";
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
    notify("Progression route exported as JSON.");
  }

  function renderContextControls() {
    return (
      <div className="context-controls">
        <div className="context-field">
          <label>Game</label>
          <div className="select-shell game-static" aria-label="Game: Path of Exile 1">
            <span className="poe-mark" aria-hidden="true">1</span>
            <span>Path of Exile 1</span>
            <ChevronDown size={15} />
          </div>
        </div>
        <div className="context-field">
          <label htmlFor="league-select">League</label>
          <div className="select-shell">
            <select id="league-select" value={selectedLeagueId} onChange={(event) => handleLeagueSelection(event.target.value)}>
              <option value="">Choose a league</option>
              {leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
              <option value="__create">+ Add local league…</option>
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </div>
        </div>
        <div className="context-field">
          <label htmlFor="character-select">Character</label>
          <div className={`select-shell ${!selectedLeagueId ? "is-disabled" : ""}`}>
            <select
              id="character-select"
              value={selectedCharacterId}
              onChange={(event) => handleCharacterSelection(event.target.value)}
              disabled={!selectedLeagueId}
              aria-describedby="character-hint"
            >
              <option value="">{selectedLeagueId ? "Choose a character" : "Choose a league first"}</option>
              {leagueCharacters.map((character) => <option key={character.id} value={character.id}>{character.name}{character.level ? ` · Lv. ${character.level}` : ""}</option>)}
              {selectedLeagueId && <option value="__create">+ Add local character…</option>}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </div>
          <span className="sr-only" id="character-hint">Select a league before choosing a character.</span>
        </div>
      </div>
    );
  }

  function renderBuildRoles() {
    return (
      <div className="build-role-row">
        <span className="role-label">Build</span>
        <div className="role-tabs" role="tablist" aria-label="Build role">
          {ROLE_LABELS.map((role) => {
            const count = visibleBuilds.filter((build) => build.role === role).length;
            return (
              <button
                type="button"
                key={role}
                role="tab"
                aria-selected={roleTab === role}
                className={roleTab === role ? "role-tab is-selected" : "role-tab"}
                onClick={() => {
                  setRoleTab(role);
                  const firstBuild = visibleBuilds.find((build) => build.role === role);
                  setSelectedBuildId(firstBuild?.id ?? "");
                }}
              >
                {role}<span className="role-count">{count || "—"}</span>
              </button>
            );
          })}
        </div>
        {selectedBuild && <span className="build-source-tag">{sourceLabel(selectedBuild.source.kind)}</span>}
      </div>
    );
  }

  function renderImportBar() {
    return (
      <section className="import-section" aria-label="Import a build">
        <div className="import-form-row">
          <label className="import-label" htmlFor="build-import">Import build</label>
          <div className="import-control-group">
            <textarea
              id="build-import"
              value={importInput}
              onChange={(event) => setImportInput(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void importBuild(importInput);
              }}
              placeholder="Paste a pobb.in link, PoB code, or Maxroll URL"
              rows={1}
              aria-describedby="import-help"
              disabled={importing}
            />
            <button className="button button-primary import-button" type="button" onClick={() => void importBuild(importInput)} disabled={importing}>
              {importing ? <span className="spinner" aria-hidden="true" /> : null}
              {importing ? "Importing…" : "Import build"}
            </button>
          </div>
        </div>
        <div className="import-secondary-row">
          <button className="text-link file-import-link" type="button" onClick={() => void openBuildFile()}>
            <FolderOpen size={14} /> Import Path of Building file
          </button>
          <span className="keyboard-hint" id="import-help">Ctrl + Enter to import pasted code</span>
          <input ref={fileInputRef} className="sr-only" type="file" accept=".pob,.xml,.txt,text/plain,application/xml" onChange={(event) => void browserFileChosen(event)} />
        </div>
        {importMessage && <div className={`import-message message-${importMessage.kind}`} role={importMessage.kind === "error" ? "alert" : "status"}>{importMessage.text}</div>}
      </section>
    );
  }

  function renderPriorityWorkspace() {
    const skillSummary = selectedBuild?.skills;
    const equippedItems = selectedBuild?.equippedItems ?? [];
    const hasManifestDetails = Boolean(selectedBuild && (
      selectedBuild.skills || selectedBuild.equippedItems?.length ||
      selectedBuild.skillSets?.length || selectedBuild.equipmentSets?.length ||
      selectedBuild.passiveAllocationCount !== undefined || selectedBuild.parseWarnings?.length
    ));

    return (
      <div className="page-body priority-workspace">
        <div className="center-column">
          <header className="page-intro">
            <h1>Loot filter workspace</h1>
            <p>Your build, progression, and SSF goals shape what matters.</p>
          </header>

          {renderContextControls()}
          {renderBuildRoles()}

          {selectedBuild ? (
            <div className="build-summary-line">
              <div className="build-summary-title">
                <strong>{selectedBuild.name}</strong>
                {sampleMode && <span className="example-label">Example build</span>}
              </div>
              <span className="build-summary-meta">
                {[selectedBuild.ascendancy, selectedBuild.className, selectedBuild.level ? `Level ${selectedBuild.level}` : undefined].filter(Boolean).join(" · ") || "PoE 1 build"}
              </span>
              {!sampleMode && <button className="save-build-link" type="button" onClick={saveCurrentBuildToCharacter}><Check size={13} /> Save to character</button>}
            </div>
          ) : (
            <div className="build-empty-line">
              <span>{roleTab === "NEXT" ? "No NEXT build saved for this character yet." : roleTab === "INTERESTED" ? "No INTERESTED builds saved for this character yet." : "Import a build to begin this character's priority plan."}</span>
              <button className="text-link" type="button" onClick={() => document.getElementById("build-import")?.focus()}>Go to build import <ArrowRight size={13} /></button>
            </div>
          )}

          {hasManifestDetails && selectedBuild && (
            <section className="build-manifest-details" aria-label="Imported build details">
              <button className="build-details-toggle" type="button" aria-expanded={buildDetailsOpen} onClick={() => setBuildDetailsOpen((open) => !open)}>
                <span><FileCode2 size={14} /> Build manifest · {selectedBuild.confidence ?? "unrated"} confidence</span>
                <ChevronDown size={14} className={buildDetailsOpen ? "details-chevron is-open" : "details-chevron"} />
              </button>
              {buildDetailsOpen && (
                <div className="build-details-grid">
                  <div><span>Main skill</span><strong>{skillSummary?.mainSkillName ?? "Not detected"}</strong></div>
                  <div><span>Support gems</span><strong>{skillSummary?.supportGemNames.length ? skillSummary.supportGemNames.join(", ") : "Not detected"}</strong></div>
                  <div><span>Equipped items</span><strong>{equippedItems.length ? equippedItems.map((item) => `${item.slotName}: ${item.uniqueName ?? item.itemName ?? item.baseType ?? "Item"}`).join(" · ") : "Not detected"}</strong></div>
                  <div><span>Passive allocation</span><strong>{selectedBuild.passiveAllocationCount === undefined ? "Not detected" : `${selectedBuild.passiveAllocationCount} unique nodes`}</strong></div>
                  {selectedBuild.equipmentSets?.length ? (
                    <div className="build-details-full">
                      <span>Gear setups ({selectedBuild.equipmentSets.length})</span>
                      <ul className="build-loadout-list">
                        {selectedBuild.equipmentSets.map((set) => (
                          <li key={`gear-set-${set.id}`}>
                            <div className="build-set-heading">
                              <strong>{set.name ?? `Gear set ${set.id}`}</strong>
                              <span className={set.isActive ? "build-set-state is-active" : "build-set-state"}>{set.isActive ? "ACTIVE" : "ALTERNATIVE"}</span>
                              {set.useSecondWeaponSet && <small>Second weapon set</small>}
                            </div>
                            <p>{set.equippedItems.length ? set.equippedItems.map((item) => `${item.slotName}: ${item.uniqueName ?? item.itemName ?? item.baseType ?? "Item"}`).join(" · ") : "No equipped item slots found."}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {selectedBuild.skillSets?.length ? (
                    <div className="build-details-full">
                      <span>Skill setups ({selectedBuild.skillSets.length})</span>
                      <p className="build-set-caveat">The active PoB setup is marked below. Inactive setups are retained as imported; their main skill is not guessed.</p>
                      <ul className="build-loadout-list">
                        {selectedBuild.skillSets.map((set) => (
                          <li key={`skill-set-${set.id}`}>
                            <div className="build-set-heading">
                              <strong>{set.name ?? `Skill set ${set.id}`}</strong>
                              <span className={set.isActive ? "build-set-state is-active" : "build-set-state"}>{set.isActive ? "ACTIVE" : "ALTERNATIVE"}</span>
                            </div>
                            {set.groups.length ? (
                              <ul className="build-group-list">
                                {set.groups.map((group) => (
                                  <li key={`${set.id}-${group.index}`}>
                                    <span>
                                      {group.label ?? group.mainSkillName ?? `Group ${group.index}`}
                                      {group.isMainSkillGroup && <small className="build-main-group-tag">Main group</small>}
                                    </span>
                                    <p>{group.gems.map((gem) => gem.name).filter(Boolean).join(" · ") || "Gem names not recorded"}</p>
                                  </li>
                                ))}
                              </ul>
                            ) : <p>No skill groups found.</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {selectedBuild.parseWarnings?.map((warning) => <p className="build-parse-warning" key={warning}>{warning}</p>)}
                </div>
              )}
            </section>
          )}

          {renderImportBar()}

          <AccountSyncStrip
            connected={false}
            onConnect={() => setDialog("connect")}
            onUnavailableAction={() => setDialog("connect")}
          />

          <section className="priority-section" aria-label="Loot priorities">
            <div className="priority-heading">
              <div>
                <h2>Loot priorities</h2>
                <span>{rows.length} suggestions · based on {buildsForScoring.length} build{buildsForScoring.length === 1 ? "" : "s"}</span>
              </div>
              <div className="stage-field">
                <label htmlFor="stage-select">Progression</label>
                <div className="stage-select-shell">
                  <select id="stage-select" value={currentStage} onChange={(event) => stageChanged(event.target.value as ProgressionStage)}>
                    {STAGE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                  </select>
                  <ChevronDown size={13} />
                </div>
              </div>
            </div>
            <PriorityTable
              rows={rows}
              selectedItemId={selectedRow?.relevance.itemId}
              onSelect={(row) => setSelectedItemId(row.relevance.itemId)}
              onPinGoal={pinAsGoal}
              pinnedIds={pinnedIds}
            />
          </section>
        </div>

        <ExplanationPanel relevance={selectedRow?.relevance} sampleMode={sampleMode} />

        <footer className="filter-handoff">
          <div className="handoff-copy">
            <h2>Bring priorities into FilterBlade</h2>
            <p>Review useful targets in FilterBlade, then export your filter with its existing style and strictness.</p>
          </div>
          <div className="handoff-actions">
            <button className="button button-outline filter-audit-trigger" type="button" onClick={() => void openFilterAudit()} disabled={filterAuditImporting}>
              <FolderOpen size={15} /> {filterAuditImporting ? "Opening filter…" : "Audit existing filter"}
            </button>
            <button className="text-link filterblade-link" type="button" onClick={() => void openTrustedLink("https://www.filterblade.xyz/?game=Poe1")}>
              Open FilterBlade <ExternalLink size={13} />
            </button>
            <input ref={filterFileInputRef} className="sr-only" type="file" accept=".filter,.txt,text/plain" onChange={(event) => void browserFilterFileChosen(event)} />
            <div className="export-group">
              <button className="button button-primary export-main" type="button" onClick={() => exportContent("markdown")}>
                <ArrowDownToLine size={16} /> Export FilterBlade guide
              </button>
              <button className="button button-primary export-menu-toggle" type="button" aria-label="Choose export format" aria-expanded={exportMenuOpen} onClick={() => setExportMenuOpen((open) => !open)}>
                <ChevronDown size={15} />
              </button>
              {exportMenuOpen && (
                <div className="export-menu" role="menu">
                  <button role="menuitem" type="button" onClick={() => exportContent("markdown")}>FilterBlade guide (Markdown)</button>
                  <button role="menuitem" type="button" onClick={() => exportContent("json")}>Priority data (JSON)</button>
                  <button role="menuitem" type="button" onClick={() => exportContent("csv")}>Priority table (CSV)</button>
                </div>
              )}
            </div>
          </div>
        </footer>
      </div>
    );
  }

  function renderProgressionRoutePage() {
    const route = progressionRoute;
    const confirmedCount = route?.steps.filter((step) => step.status === "complete" || step.status === "already_aligned").length ?? 0;
    const needsCuratedCount = route?.steps.filter((step) => step.requiredData.some((item) => item.category === "curated")).length ?? 0;
    const currentStageValue = routeStage ?? "";
    const snapshotNote = sampleMode
      ? "Example route. Import your own PoB build and set your current progression stage to start a personal plan."
      : selectedCharacter
        ? "Current stage comes from your local character profile. Gear, passive nodes, stash, and Atlas state have not been synced."
        : "Build target only. Your current character and league stash are not connected; choose a current stage to make the route more specific.";

    return (
      <div className="secondary-page route-page">
        <header className="page-intro">
          <div className="route-title-row">
            <div>
              <span className="section-kicker">PATH OF EXILE 1 · SSF ROADMAP</span>
              <h1>Progression route</h1>
              <p>One ordered plan for the build, with each step tied to your data or a versioned game rule.</p>
            </div>
            <span className="route-version-badge"><RouteIcon size={14} /> Local route rules · v1</span>
          </div>
        </header>

        {renderContextControls()}
        {renderBuildRoles()}

        {route ? (
          <>
            <section className="route-context-card" aria-label="Route planning context">
              <div className="route-context-build">
                <span className="section-kicker">TARGET BUILD</span>
                <strong>{route.build.name}</strong>
                <small>{route.build.role} · {selectedBuild?.ascendancy ?? selectedBuild?.className ?? "PoE 1 build"} · target stage {formatStage(route.targetStage)}</small>
              </div>
              <div className="route-context-stage">
                <label htmlFor="route-stage-select">Current stage</label>
                <div className="stage-select-shell">
                  <select id="route-stage-select" value={currentStageValue} onChange={(event) => {
                    if (event.target.value) stageChanged(event.target.value as ProgressionStage);
                  }}>
                    <option value="">Choose current stage</option>
                    {STAGE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                  </select>
                  <ChevronDown size={13} />
                </div>
              </div>
              <div className="route-context-stat">
                <span>STEPS</span><strong>{route.steps.length}</strong><small>{confirmedCount} confirmed by supplied data</small>
              </div>
              <div className="route-context-stat">
                <span>DATA GAPS</span><strong>{needsCuratedCount}</strong><small>steps need reviewed PoE 1 rules</small>
              </div>
              <p className="route-context-note">{snapshotNote}</p>
            </section>

            <section className="route-tree-data" aria-label="Local passive tree data">
              <div className="route-tree-data-copy">
                <span className="section-kicker">OPTIONAL LOCAL DATA</span>
                <strong>Resolve passive nodes and route order</strong>
                <p>Load a GGG passive-tree JSON export to label PoB node differences and suggest an allocation order from its graph links. Confirm the version shown in your PoB spec; this is not an optimized leveling guide.</p>
                <button className="text-link" type="button" onClick={() => void openTrustedLink("https://github.com/grindinggear/skilltree-export")}>Open GGG tree exports <ExternalLink size={13} /></button>
              </div>
              <div className="route-tree-data-controls">
                <label htmlFor="tree-data-version">PoB tree version</label>
                <select id="tree-data-version" value={passiveTreeImportVersion} onChange={(event) => setPassiveTreeVersionSelection(event.target.value)} disabled={!passiveTreeVersionOptions.length}>
                  {passiveTreeVersionOptions.length
                    ? passiveTreeVersionOptions.map((version) => <option value={version} key={version}>{version}</option>)
                    : <option value="">Import a PoB tree first</option>}
                </select>
                <button className="button button-outline" type="button" onClick={() => void openPassiveTreeDataFile()} disabled={!passiveTreeImportVersion}>Import tree JSON</button>
                {passiveTreeData && (
                  <div className="route-tree-data-status" role="status">
                    <span>{Object.keys(passiveTreeData.nodes).length} nodes indexed · {Object.values(passiveTreeData.nodes).filter((node) => node.neighbors?.length).length} with links · tree {passiveTreeData.treeVersion} · {passiveTreeData.sourceFile}</span>
                    <button className="text-link" type="button" onClick={() => setPassiveTreeData(null)}>Clear</button>
                  </div>
                )}
              </div>
              <input ref={passiveTreeFileInputRef} className="sr-only" type="file" accept=".json,application/json" onChange={(event) => void browserPassiveTreeFileChosen(event)} />
              <p className="route-tree-data-note">The app stores only relevant PoB node labels and links on this device. It does not include GGG tree data in the installer.</p>
            </section>

            <div className="route-layout">
              <section className="route-step-list" aria-label="Ordered progression steps">
                <div className="route-section-heading">
                  <div><h2>Route steps</h2><span>Sorted from gear checks to long-term build systems</span></div>
                  <button className="button button-outline route-export-button" type="button" onClick={exportProgressionRoute}><ArrowDownToLine size={14} /> Export route</button>
                </div>
                {route.steps.map((step) => (
                  <button
                    type="button"
                    key={step.id}
                    className={`route-step-card ${selectedRouteStep?.id === step.id ? "is-selected" : ""}`}
                    aria-pressed={selectedRouteStep?.id === step.id}
                    onClick={() => setSelectedRouteStepId(step.id)}
                  >
                    <span className="route-step-number">{String(step.order).padStart(2, "0")}</span>
                    <span className="route-step-copy">
                      <span className="route-step-meta">{ROUTE_STEP_LABELS[step.kind]} <i /> {step.confidence} confidence</span>
                      <strong>{step.title}</strong>
                      <span className="route-step-action">{step.action}</span>
                    </span>
                    <span className={`route-status route-status-${step.status}`}>{ROUTE_STATUS_LABELS[step.status]}</span>
                    <ChevronDown size={15} className="route-step-chevron" />
                  </button>
                ))}
              </section>

              <aside className="route-inspector" aria-label="Selected route step details">
                {selectedRouteStep ? (
                  <>
                    <span className="section-kicker">WHY THIS STEP?</span>
                    <h2>{selectedRouteStep.title}</h2>
                    <span className={`route-status route-status-${selectedRouteStep.status}`}>{ROUTE_STATUS_LABELS[selectedRouteStep.status]}</span>
                    <div className="route-inspector-action"><strong>Next action</strong><p>{selectedRouteStep.action}</p></div>
                    {selectedRouteStep.passiveTree && (
                      <div className="route-inspector-section passive-tree-detail">
                        <strong>Imported Path of Building tree</strong>
                        <div className="route-evidence">
                          <span>Spec {selectedRouteStep.passiveTree.specId} · {selectedRouteStep.passiveTree.specName} · tree {selectedRouteStep.passiveTree.treeVersion ?? "unknown"}</span>
                          <p>{selectedRouteStep.passiveTree.targetNodeCount} target node IDs · comparison: {selectedRouteStep.passiveTree.comparison.replaceAll("_", " ")}</p>
                          <div className={`passive-allocation-order passive-allocation-${selectedRouteStep.passiveTree.allocationOrderStatus}`}>
                            <div>
                              <strong>Suggested allocation order</strong>
                              <span>{selectedRouteStep.passiveTree.allocationOrderStatus}</span>
                            </div>
                            <p>{selectedRouteStep.passiveTree.allocationOrderNote}</p>
                            {selectedRouteStep.passiveTree.allocationOrder?.length ? (
                              <details>
                                <summary>View {selectedRouteStep.passiveTree.allocationOrder.length} ordered nodes</summary>
                                <ol>{selectedRouteStep.passiveTree.allocationOrder.map((node, index) => (
                                  <li key={`${node.id}-${index}`}>
                                    <span>{node.name ?? node.stats[0] ?? `Node ${node.id}`}</span><small>#{node.id}{node.kind ? ` · ${node.kind}` : ""}</small>
                                  </li>
                                ))}</ol>
                              </details>
                            ) : null}
                          </div>
                          {selectedRouteStep.passiveTree.comparison === "compared" && (
                            <details className="passive-node-id-list">
                              <summary>View exact allocation differences</summary>
                              <div className="passive-node-group">
                                <strong>Added in target</strong>
                                <p>{selectedRouteStep.passiveTree.addedNodeIds?.join(", ") || "None"}</p>
                                {selectedRouteStep.passiveTree.addedNodes?.length ? (
                                  <ul>{selectedRouteStep.passiveTree.addedNodes.map((node) => (
                                    <li key={node.id}>
                                      <span><b>{node.name ?? node.stats[0] ?? `Node ${node.id}`}</b><small>#{node.id}{node.kind ? ` · ${node.kind}` : ""}</small></span>
                                      {node.name && node.stats.length > 0 && <small>{node.stats.join(" · ")}</small>}
                                    </li>
                                  ))}</ul>
                                ) : null}
                              </div>
                              <div className="passive-node-group">
                                <strong>ACTIVE nodes absent from target</strong>
                                <p>{selectedRouteStep.passiveTree.removedNodeIds?.join(", ") || "None"}</p>
                                {selectedRouteStep.passiveTree.removedNodes?.length ? (
                                  <ul>{selectedRouteStep.passiveTree.removedNodes.map((node) => (
                                    <li key={node.id}>
                                      <span><b>{node.name ?? node.stats[0] ?? `Node ${node.id}`}</b><small>#{node.id}{node.kind ? ` · ${node.kind}` : ""}</small></span>
                                      {node.name && node.stats.length > 0 && <small>{node.stats.join(" · ")}</small>}
                                    </li>
                                  ))}</ul>
                                ) : null}
                              </div>
                              {selectedRouteStep.passiveTree.addedNodes?.length ? <p className="passive-node-caveat">Node names come from local tree {selectedRouteStep.passiveTree.treeVersion} data. This difference does not estimate refund cost.</p> : null}
                            </details>
                          )}
                        </div>
                      </div>
                    )}
                    {selectedRouteStep.equipmentComparison && (
                      <div className="route-inspector-section equipment-comparison-detail">
                        <strong>Saved PoB equipment records</strong>
                        <div className="equipment-comparison-grid">
                          <div>
                            <span>ACTIVE PoB</span>
                            <p>{selectedRouteStep.equipmentComparison.activeItem?.label ?? "No parsed item in this slot"}</p>
                          </div>
                          <div>
                            <span>Target PoB</span>
                            <p>{selectedRouteStep.equipmentComparison.targetItem?.label ?? "No parsed item in this slot"}</p>
                          </div>
                        </div>
                        <p className="equipment-comparison-note">This compares saved item labels and base types only. It does not read live character gear or compare item modifiers, so it cannot say whether one item is an upgrade.</p>
                      </div>
                    )}
                    {selectedRouteStep.skillTransition && (
                      <div className="route-inspector-section skill-transition-detail">
                        <strong>Saved PoB main skill groups</strong>
                        <div className="skill-transition-grid">
                          <div>
                            <span>ACTIVE PoB</span>
                            <p>{selectedRouteStep.skillTransition.activeMainSkill ?? "Main skill not parsed"}</p>
                            <b>Support gems</b>
                            {selectedRouteStep.skillTransition.activeSupportGems.length ? (
                              <ul>{selectedRouteStep.skillTransition.activeSupportGems.map((gem) => <li key={gem}>{gem}</li>)}</ul>
                            ) : <small>No support gems parsed</small>}
                          </div>
                          <div>
                            <span>Target PoB</span>
                            <p>{selectedRouteStep.skillTransition.targetMainSkill ?? "Main skill not parsed"}</p>
                            <b>Support gems</b>
                            {selectedRouteStep.skillTransition.targetSupportGems.length ? (
                              <ul>{selectedRouteStep.skillTransition.targetSupportGems.map((gem) => <li key={gem}>{gem}</li>)}</ul>
                            ) : <small>No support gems parsed</small>}
                          </div>
                        </div>
                        <div className="skill-transition-diff">
                          <div>
                            <b>Added in target</b>
                            <p>{selectedRouteStep.skillTransition.addedSupportGems.join(", ") || "None"}</p>
                          </div>
                          <div>
                            <b>Removed from ACTIVE</b>
                            <p>{selectedRouteStep.skillTransition.removedSupportGems.join(", ") || "None"}</p>
                          </div>
                        </div>
                        <p className="equipment-comparison-note">This compares gem names in saved PoB groups. It cannot confirm live socket links, colors, gem levels, or gem availability.</p>
                      </div>
                    )}
                    <div className="route-inspector-section">
                      <strong>Evidence</strong>
                      {selectedRouteStep.evidence.map((item, index) => (
                        <div className="route-evidence" key={`${item.source}-${item.reference ?? index}`}>
                          <span>{item.source.replaceAll("_", " ")} · {item.version}</span>
                          <p>{item.detail}</p>
                          {item.reference && <code>{item.reference}</code>}
                        </div>
                      ))}
                    </div>
                    {selectedRouteStep.requiredData.length > 0 && (
                      <div className="route-inspector-section">
                        <strong>Needed to make this actionable</strong>
                        {selectedRouteStep.requiredData.map((item) => (
                          <div className="route-data-gap" key={item.key}>
                            <span>{item.category === "personal" ? "YOUR DATA" : "CURATED POE DATA"}</span>
                            <p>{item.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="route-version-detail"><span>RULE VERSION</span><code>{selectedRouteStep.dataVersion.routeRules}</code><span>GAME DATA</span><code>{selectedRouteStep.dataVersion.curatedData}</code></div>
                  </>
                ) : null}
              </aside>
            </div>

            <section className="route-next-actions">
              <div><span className="section-kicker">CONTINUE PLANNING</span><strong>Review target item priorities</strong><small>Use the current build goals to tune what your filter highlights.</small></div>
              <button className="button button-primary" type="button" onClick={() => setPage("Loot filter")}>Open loot priorities <ArrowRight size={15} /></button>
            </section>
          </>
        ) : (
          <div className="route-empty-state">
            <RouteIcon size={24} />
            <h2>Import a target build to start a route</h2>
            <p>Paste a PoB code or optional build link. You can build the first plan without connecting an account.</p>
            <button className="button button-primary" type="button" onClick={() => setPage("Loot filter")}><Plus size={15} /> Import a build</button>
          </div>
        )}
      </div>
    );
  }

  function renderBuildsPage() {
    const allBuilds = [...savedBuilds.map((record) => record.manifest), ...sessionBuilds];
    return (
      <div className="secondary-page">
        <header className="page-intro">
          <h1>Builds</h1>
          <p>Keep current plans and future characters in the same local SSF profile.</p>
        </header>
        {renderContextControls()}
        <div className="builds-page-toolbar">
          <div>
            <strong>{allBuilds.length} local build{allBuilds.length === 1 ? "" : "s"}</strong>
            <span>Builds are saved under the selected character and league.</span>
          </div>
          <button className="button button-primary" type="button" onClick={() => setPage("Loot filter")}><Plus size={15} /> Import build</button>
        </div>
        {allBuilds.length ? (
          <div className="build-list">
            {allBuilds.map((build) => (
              <article className="build-list-row" key={`${build.id}-${build.role}`}>
                <div className="build-list-icon"><FileCode2 size={17} /></div>
                <div className="build-list-name"><strong>{build.name}</strong><span>{build.ascendancy ?? build.className ?? "PoE 1 build"} · {sourceLabel(build.source.kind)}</span></div>
                <span className={`role-badge role-${build.role.toLowerCase()}`}>{build.role}</span>
                <button className="text-link" type="button" onClick={() => { setRoleTab(build.role); setSelectedBuildId(build.id); setPage("Loot filter"); }}>Open build <ArrowRight size={13} /></button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-builds">
            <BookOpen size={22} />
            <h2>No saved builds for this character</h2>
            <p>Choose a league before a character. You can still import and analyze a build without connecting a PoE account.</p>
            <button className="button button-outline" type="button" onClick={() => setPage("Loot filter")}>Go to build import</button>
          </div>
        )}
      </div>
    );
  }

  function renderOverviewPage() {
    return (
      <div className="secondary-page overview-page">
        <header className="page-intro">
          <h1>Your SSF profile</h1>
          <p>A local view of builds, league context, and goals. Account sync is optional.</p>
        </header>
        {renderContextControls()}
        <section className="overview-summary">
          <div><span>GAME</span><strong>Path of Exile 1</strong><small>PoE 2 is planned for a future release.</small></div>
          <div><span>LEAGUE</span><strong>{selectedLeague?.name ?? "Not selected"}</strong><small>Shared stash context belongs to this league.</small></div>
          <div><span>CHARACTER</span><strong>{selectedCharacter?.name ?? "Not selected"}</strong><small>{selectedCharacter ? `${selectedCharacter.className ?? "PoE 1"} · ${formatStage(selectedCharacter.progressionStage)}` : "Select a league first, then create a local character."}</small></div>
        </section>
        <section className="overview-next-step">
          <div className="next-step-mark"><ListFilter size={20} /></div>
          <div><h2>Build-aware loot priorities</h2><p>Import a Path of Building code to see items, bases, and crafting targets ranked for your SSF plans.</p></div>
          <button className="button button-primary" type="button" onClick={() => setPage("Progression route")}>Open progression route <ArrowRight size={15} /></button>
        </section>
        <p className="notice-text">This product isn't affiliated with or endorsed by Grinding Gear Games in any way.</p>
      </div>
    );
  }

  function renderAccountPage() {
    return (
      <div className="secondary-page account-page">
        <header className="page-intro">
          <h1>Account & local data</h1>
          <p>Your profile stays on this device. Connect an account only when the official API is available.</p>
        </header>
        <section className="account-status-card">
          <div className="account-status-icon"><UserRound size={20} /></div>
          <div className="account-status-copy">
            <span className="section-kicker">OPTIONAL ACCOUNT CONNECTION</span>
            <h2>Path of Exile account</h2>
            <p>GGG's official character and PoE 1 stash APIs require approved OAuth access. New app registrations are currently paused, so account sync is not active in this build.</p>
          </div>
          <button className="button button-outline" type="button" onClick={() => setDialog("connect")}>Connection details</button>
        </section>
        <section className="settings-section">
          <div>
            <span className="section-kicker">BUILD SOURCE REQUESTS</span>
            <h2>Pobb.in contact</h2>
            <p>Pobb.in asks integrations to identify the app and include maintainer contact information. This is sent only with a build-link request.</p>
          </div>
          <label className="settings-input-label" htmlFor="pobb-contact">Public contact URL or email</label>
          <input
            id="pobb-contact"
            type="text"
            value={pobbContact}
            onChange={(event) => setPobbContact(event.target.value)}
            placeholder={GITHUB_ISSUES_URL}
            autoComplete="off"
          />
          <button className="text-link" type="button" onClick={() => void openTrustedLink(GITHUB_ISSUES_URL)}>
            Contact or report an issue on GitHub <ExternalLink size={13} />
          </button>
          <div className="settings-inline-note"><Check size={14} />{pobbContact.trim() ? "Contact saved on this device." : "Pobb.in URL imports will ask for this before sending a request."}</div>
        </section>
        <section className="local-data-section">
          <div><Settings2 size={18} /><strong>Local profile data</strong></div>
          <p>{leagues.length} league{leagues.length === 1 ? "" : "s"} · {characters.length} character{characters.length === 1 ? "" : "s"} · {savedBuilds.length} build{savedBuilds.length === 1 ? "" : "s"} · {savedAtlasTrees.length} Atlas tree{savedAtlasTrees.length === 1 ? "" : "s"}</p>
          <span>Stored in this app's local data folder. No sign-in is required to use build import or priority analysis.</span>
        </section>
        <p className="notice-text">This product isn't affiliated with or endorsed by Grinding Gear Games in any way.</p>
      </div>
    );
  }

  function renderAtlasTreesPage() {
    const leagueTrees = selectedLeagueId
      ? savedAtlasTrees.filter((tree) => tree.leagueId === selectedLeagueId)
      : [];
    return (
      <div className="secondary-page atlas-page">
        <header className="page-intro">
          <h1>Atlas trees</h1>
          <p>Keep target-farm Atlas setups with their league. Import public GGG share links now; official account snapshots can be connected when OAuth registration is available.</p>
        </header>
        {renderContextControls()}
        <AtlasTreesPage
          league={selectedLeague}
          trees={leagueTrees}
          dataset={atlasTreeDataset}
          onImport={saveAtlasTree}
          onLoadDataset={setAtlasTreeDataset}
          onRemove={removeAtlasTree}
          onOpenShare={(url) => void openTrustedLink(url)}
        />
      </div>
    );
  }

  function renderPage() {
    if (page === "Loot filter") return renderPriorityWorkspace();
    if (page === "Builds") return renderBuildsPage();
    if (page === "Progression route") return renderProgressionRoutePage();
    if (page === "Atlas trees") return renderAtlasTreesPage();
    if (page === "Account") return renderAccountPage();
    return renderOverviewPage();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-glyph" aria-hidden="true"><span /></span>
          <span>SSF Companion</span>
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {(["Overview", "Builds", "Progression route", "Atlas trees", "Loot filter", "Account"] as Page[]).map((item) => {
            const Icon = PAGE_ICONS[item];
            return (
              <button type="button" key={item} className={page === item ? "nav-item is-active" : "nav-item"} aria-current={page === item ? "page" : undefined} onClick={() => setPage(item)}>
                <Icon size={19} strokeWidth={1.8} />
                <span>{item}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="local-indicator"><span /> Local profile</div>
          <span>{appVersion === "Source preview" ? appVersion : `v${appVersion}`}</span>
        </div>
      </aside>

      <div className="app-content">
        {renderPage()}
      </div>

      {toast && <div className="toast-message" role="status"><Check size={15} />{toast}</div>}

      {dialog === "connect" && (
        <Modal title="PoE account sync" onClose={() => setDialog(null)}>
          <div className="modal-callout"><CircleHelp size={18} /><p>GGG's official developer docs currently say it is unable to process new OAuth application registrations. This project cannot activate account sync until GGG accepts and approves a public OAuth client.</p></div>
          <p>When access is available, this desktop app will request only the documented scopes needed for character, league, and PoE 1 stash data. You can import builds, create a local league and character, and use the priority engine without connecting an account.</p>
          <p className="modal-small-note">The app does not ask for your PoE password, session cookie, or game files.</p>
          <a className="text-link modal-external-link" href="https://www.pathofexile.com/developer/docs" onClick={(event) => { event.preventDefault(); void openTrustedLink("https://www.pathofexile.com/developer/docs"); }}>
            Read GGG developer docs <ExternalLink size={14} />
          </a>
        </Modal>
      )}

      {dialog === "league" && (
        <Modal
          title="Add a local league"
          onClose={() => setDialog(null)}
          footer={<><button className="button button-quiet" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" type="submit" form="league-form">Add league</button></>}
        >
          <form id="league-form" className="modal-form" onSubmit={createLeague}>
            <label htmlFor="league-name">League name</label>
            <input id="league-name" value={leagueNameInput} onChange={(event) => setLeagueNameInput(event.target.value)} placeholder="e.g., Solo Self-Found league" autoFocus maxLength={80} required />
            <p>League selection comes before character selection because shared stash data belongs to the league.</p>
          </form>
        </Modal>
      )}

      {dialog === "character" && (
        <Modal
          title="Add a local character"
          onClose={() => setDialog(null)}
          footer={<><button className="button button-quiet" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" type="submit" form="character-form">Add character</button></>}
        >
          <form id="character-form" className="modal-form" onSubmit={createCharacter}>
            <label htmlFor="character-name">Character name</label>
            <input id="character-name" value={characterNameInput} onChange={(event) => setCharacterNameInput(event.target.value)} placeholder="e.g., WinterOrbDyl" autoFocus maxLength={48} required />
            <div className="form-two-columns">
              <div><label htmlFor="character-class">Class</label><select id="character-class" value={characterClassInput} onChange={(event) => setCharacterClassInput(event.target.value)}>{["Ranger", "Marauder", "Witch", "Duelist", "Templar", "Shadow", "Scion"].map((className) => <option key={className}>{className}</option>)}</select></div>
              <div><label htmlFor="character-level">Level</label><input id="character-level" type="number" min="1" max="100" value={characterLevelInput} onChange={(event) => setCharacterLevelInput(event.target.value)} /></div>
            </div>
            <p>Local character data is saved under <strong>{selectedLeague?.name ?? "the selected league"}</strong>. You can sync official character data later if GGG OAuth access becomes available.</p>
          </form>
        </Modal>
      )}

      {filterAuditModalOpen && filterAuditWithCustomizer && (
        <Modal title="FilterBlade rule audit" width="wide" onClose={() => setFilterAuditModalOpen(false)} footer={
          <>
            <button className="button button-outline" type="button" onClick={() => void openFilterBladeOptions()} disabled={filterBladeOptionsImporting}>
              <FolderOpen size={14} /> {filterBladeOptionsImporting ? "Reading options…" : filterBladeOptions ? "Reload Customizer labels" : "Load Customizer labels"}
            </button>
            <button className="button button-quiet" type="button" onClick={() => setFilterAuditModalOpen(false)}>Done</button>
            <button className="button button-primary" type="button" onClick={() => { setFilterAuditModalOpen(false); exportContent("markdown"); }}>Export handoff with audit</button>
          </>
        }>
          <input ref={filterBladeOptionsInputRef} className="sr-only" type="file" accept=".options,.txt,text/plain" onChange={(event) => void browserFilterBladeOptionsFileChosen(event)} />
          <div className="modal-callout filter-audit-callout"><CircleHelp size={18} /><p>This is a read-only local audit. It does not modify or upload your filter. Matches are candidate BaseType mentions: the audit lists other rule lines but does not evaluate them, and it does not open files named by Import rules. Optionally load FilterBlade&rsquo;s local <code>CustomizerDefault.options</code> file to add labels for exact rule IDs found in this filter.</p></div>
          <div className="filter-audit-summary">
            <div><span>FILE</span><strong>{filterAuditWithCustomizer.sourceFile}</strong></div>
            <div><span>ACTIVE RULES</span><strong>{filterAuditWithCustomizer.activeRuleCount.toLocaleString()}</strong></div>
            <div><span>IMPORTS NOT FOLLOWED</span><strong>{filterAuditWithCustomizer.importCount.toLocaleString()}</strong></div>
          </div>
          {filterAuditWithCustomizer.customizerOptions && <div className="filterblade-options-status" role="status">
            <div><strong>Customizer labels loaded from {filterAuditWithCustomizer.customizerOptions.sourceFile}</strong><span>{filterAuditWithCustomizer.customizerOptions.indexedRuleCount.toLocaleString()} exact rule IDs indexed · {filterAuditWithCustomizer.targets.flatMap((target) => target.rules).filter((rule) => rule.customizerRule).length.toLocaleString()} candidate rule references labeled</span></div>
            <p>Only literal QuickUI entries were read. {filterAuditWithCustomizer.customizerOptions.unmappedQuickUiCalls.toLocaleString()} generated or unsupported entries were not named; {filterAuditWithCustomizer.customizerOptions.duplicateRuleIds.length.toLocaleString()} duplicate IDs were withheld. The file does not identify the live FilterBlade version or your saved settings.</p>
            <button className="text-link" type="button" onClick={() => void openTrustedLink("https://github.com/NeverSinkDev/FilterBlade-Public-Assets/blob/main/FbPoe1Configs/CustomizerDefault.options")}>Open the FilterBlade public options file <ExternalLink size={12} /></button>
          </div>}
          <div className="filter-audit-targets">
            {filterAuditWithCustomizer.targets.map((target, targetIndex) => (
              <section className="filter-audit-target" key={`${target.item}-${target.baseType ?? "unknown"}-${targetIndex}`}>
                <header>
                  <div><strong>{target.item}</strong><span>{target.baseType ?? "Base type not available in this build goal"}</span></div>
                  <span className={`filter-audit-status audit-${target.status}`}>
                    {target.status === "base_unknown" ? "NEEDS BASE TYPE" : target.status === "no_reference" ? "NO BASETYPE MENTION" : `${target.rules.length} CANDIDATE ${target.rules.length === 1 ? "RULE" : "RULES"}`}
                  </span>
                </header>
                {target.status === "no_reference" && <p className="filter-audit-empty">No literal BaseType mention was found in active rules in this file. Broader item-class rules and imported filters are outside this audit.</p>}
                {target.status === "base_unknown" && <p className="filter-audit-empty">This plan target has no known base type to compare. Review it by item name in your existing FilterBlade setup.</p>}
                {target.rules.map((rule) => (
                  <article className="filter-audit-rule" key={`${rule.order}-${rule.line}`}>
                    <div className="filter-audit-rule-head">
                      <div><strong>{rule.effect}</strong><span>Rule {rule.order} · line {rule.line}</span></div>
                      {rule.filterBladeRuleId && <code>{rule.filterBladeRuleId}</code>}
                    </div>
                    {rule.customizerRule && <div className="filter-audit-detail filterblade-customizer-name"><span>FilterBlade Customizer control</span><strong>{rule.customizerRule.name}{rule.customizerRule.title && rule.customizerRule.title !== rule.customizerRule.name ? ` · ${rule.customizerRule.title}` : ""}</strong></div>}
                    <div className="filter-audit-detail">
                      <span>BaseType clauses</span>
                      <div className="filter-audit-code-list">
                        {rule.baseTypeClauses.map((clause, clauseIndex) => (
                          <div className="filter-audit-code-row" key={`${clause.text}-${clauseIndex}`}>
                            <b className={clause.relation === "exclude" ? "audit-exclude" : clause.mentionsTarget ? "audit-match" : "audit-context"}>
                              {clause.relation === "exclude" ? "EXCLUDE" : clause.mentionsTarget ? "MENTION" : "OTHER"}
                              {clause.exact ? " · EXACT" : ""}
                            </b>
                            <code>{clause.text}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                    {rule.otherRuleLines.length > 0 && <div className="filter-audit-detail"><span>Other conditions / rule lines</span><div className="filter-audit-code-list">{rule.otherRuleLines.map((line, lineIndex) => <code key={`${line}-${lineIndex}`}>{line}</code>)}</div></div>}
                    {rule.presentation.length > 0 && <div className="filter-audit-detail"><span>Existing presentation</span><div className="filter-audit-code-list">{rule.presentation.map((line, lineIndex) => <code key={`${line}-${lineIndex}`}>{line}</code>)}</div></div>}
                    {rule.continues && <span className="filter-audit-continue">CONTINUE · later rules can also apply</span>}
                  </article>
                ))}
              </section>
            ))}
          </div>
          <ul className="filter-audit-limitations">{filterAuditWithCustomizer.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
        </Modal>
      )}
    </div>
  );
}
