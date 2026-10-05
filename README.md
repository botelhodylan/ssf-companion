# SSF Companion

SSF Companion is a downloadable, local-first desktop companion for Path of Exile 1 Solo Self-Found players. Its goal is to turn the current character, league stash, and one or more target builds into a versioned progression route covering gear, crafting, farming, passive trees, Atlas trees, and loot-filter priorities. The current release is the build-import and loot-priority foundation for that route.

This is an early, source-available build. The initial distribution target is a portable Windows `.exe`; the source uses Electron, React, and Vite so macOS/Linux packaging can be added later.

## Current slice

- Import a Path of Building code or supported `pobb.in` / Maxroll PoB share link.
- Keep builds under a local league and character, with `ACTIVE`, `NEXT`, and `INTERESTED` roles.
- Turn an explicitly `ACTIVE` PoB import into a reviewed local character snapshot under the selected league, keeping its gear sets, skill sets, and passive specs linked to the character.
- Import standard or Ruthless Atlas Skill Tree share URLs from GGG, save/re-import local JSON snapshots under the selected league, and optionally load GGG's local Atlas export to display matching node names/stats. The export has no patch label, so the app does not claim those facts are current or recommend farm trees yet.
- Produce deterministic item-priority recommendations with a “Why am I seeing this?” explanation.
- Preserve all named passive-tree specs, node IDs, and tree versions from imported PoB builds. Optionally load a local GGG tree JSON export to label nodes and create a deterministic graph traversal from the class start or same-version retained allocations; no GGG tree data is bundled. This order is not a PoB-authored or optimized leveling guide.
- Show a deterministic progression-route foundation for gear, crafting, farming/Atlas, passive trees, and loot priorities. Each step includes evidence, rule version, confidence, and explicit player/game-data gaps.
- Export a FilterBlade handoff guide (Markdown), plus JSON/CSV priority data with reasons and matched builds. After a local audit, the guide can include candidate rule IDs, conditions, and existing presentation directives so you can review the exact rule in FilterBlade; it does not rewrite an existing filter or game files.
- Optionally audit a player-selected `.filter` export locally to find candidate `BaseType` mentions for current priorities, with rule order, FilterBlade IDs, other rule lines, existing style/sound directives, and `Continue` markers. Load current PoE 1 Customizer labels from NeverSink's public assets on request, or select a local `.options` file. The audit is read-only and does not follow `Import` files.
- Preview and save a new, style-matched `.filter` copy by promoting only Keep/Consider targets with complete exact-base `Show` rules. The adapter copies that rule's conditions and presentation, prepends it, and keeps the selected source text unchanged below it. Ambiguous, broad, incomplete, and `Continue` rules are skipped; the result still needs FilterBlade simulator and in-game review.
- Run without an account connection. GGG OAuth account sync is shown as unavailable until GGG accepts new OAuth application registrations.

## Run from source

Requires Node.js 20.19+ (Node 24 is recommended) and pnpm.

```powershell
pnpm install
pnpm dev
```

Useful commands:

```powershell
pnpm test
pnpm build
pnpm package:win
```

`pnpm package:win` creates a portable Windows executable in `release/`.
Early-access Windows previews are published as unsigned GitHub prereleases with a SHA-256 checksum, so Windows may show an unknown-publisher warning. Stable `v*` releases remain gated on verified signing.

## Code signing policy

No trusted signing service is configured yet. Stable `v*` releases remain signed-only; explicitly tagged `preview-v*` builds publish as unsigned prereleases with a SHA-256 checksum. See the [code signing policy](docs/code-signing-policy.md). Do not treat any executable as signed unless its release asset passes Authenticode verification.

## Data and privacy

Build parsing and prioritization run locally. Supported build-link imports send a request only to the matching build host after the user submits a link. Pobb.in requests include the public GitHub Issues contact URL by default (editable in Settings) in the User-Agent. Selected filter text is held only in memory while its audit/copy preview is open; it is never persisted or uploaded. A saved prioritized copy goes only to a user-selected path. Fetching FilterBlade labels requests only the public `CustomizerDefault.options` file and sends no build or account data. Imported build data and local profile data stay on this machine unless the user explicitly exports them.

The app does not inspect the game process, read game logs, or access or modify the Path of Exile installation or its files. Exported files go only to a location selected by the user.

## Current integration limits

GGG's official API describes OAuth-backed PoE 1 character, league, and stash access. As checked on 2026-10-05, GGG says it is unable to process new OAuth application registrations, so account sync cannot be activated for this new project yet. The UI explains this without blocking build import or analysis.

FilterBlade's [public `.options` documentation](https://github.com/NeverSinkDev/FilterBlade-Public-Assets/blob/main/README_OptionFile.md) defines its customizer UI and warns that rule IDs must stay stable for saved customizations. Its [PoE 1 customizer](https://www.filterblade.xyz/?game=Poe1) manages “My Modules” inside FilterBlade; no external per-player priority-import API has been verified. SSF Companion can audit a user-selected export and, for a narrow safe subset, create a separate `.filter` copy with matching existing `Show` rule bodies moved to the top. The audit can fetch current public PoE 1 Customizer labels from [NeverSink's public assets](https://github.com/NeverSinkDev/FilterBlade-Public-Assets/tree/main/FbPoe1Configs) only when requested; a local `.options` file remains available for offline or version-specific use. Generated copies are not validated by GGG and still need simulator/in-game review; they are not importable FilterBlade modules.

## Project status

See [the product and technical specification](docs/product-technical-spec.md) and [the phased plan](docs/implementation-plan.md) for the full route target and its integration/data gates.

See [Contributing](CONTRIBUTING.md) for development and data-handling rules, and [Security](SECURITY.md) for private vulnerability reporting.

## Contact and support

Use [GitHub Issues](https://github.com/botelhodylan/ssf-companion/issues) for bug reports, feature requests, and general project contact. Use GitHub's private vulnerability reporting for security issues; do not post PoB codes or private account/stash data in an issue.

The current route is a planning scaffold: it organizes imported goals and shows what additional character/stash data and reviewed PoE data are required. Matching local tree data can name passive allocation differences and suggest an explicit graph traversal, but it does not optimize allocations or provide a PoB-authored leveling guide. Local Atlas data can label hashes in a saved share setup, but the export has no patch version and the app does not yet provide Atlas-tree plans, a patch-current craft recipe database, named drop routes, or a generated game-ready loot filter.

## Notice

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.
