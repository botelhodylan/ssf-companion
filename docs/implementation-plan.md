# SSF Companion — Phased Implementation Plan

**Product:** downloadable, local-first PoE 1 desktop app. PoE 2 is planned as a separate future game provider.

## Phase 0 — Product and integration contracts

**Status: complete.** Verified current GGG OAuth/API, Path of Building import/data, and FilterBlade public customizer integration surfaces. Locked the league-before-character hierarchy, no game-file access, deterministic recommendations, and explicit evidence/data versions.

## Phase 1 — Build import and explainable loot priorities

**Status: complete for the first local-first slice.** The Windows desktop app imports PoB code/XML/files and supported pobb.in/Maxroll share links, normalizes skills/equipment/goals, supports ACTIVE/NEXT/INTERESTED builds, ranks known goals, explains recommendations, and exports JSON/CSV plus a manual FilterBlade review guide. It packages as a portable Windows executable. It does not require an account.

## Phase 2 — Progression route foundation

**Status: in progress.** Turn the goal into a single route workspace rather than a collection of disconnected tools.

- Preserve every named PoB passive spec, its tree version, and numeric node IDs.
- Compare imported target specs against the ACTIVE PoB tree only when both tree versions match; show added/removed node IDs and withhold differences across missing or mismatched versions.
- Present saved specs as author-provided alternatives. Their XML order is preserved but is not treated as a verified leveling sequence, and no respec cost or passive optimization is inferred.
- Define an ordered typed route with stable step IDs, goal links, prerequisites, evidence, confidence, and a game-data version.
- Generate only steps supported by imported state or curated versioned data; show “needs data” for everything else.
- Add a route view to the desktop navigation showing the next steps by progression stage and a “Why this step?” explanation.
- Keep the character snapshot, league snapshot, and one or more build manifests separate.
- Export route JSON alongside existing priority-plan JSON/CSV.

**Acceptance:** importing a PoB produces a route view that distinguishes known target/build facts from unknown current character, stash, tree, and acquisition facts. Route order and explanations are deterministic.

## Phase 3 — Current character, stash, and Atlas snapshots

- Recheck GGG registration status. It is paused as of 2026-10-05, so this phase is externally gated.
- After a registered public OAuth client is approved, request `account:leagues`, `account:characters`, and `account:stashes`; request `account:league_accounts` to read saved Atlas passive trees.
- Implement `Connect PoE Account`, then `Game → League → Character`, followed by separate Sync Character, Sync Stash, and Sync All actions.
- Keep league selection before character selection; stash and Atlas trees belong to league state, gear and character passives belong to character state.
- Store timestamped snapshots locally, rate-limit requests, handle partial failures, support disconnect/revoke/delete, and never place tokens in renderer storage or exports.
- Until OAuth is approved, continue working from PoB imports and local progression checklists. Never ask for a password or session cookie.

## Phase 4 — Patch-versioned PoE 1 knowledge packs

- Define an auditable source format for items, bases, gems, recipes, vendors, quests, drop sources, divination cards, bosses, league mechanics, Atlas nodes, and skill-tree nodes.
- Pin each pack to a PoE patch/content version, preserve upstream sources/licenses and reviewed timestamps, and make stale data visible.
- Build automated pack validation for unknown IDs, missing prerequisites, invalid recipe cycles, dangling evidence references, and tree/version mismatch.
- Ship reviewed data incrementally. Never publish unsupported farm/drop claims as complete routes.

## Phase 5 — Route modules

- Compare current and target gear to identify slot-level upgrade gaps, stash-owned inputs, and achievable crafts.
- Generate step-by-step deterministic crafts, including base requirements, materials, unlocks, operation order, expected risk, and stop conditions.
- Recommend target-farm methods and the corresponding Atlas passives using item source data and the player's owned maps/trees.
- Turn PoB named specs into ordered character-tree milestones; do not compare or prescribe when tree versions mismatch.
- Model campaign-to-mapping checkpoints, map sustain, resistance/life/defense readiness, boss readiness, and build-transition readiness.
- Make each item/route inspectable with current gap, reason, prerequisites, source, patch, confidence, and “not relevant” feedback.

## Phase 6 — FilterBlade/NeverSink handoff

- **V1 delivered:** Export a manual Markdown review guide and semantic JSON/CSV priorities with target bases, roles, scores, and explanations. The guide is explicit that it is not a FilterBlade-importable module, gives FilterBlade's own module reuse path, and says lower priority is not a hide instruction.
- Prototype a semantic adapter against versioned base filters and sample custom styles/sounds.
- Preserve the chosen style, colors, sounds, strictness, and existing rule IDs; add only transparent semantic priority overlays.
- Provide a diff, validation status, backup copy, and user-selected new output file. Never overwrite the source filter.
- Contact FilterBlade/NeverSink maintainers before calling a customizer/module workflow official. Their public `.options` DSL describes the customizer UI; no public per-user saved-customizer API has been verified.
- If the player opts into GGG's official item-filter API after OAuth approval, treat create/update as a separate explicit action. Keep filters private by default; the API documents that a public filter cannot be made private again.

## Phase 7 — History, feedback, and release maturity

- Add local progression history and completed goal snapshots.
- Add opt-in anonymized route feedback/reporting with clear review and privacy controls before any community service exists.
- Add signed Windows distribution, macOS/Linux packages, backup/restore, migrations, and update path after Windows behavior is stable.
- Add PoE 2 only as a separate provider/data pack after PoE 1 route behavior and current PoE 2 API/game data are verified.

## Full-route definition of done

With a current character, league stash/Atlas snapshot, and imported target PoB, the app produces an ordered plan from current state to the target build. Each step names what to look for, where to farm, which Atlas setup to use, how to craft the item, which passive milestones to take, and which items the loot filter should emphasize. Every game-specific recommendation cites its versioned data source and shows uncertainty or missing inputs. The plan exports from the downloadable desktop app, and a customized filter output preserves the player's FilterBlade/NeverSink presentation.

## Current verification record

On 2026-10-05, the latest source passed 27 core tests, a `http-cache-semantics` max-stale security regression check, and the TypeScript/Vite production build. The Windows GitHub Actions CI run also passed. Same-version PoB passive specs now produce exact added/removed node-ID comparisons against the ACTIVE build; missing or mismatched versions produce no inferred delta. Account import remains blocked by GGG OAuth registration availability; verified craft recipes, target farms/Atlas trees, named passive-node routes, and direct customized-filter generation still require reviewed game data and further integration work.
