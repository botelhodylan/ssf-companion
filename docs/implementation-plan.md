# SSF Companion — Phased Implementation Plan

**Product:** downloadable, local-first PoE 1 desktop app. PoE 2 is planned as a separate future game provider.

## Phase 0 — Product and integration contracts

**Status: complete.** Verified current GGG OAuth/API, Path of Building import/data, and FilterBlade public customizer integration surfaces. Locked the league-before-character hierarchy, no game-file access, deterministic recommendations, and explicit evidence/data versions.

## Phase 1 — Build import and explainable loot priorities

**Status: complete for the first local-first slice.** The Windows desktop app imports PoB code/XML/files and supported pobb.in/Maxroll share links, normalizes skills/equipment/goals, supports ACTIVE/NEXT/INTERESTED builds, ranks known goals, explains recommendations, and exports JSON/CSV plus a manual FilterBlade review guide. It preserves and displays every named PoB skill and equipment set with the active selection marked; alternate sets are not assigned a guessed transition order. An explicitly ACTIVE PoB can seed a reviewed local character snapshot beneath the selected league, with a linked copy of its imported build facts. It packages as an unsigned portable Windows executable. It does not require an account.

## Phase 2 — Progression route foundation

**Status: in progress.** Turn the goal into a single route workspace rather than a collection of disconnected tools.

- Preserve every named PoB passive spec, its tree version, and numeric node IDs.
- Compare imported target specs against the ACTIVE PoB tree only when both tree versions match; show added/removed node IDs and withhold differences across missing or mismatched versions.
- Optionally load a player-selected local GGG passive-tree JSON export to label same-version differences and retain relevant graph links/class starts. Use a deterministic breadth-first traversal from retained nodes or class start when topology is complete; do not bundle the export.
- **Partially delivered:** Group that traversal into ten-node review checkpoints for large trees. These are display groups only; they do not claim character levels, quest-point timing, respec timing, or an optimized leveling order.
- **Partially delivered:** Import source-backed, patch-versioned level checkpoints matched on exact class, ascendancy, and/or main-skill selectors. The route marks the first level above the selected character as next, links optional named PoB specs and Atlas shares, and requires a source per checkpoint. These authored steps are not inferred from the passive-tree traversal; no game progression guide is bundled yet.
- **Partially delivered:** Assign a level locally to any imported PoB passive spec to include it as an ordered review checkpoint without editing route-pack JSON. The user supplies each level; the route never derives it from spec ordering or node IDs. A pack-linked named spec is not shown twice.
- Path of Building's current [passive spec serialization](https://github.com/PathOfBuildingCommunity/PathOfBuilding/blob/dev/src/Classes/PassiveSpec.lua#L2539-L2559) records the spec title, tree version, and node list, but no per-spec character level. Level labels therefore require a separate reviewed progression source.
- Present saved specs as author-provided alternatives. Their XML order is preserved but is not treated as a verified leveling sequence, and no respec cost or passive optimization is inferred.
- **Partially delivered:** Convert an explicitly ACTIVE PoB into an editable local current-character record after league selection. It carries the imported gear/skills/passive specs through a linked build manifest, but it does not prove the live character matches that PoB; GGG OAuth sync remains a separate gated source.
- Define an ordered typed route with stable step IDs, goal links, prerequisites, evidence, confidence, and a game-data version.
- Generate only steps supported by imported state or curated versioned data; show “needs data” for everything else.
- Add a route view to the desktop navigation showing the next steps by progression stage and a “Why this step?” explanation.
- Keep the character snapshot, league snapshot, and one or more build manifests separate.
- Export route JSON alongside existing priority-plan JSON/CSV.

**Acceptance:** importing a PoB produces a route view that distinguishes known target/build facts from unknown current character, stash, tree, and acquisition facts. A player can explicitly promote an ACTIVE PoB to a local current-character snapshot under the selected league, review its stage, and retain its full imported build facts. Route order and explanations are deterministic.

## Phase 3 — Current character, stash, and Atlas snapshots

- Recheck GGG registration status before attempting OAuth setup. The current official page says GGG is unable to process new application registrations, so this phase remains externally gated.
- **Partially delivered:** Import a player-authored, league-scoped JSON stash snapshot while OAuth is gated. Validate a bounded SSF Companion schema, preserve complete/partial coverage, use exact supplied counts in gear/craft route checks and loot relevance, and keep the data local. This is not a direct GGG API importer.
- After a registered public OAuth client is approved, request `account:leagues`, `account:characters`, and `account:stashes`; request `account:league_accounts` to read saved Atlas passive trees.
- Implement `Connect PoE Account`, then `Game → League → Character`, followed by separate Sync Character, Sync Stash, and Sync All actions.
- Keep league selection before character selection; stash and Atlas trees belong to league state, gear and character passives belong to character state.
- Store timestamped snapshots locally, rate-limit requests, handle partial failures, support disconnect/revoke/delete, and never place tokens in renderer storage or exports.
- Until OAuth is approved, continue working from PoB imports and local progression checklists. Never ask for a password or session cookie.

## Phase 4 — Patch-versioned PoE 1 knowledge packs

**Partially delivered:** The desktop app imports a bounded local JSON pack for exact item/base acquisition routes, craft plans, linked league-mechanic playbooks (setup, execution loop, conditional decisions, and stop condition), and exact-build-matched level checkpoints. Each entry must cite HTTPS sources; linked playbooks must match their route's exact target and progression stage; Atlas setups must include a valid official GGG share URL. No gameplay knowledge pack is bundled yet; detailed recommendations remain unavailable until sourced data has been curated and its reuse terms checked.

- Define an auditable source format for items, bases, gems, recipes, vendors, quests, drop sources, divination cards, bosses, league mechanics, Atlas nodes, and skill-tree nodes.
- Pin each pack to a PoE patch/content version, preserve upstream sources/licenses and reviewed timestamps, and make stale data visible.
- Treat GGG's public skill-tree export as player-supplied local data unless GGG provides redistribution terms; the export itself does not declare its patch version.
- Build automated pack validation for unknown IDs, missing prerequisites, invalid recipe cycles, dangling evidence references, and tree/version mismatch.
- Ship reviewed data incrementally. Never publish unsupported farm/drop claims as complete routes.

## Phase 5 — Route modules

- Compare current and target gear to identify slot-level upgrade gaps, stash-owned inputs, and achievable crafts.
- **Partially delivered:** Compare ACTIVE and target PoB equipment by slot and surface item labels plus bounded item-level, quality, sockets, display properties, flags, and modifier-like text. The route does not claim an upgrade until current-character equipment and reviewed patch-versioned affix/build-value rules are available.
- **Partially delivered:** Compare the saved ACTIVE and target PoB main skill/support gem groups and show added/removed supports. Live socket state and reviewed gem quest/vendor progression are still required before recommending a switch or acquisition timing.
- Generate step-by-step deterministic crafts, including base requirements, materials, unlocks, operation order, expected risk, and stop conditions.
- Recommend target-farm methods and the corresponding Atlas passives using item source data and the player's owned maps/trees.
- **Partially delivered:** Import official GGG Atlas share URLs and local SSF Companion snapshots into league-scoped storage. A player-selected GGG Atlas export can provide node labels/stats for matching hashes; the export lacks a patch label, so validated patch mapping, account snapshots, and farm plans still need data/API work.
- **Partially delivered:** Turn saved PoB specs into an inspectable graph traversal when the player imports matching local tree topology. This ordering is not a PoB-authored or optimized leveling guide. Source-backed level checkpoints can now reference a named target spec, but the app does not derive node levels, quest points, or respec timing; reviewed class/tree guidance remains future data work.
- Model campaign-to-mapping checkpoints, map sustain, resistance/life/defense readiness, boss readiness, and build-transition readiness.
- Make each item/route inspectable with current gap, reason, prerequisites, source, patch, confidence, and “not relevant” feedback.

## Phase 6 — FilterBlade/NeverSink handoff

- **V1 delivered:** Export a manual Markdown review guide and semantic JSON/CSV priorities with target bases, roles, scores, and explanations. The guide is explicit that it is not a FilterBlade-importable module, gives FilterBlade's own module reuse path, and says lower priority is not a hide instruction.
- **V1 delivered:** Optionally audit a selected local `.filter` export read-only. The audit shows candidate `BaseType` mentions with rule order/line, `$type`/`$tier` identifiers, related rule lines, recognized style/sound directives, `Continue`, and un-followed `Import` counts. It does not evaluate all conditions, claim final show/hide behavior, upload, or write filter contents.
- **V1 delivered:** Export the current priority plan with the matching local audit in one Markdown handoff. It includes bounded candidate rule references and their existing conditions/presentation next to target items, while preserving the audit limitations and discarding the raw filter text.
- **Partially delivered:** Optionally load FilterBlade's local `CustomizerDefault.options` file. The app indexes literal `QuickUI` IDs and labels, then annotates exact matching rules in the selected filter audit and Markdown handoff. It skips dynamic/function-built controls, withholds duplicate IDs, does not execute the `.options` DSL, and does not import or change saved customizer settings.
- **V1 delivered:** Preview and save a new local `.filter` copy. It prepends at most 100 rules for Keep/Consider targets when the selected export contains a complete, single-value `BaseType ==` Show rule with recognized presentation and no `Continue`. It reuses the source rule's bounded conditions and presentation commands, does not copy its FilterBlade metadata header/ID, and leaves all original filter text and rule IDs below the new blocks unchanged. The preview lists added, covered, and skipped targets; the copy is not validated by GGG and must be reviewed in FilterBlade's simulator and in game.
- **Research gate:** FilterBlade's public `.options` DSL configures its customizer UI; no public per-player priority import API is verified. The local copy operation is not an importable FilterBlade module, does not update customizer settings, does not follow `Import` files or model the full rule stack, and has no GGG filter-engine validation. It is a narrow syntactic copy of an existing rule body, not proof of final in-game behavior.
- Improve the preview with a source-relative diff and rule-precedence explanation; validate more versioned exports and filter syntax before broadening the accepted rule shapes. Continue to write only a new user-selected file and never overwrite the source filter.
- Contact FilterBlade/NeverSink maintainers before calling a customizer/module workflow official. Their public `.options` DSL describes the customizer UI; no public per-user saved-customizer API has been verified.
- If the player opts into GGG's official item-filter API after OAuth approval, treat create/update as a separate explicit action. Keep filters private by default; the API documents that a public filter cannot be made private again.

## Phase 7 — History, feedback, and release maturity

- Add local progression history and completed goal snapshots.
- Add opt-in anonymized route feedback/reporting with clear review and privacy controls before any community service exists.
- Publish only explicitly tagged, checksum-verified unsigned Windows previews for now. Keep the stable `v*` signing workflow dormant unless signing is requested and configured; macOS/Linux packages, backup/restore, migrations, and an update path remain future release work.
- Add PoE 2 only as a separate provider/data pack after PoE 1 route behavior and current PoE 2 API/game data are verified.

## Full-route definition of done

With a current character, league stash/Atlas snapshot, and imported target PoB, the app produces an ordered plan from current state to the target build. Each step names what to look for, where to farm, which Atlas setup to use, how to craft the item, which passive milestones to take, and which items the loot filter should emphasize. Every game-specific recommendation cites its versioned data source and shows uncertainty or missing inputs. The plan exports from the downloadable desktop app, and a customized filter output preserves the player's FilterBlade/NeverSink presentation.

## Current verification record

Latest local verification on 2026-10-05: `pnpm test` passed 107 tests across 14 files, including HTTP cache and `sprintf-js` security regression checks; `pnpm build` passed TypeScript and the Vite production build; `pnpm test:e2e` passed all three desktop/UI flows. The stash flow imports a player-authored league snapshot, marks an exact gear goal complete, and carries partial-coverage uncertainty into the route. The Windows portable build completed with version `0.2.3` and Authenticode status `NotSigned`.

The Playwright 1.63.0 workflow launches Electron with an isolated profile to verify the desktop window, preload bridge, and package version; exercises league-first PoB XML import and local current-character creation; imports a partial stash snapshot and checks exact gear coverage; verifies player-assigned PoB tree levels, route checkpoints, and a synthetic exact-match mechanic playbook; and inspects a second target PoB plus synthetic tree topology with an eleven-node traversal shown as two review checkpoints. CI uploads the stash and route screenshots for successful runs, and Playwright diagnostics if a step fails. UI flows report no browser errors or unexpected network requests. Test fixtures contain no game advice.

The [0.2.2 unsigned Windows preview](https://github.com/botelhodylan/ssf-companion/releases/tag/preview-v0.2.2) is public. Its 101,381,529-byte portable executable passed the Windows release job's product/version checks and Authenticode `NotSigned` check; its published SHA-256 is `440bbaf22d7bf8169dc9c3b8ea010b50abc88bdd70aac389505e69b348fb012b`. Main CI passed in [run 37396710356](https://github.com/botelhodylan/ssf-companion/actions/runs/37396710356), and unsigned packaging/publication passed in [run 37396718133](https://github.com/botelhodylan/ssf-companion/actions/runs/37396718133). OAuth, verified farm/craft/mechanic data, the full route, direct FilterBlade customizer-module integration, and GGG filter-engine validation remain outstanding. Signing remains disabled for now; future releases must continue to verify as unsigned.
