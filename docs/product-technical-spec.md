# SSF Companion — Product and Technical Specification

**Status:** V1 implementation baseline plus progression-route target
**Last checked:** 2026-10-05
**Initial target:** downloadable Windows desktop application; local-first, with cross-platform packaging as a later release task
**Game scope:** Path of Exile 1 only. PoE 2 is a future provider, not a V1 UI mode.

## 1. Product direction

SSF Companion helps a Solo Self-Found player answer: **“What should I do next to progress this build?”** The destination is a deterministic, inspectable route from a current character/build and league stash to the next gear, crafting, farming, passive-tree, Atlas-tree, and loot-filter actions. Loot priorities are one part of that route. FilterBlade/NeverSink remains the presentation layer; SSF Companion should preserve the player's chosen colors, sounds, styles, and strictness.

### Product principles

- No account wall for importing a build, inspecting its manifest, or exporting a priority plan.
- League context comes before character context because league stash data is shared while equipment and passive data are character-specific.
- Keep every important hierarchy explicit: **Account → Game → League → Character → Build → Goals**.
- V1 is PoE 1 only. No PoE 2 controls or PoE 2 data appear in the shipped UI.
- Recommendations are deterministic and include their inputs, factors, confidence, and plain-language reasons.
- A recommendation must carry the game-data version and the evidence/rule that produced it. Unknown or stale data is shown as a gap; the engine must not invent a drop source, recipe, passive path, or Atlas strategy.
- Farming plans must match the target item to an acquisition route and a versioned Atlas passive profile; crafting plans must show inputs, ordered operations, unlocks, and risk.
- Current-character data and planned-build data are separate snapshots. League stash and Atlas-tree state are league-scoped; equipment, inventory, and character passives are character-scoped.
- FilterBlade/NeverSink continues to own presentation: colors, sounds, styles, strictness, and the final filter file.
- No game-process, log-file, or installation-folder access. Imports/exports happen through an explicit picker or a supported public build URL.
- AI is not in the relevance-scoring path. It may later help extract messy guide text or summarize deterministic explanations, with the source and rule result still inspectable.

## 2. V1 user journeys

### A. Import and inspect a build without connecting an account

1. Open the Windows desktop app; no sign-in is requested.
2. Set a local league, then select or create a local character.
3. Import a Path of Building code, `.pob`/XML export, a supported `pobb.in` URL, or a Maxroll Path of Building share URL.
4. Review the normalized Build Manifest and any fields the parser could not confidently infer.
5. Assign the build `ACTIVE`, `NEXT`, or `INTERESTED` for that character.
6. Select a progression stage and inspect the generated priority list.
7. Open “Why am I seeing this?” for each recommendation and export JSON/CSV priority data or a Markdown FilterBlade review guide.

### B. Prepare optional PoE account sync

The shared profile controls present **Game → League → Character** in that order, with PoE 1 fixed for V1. The Account page presents **Connect PoE Account** and the configurable Pobb.in request contact. The shipped V1 explains that GGG's current registration page says it cannot process new OAuth applications, so Sync Character / Sync Stash / Sync All remain unavailable. The screen must not simulate a successful connection or accept a session cookie. Basic build import stays usable.

After GGG registration is available, account sync uses only documented OAuth resources and only the scopes necessary for each button. Character equipment/passives map to Character; stash tabs are stored beneath the selected League. Sync All is a visible convenience action that invokes the same separately auditable operations.

## 3. Scope boundaries

### Current downloadable slice

- PoE 1 local data model and desktop UI.
- Import raw Path of Building share code and `.pob`/XML/text file.
- Fetch `pobb.in` raw builds and Maxroll saved PoB build links through strict host/path allowlists. Generic Maxroll guide pages are not assumed to expose a stable build payload; explain how to copy a PoB code instead.
- Parse a useful Build Manifest: build name, class/ascendancy where present, main skills/supports, gear/base/unique requirements, item and crafting references, passive allocation metadata where available, source, parse warnings, and confidence.
- Store local accounts, PoE 1 leagues, characters, builds, and goals with stable IDs. Keep role and league boundaries explicit.
- Deterministic relevance breakdown for current build, immediate upgrade opportunity, crafting use, scarcity, future build demand, progression stage, and clutter cost.
- Manual progression stage and manual league/character contexts where OAuth is unavailable.
- Explainability panel and exportable JSON/CSV priority plan.
- Windows portable `.exe` packaging.

This slice is a foundation for the full route planner, not yet a complete end-to-end progression guide. It can import a PoB build, preserve its saved passive specs, rank known item goals, and explain why. It does not yet have a patch-versioned PoE crafting/drop/Atlas knowledge pack, so it cannot responsibly claim complete farm routes, recipes, or new skill-tree paths.

### V1 completion target: build-aware SSF route

- Import a current character snapshot and/or one or more target PoB builds. Account data uses GGG's official OAuth API only after application registration is available; until then, PoB import and explicit local character state remain usable.
- Build a staged plan from current state to target: campaign checkpoints, mapping readiness, target gear, crafting steps, Atlas specialization, and endgame readiness.
- For every requested item, show known SSF sources, the mechanic/maps to target, required Atlas passives, expected prerequisites, and confidence. When the versioned data pack has no validated route, say so.
- Convert a target PoB tree into named, ordered passive milestones when the export provides those specs and versions; allow curated milestone plans when source data supports them. Compare imported character passives to a target tree only when the tree versions match.
- Generate a semantic loot-filter plan from route priorities. Add FilterBlade/NeverSink styling and filters only through a validated adapter that preserves custom presentation and previews all changes.
- Keep the route inspectable: “Why am I seeing this?” must show the build goal, current gap, acquisition/crafting rule, source/data version, and any missing inputs.

### Deferred until corresponding integration/data gates pass

- Real GGG OAuth connection and account data sync, until a client registration can be obtained.
- Direct write-back to FilterBlade or automatic modification of a filter file.
- Complete patch-versioned acquisition/crafting database, Atlas-tree recommendations, skill-tree milestone authoring, and loot-filter simulator.
- Arbitrary guide-site scraping, build-site account sync, AI extraction, community voting/reporting, and public hosted services.
- PoE 2 provider and UI.
- macOS/Linux installers, auto-updater, code signing, and public release publishing.

## 4. Domain model

```text
LocalAccount
└── GameContext: Path of Exile 1
    └── LeagueProfile
        ├── SharedStashSnapshot (future OAuth scope: account:stashes)
        ├── SavedAtlasTrees (future OAuth scope: account:league_accounts)
        ├── LeagueGoals
        └── CharacterProfile[]
            ├── CharacterSnapshot (equipment, inventory, passive tree)
            ├── Build[]
            │   ├── BuildManifest
            │   ├── Role: ACTIVE | NEXT | INTERESTED
            │   └── Goal[]
            └── ProgressionSnapshot
```

`BuildManifest` is the adapter boundary between sources and features. It contains normalized identity, version/game, skills, item slots/bases, required/chase uniques, craft targets/materials, named passive specs with tree versions and allocated node IDs when present, progression needs, source provenance, missing fields, and confidence. An importer must never silently convert an unknown field into a definitive requirement.

V1 stores versioned records in Electron's local renderer storage under the user's local app profile. The current slice names each league, character, build, goal, and selected-context key with a `v1` schema marker; schema migration and backup/restore are a Phase 2 hardening task. The profile root is the local account context, so no separate account record or sign-in is needed. A later migration can move to a main-process JSON store or SQLite without changing the core manifest. OAuth tokens, if ever added, belong in OS-protected storage and never in renderer localStorage or exported manifests.

## 5. Build source handling

| Input | V1 behavior | Evidence and limits |
|---|---|---|
| Path of Building code | Decode URL-safe Base64 + zlib payload, parse XML, normalize to the manifest, and surface parser warnings. | Path of Building's own build import tooling describes its provider URL mappings and raw endpoints. |
| `.pob`, XML, or text file | User selects a local file; content is size-limited and parsed locally. | No game directory is read. |
| `pobb.in` link | Normalize only supported public-link shapes and fetch the documented raw endpoint. Attach a configurable maintainer contact to the User-Agent. | Pobb.in documents `/<id>/raw` and `/u/<username>/<id>/raw`, and asks integrations to identify the app and provide contact information. |
| Maxroll PoB share URL | Support `/poe/pob/<id>` by requesting Maxroll's current raw build endpoint used by Path of Building. | A generic guide URL is not treated as equivalent to a saved PoB link; fallback is paste/import the code. |

Remote URL handling is in Electron's main process. The renderer cannot supply an arbitrary fetch URL: the main process validates HTTPS, host, route, ID, redirects, timeout, and maximum response size. Only Pobb.in and Maxroll are allowlisted for import.

## 6. Explainable relevance engine

For each rule/item target, return a stable record with a priority tier, numeric score (for sorting only), confidence, applied factors, source references, and a short explanation. Keep scoring deterministic and versioned.

Conceptual score:

```text
current build match
+ immediate upgrade value
+ crafting value
+ scarcity / acquisition friction
+ future-build value (weighted by role)
+ progression-stage value
− clutter and pickup cost
```

V1 starts with a small documented rule set and category/base/skill signals from the manifest. It must not claim to calculate true item DPS or compare every generated rare from incomplete data. Unknown data lowers confidence and creates a review prompt rather than hidden certainty. Thresholds and rule data live separately from UI strings so community balance review can happen later.

“Why am I seeing this?” lists the positive and negative factors, the matched build/goals, any manual progression choice, and missing data. `NEXT` receives meaningful but lower weight than `ACTIVE`; `INTERESTED` is opt-in/low weight and never outranks a direct ACTIVE upgrade without an explicit reason.

## 7. Progression route engine

The route planner is a deterministic core package between imported snapshots, versioned game data, and the UI. It must not call an LLM to choose recipes, drop sources, passive nodes, or Atlas nodes.

### Inputs

- `CharacterSnapshot`: current level/stage, equipped items, current passives, and progression flags; source and timestamp are retained.
- `BuildManifest[]`: ACTIVE target plus optional NEXT and INTERESTED builds. Preserve imported PoB specs as facts, including each spec's name, tree version, and allocated node IDs.
- `LeagueSnapshot`: stash inventory, saved Atlas passive trees, and explicitly selected farming goals when available.
- `RouteContext`: game version, league/content version, current progression stage, and player constraints (for example, SSF league type).

Each snapshot can be absent. The planner must still work from a PoB alone, but must label its result “build target only” and must not claim to know the player's missing gear, stash, current passive allocations, or Atlas allocations.

### Route step contract

Every step has a stable id, stage, type (`checkpoint`, `gear`, `craft`, `farm`, `character_tree`, `atlas_tree`, or `filter`), target, ordered actions/prerequisites, completion evidence, and references to the exact build goals and data records used. It carries a rule/data-pack version and confidence (`verified`, `partial`, `unknown`). Use dependency links to produce a sensible order; sort ties deterministically. User completion and “not relevant” feedback are local profile data and never rewrite the game-data rules.

Acquisition data separates *where an item comes from* from *what to allocate on the Atlas tree*. Crafting data is an explicit recipe graph with inputs, unlocks, operations, expected risks, and outcomes. Tree data is versioned by PoE patch and stored as source node IDs/hashes plus human-readable names. If the current game version does not match a route/tree record, mark it stale and suppress prescriptive output until reviewed.

### Release gates

1. Route foundation: typed plan, deterministic ordering, evidence display, and honest unknown-data states.
2. Character/build comparison: import the target's named PoB specs and compare with current official character passives only when versions line up.
3. Curated PoE 1 data packs: patch-pinned item acquisition, recipes, quest/vendor progression, skill-tree milestones, and Atlas strategies, each reviewed and tested by data release.
4. Filter handoff: map route priorities into an inspectable FilterBlade-compatible workflow or game-ready copy, preserve existing presentation, and preview changes.

## 8. FilterBlade / NeverSink integration

### Current contract

SSF Companion exports semantic priorities and keeps the user's selected FilterBlade/NeverSink filter untouched. It does not inject colors, sounds, styles, strictness, or raw `.filter` text. The export is a reviewable sidecar plan, not a game-ready loot filter. The UI links to FilterBlade for the user's normal styling workflow.

### Verified integration surface

FilterBlade's public documentation describes `.options` files as a domain language for defining its overview/customizer interface. That is a maintainer-oriented format, not a documented public runtime API for editing an individual player's saved customizer state. GGG separately documents account item-filter endpoints under `account:item_filter`, including create/update and validation against the current game version. These can publish a game filter after OAuth approval but are not a FilterBlade save-state API.

### Future integration gate

V1 exports a Markdown review guide and JSON/CSV semantic priorities. The guide names target items/bases, scores, matched builds, and reasons; it is not an importable module or a generated `.filter` file. Players apply chosen changes manually inside their existing FilterBlade setup. “Lower priority” never means hide or disable. FilterBlade's “My Modules” workflow is managed inside FilterBlade; its public `.options` DSL defines the customizer UI, and no public per-player priority-import API has been verified.

Before producing an importable FilterBlade module or a transformed `.filter` file, validate a stable rule/tag mapping, test the exact module with NeverSink/FilterBlade maintainers, preserve save-state IDs, confirm custom style/audio round-trips, and run game-version validation. Any future writer must parse, show a diff, preserve unrelated directives and comments, write a new file, and require a user-selected export path. Never overwrite the source filter. Online filter upload/update is a separate opt-in action with an explicit preview; it must not be represented as a FilterBlade integration.

## 9. Account/API constraints

GGG's official API documents OAuth-protected account profile, account leagues, character listing/details, PoE 1 stash listing/content, and account item-filter read/create/update routes. Character details include equipment, inventory, and passive information. Stash endpoints are league-scoped. These resources map directly to the product hierarchy.

As checked 2026-10-05, GGG's current developer docs say it is unable to process new OAuth application registrations. A downloadable app that calls GGG APIs must use a registered public OAuth client. Until one exists, V1 displays honest setup status and uses local/imported contexts. Do not scrape private pages, request POESESSID cookies, reverse-engineer unsupported endpoints, or claim that OAuth is active.

When registration is available, request only the scopes needed for selected actions: `account:leagues` + `account:characters` for character selection; `account:stashes` for league stash snapshots; `account:league_accounts` for league Atlas-tree snapshots; and `account:item_filter` only if the player chooses official filter upload/update. The documented character response includes equipment, inventory, and passives; PoE 1 stash endpoints are league-scoped; the league-account response includes saved Atlas passive trees; the account item-filter API can create and update online filters. The item-filter API is not a FilterBlade save/customizer API. Keep uploaded filters private by default; GGG says a public filter cannot be made private again. Honor API rate-limit headers, User-Agent format, third-party notice, and token revocation. Verify scopes again at implementation time.

GGG permits independently running executable apps when they use a public OAuth client, but forbids executables that interact with the game or game files. The desktop app therefore uses explicit imports and official API calls only; it does not read game files or automate the game.

## 10. Desktop and security architecture

- Electron main process: window lifecycle, strict source allowlist fetch, file dialogs, export writes, and future OAuth callback/token boundary.
- Preload bridge: a short, typed API with explicit methods; no raw filesystem, shell, or generic IPC exposed to the renderer.
- Renderer: React/Vite, local UI state, manifest display, and deterministic rules.
- Security settings: local packaged UI only; `contextIsolation: true`, `nodeIntegration: false`, sandbox on, restrictive Content Security Policy, sender validation for IPC, no arbitrary navigation or embedded remote pages.
- Data handling: local only unless the user explicitly submits a supported public build URL or authorizes a future official account connection. Imports are bounded; exports require an explicit save location.
- No updater or background collection in V1.

## 11. Quality gates

- Automated tests currently cover PoB envelope decode/invalid inputs, supported-link recognition, XML normalization/warnings, role weighting, deterministic score/reason generation, stash/clutter signals, and JSON/CSV export shape including spreadsheet-formula guards. Electron IPC/fetch-route security still needs focused adapter tests.
- Manual desktop QA covers launch, resizing, league-before-character behavior, build import errors/success, role changes, explanation updates, export, and offline startup.
- UI QA covers the full desktop workspace at 1440×1000 and one narrow window, keyboard labels/focus, and Electron console errors.
- Packaging QA launches the generated portable Windows executable and verifies its source build metadata.
- Public-release gates include OAuth client approval, privacy notice, support contact, signed installer decision, current game data review, FilterBlade permission/mapping review, and choosing a repository remote.

### V1 verification record (2026-09-29)

- Passed: 17 unit tests, TypeScript check, Vite production build, in-app UI preview, local PoB XML import, manifest field review, priority/reason rendering, and Windows portable executable launch (window title `SSF Companion`).
- Still manual: Pobb.in/Maxroll requests, local file picker, native save dialogs, window resizing at full desktop resolution, and signed/public distribution. OAuth sync remains unavailable pending GGG registration.

## 12. External references

- [GGG developer API and OAuth docs](https://www.pathofexile.com/developer/docs)
- [GGG API reference: account characters, league-scoped stash, and item filters](https://www.pathofexile.com/developer/docs/reference)
- [Path of Building's current build-site endpoints](https://github.com/PathOfBuildingCommunity/PathOfBuilding/blob/dev/src/Modules/BuildSiteTools.lua)
- [Path of Building's passive-tree version and allocation handling](https://github.com/PathOfBuildingCommunity/PathOfBuilding/blob/dev/src/Classes/TreeTab.lua)
- [Pobb.in public integration guidance](https://github.com/Dav1dde/pasteofexile/blob/master/README.md)
- [FilterBlade customizer option-file reference](https://github.com/NeverSinkDev/FilterBlade-Public-Assets/blob/main/README_OptionFile.md)
- [FilterBlade upload, modules, style, and export guidance](https://www.filterblade.xyz/)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder Windows targets](https://www.electron.build/docs/win/)
