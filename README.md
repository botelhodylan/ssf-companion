# SSF Companion

SSF Companion is a downloadable, local-first desktop companion for Path of Exile 1 Solo Self-Found players. Its goal is to turn the current character, league stash, and one or more target builds into a versioned progression route covering gear, crafting, farming, passive trees, Atlas trees, and loot-filter priorities. The current release is the build-import and loot-priority foundation for that route.

This is an early, source-available build. The initial distribution target is a portable Windows `.exe`; the source uses Electron, React, and Vite so macOS/Linux packaging can be added later.

## Current slice

- Import a Path of Building code or supported `pobb.in` / Maxroll PoB share link.
- Keep builds under a local league and character, with `ACTIVE`, `NEXT`, and `INTERESTED` roles.
- Produce deterministic item-priority recommendations with a “Why am I seeing this?” explanation.
- Preserve all named passive-tree specs, node IDs, and tree versions from imported PoB builds. Optionally load a local GGG tree JSON export to label same-version node differences; no GGG tree data is bundled.
- Show a deterministic progression-route foundation for gear, crafting, farming/Atlas, passive trees, and loot priorities. Each step includes evidence, rule version, confidence, and explicit player/game-data gaps.
- Export a FilterBlade handoff guide (Markdown), plus JSON/CSV priority data with reasons and matched builds. The guide is for manual review inside the existing FilterBlade setup; it does not rewrite an existing filter or game files.
- Optionally audit a player-selected `.filter` export locally to find candidate `BaseType` mentions for current priorities, with rule order, FilterBlade IDs, other rule lines, existing style/sound directives, and `Continue` markers. The audit is read-only, partial, and does not follow `Import` files.
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
The current portable build is not code-signed, so Windows may show an unknown-publisher warning.

## Code signing policy

No trusted signing service is configured yet. The release workflow publishes a Windows executable only after a configured signing service returns a signature that passes Authenticode verification. See the [code signing policy](docs/code-signing-policy.md). Until then, do not treat any executable as signed.

## Data and privacy

Build parsing and prioritization run locally. Supported build-link imports send a request only to the matching build host after the user submits a link. Pobb.in requests include the public GitHub Issues contact URL by default (editable in Settings) in the User-Agent. The selected filter file is parsed locally for the audit and its contents are not saved or uploaded. Imported build data and local profile data stay on this machine unless the user explicitly exports them.

The app does not inspect the game process, read game logs, or access or modify the Path of Exile installation or its files. Exported files go only to a location selected by the user.

## Current integration limits

GGG's official API describes OAuth-backed PoE 1 character, league, and stash access. As checked on 2026-10-05, GGG says it is unable to process new OAuth application registrations, so account sync cannot be activated for this new project yet. The UI explains this without blocking build import or analysis.

FilterBlade's [public `.options` documentation](https://github.com/NeverSinkDev/FilterBlade-Public-Assets/blob/main/README_OptionFile.md) defines its customizer UI and warns that rule IDs must stay stable for saved customizations. Its [PoE 1 customizer](https://www.filterblade.xyz/?game=Poe1) manages “My Modules” inside FilterBlade; no external per-player priority-import API has been verified. V1 exports a Markdown review guide and semantic JSON/CSV priorities, and can inspect a user-selected exported filter without changing it. Players still apply chosen changes manually inside their existing FilterBlade/NeverSink setup, which keeps their styles, sounds, and strictness intact. The handoff is not an importable module or a ready-to-use `.filter` file.

## Project status

See [the product and technical specification](docs/product-technical-spec.md) and [the phased plan](docs/implementation-plan.md) for the full route target and its integration/data gates.

See [Contributing](CONTRIBUTING.md) for development and data-handling rules, and [Security](SECURITY.md) for private vulnerability reporting.

## Contact and support

Use [GitHub Issues](https://github.com/botelhodylan/ssf-companion/issues) for bug reports, feature requests, and general project contact. Use GitHub's private vulnerability reporting for security issues; do not post PoB codes or private account/stash data in an issue.

The current route is a planning scaffold: it organizes imported goals and shows what additional character/stash data and reviewed PoE data are required. Matching local tree data can name passive allocation differences, but the route does not generate an ordered passive path. It does not yet provide a patch-current craft recipe database, named drop routes, Atlas-tree plans, or a generated game-ready loot filter.

## Notice

This product isn't affiliated with or endorsed by Grinding Gear Games in any way.
