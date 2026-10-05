# Contributing

SSF Companion is a local-first PoE 1 project. Open an issue for a bug or feature before starting a large change. Keep reproduction data synthetic: do not post PoB codes, account details, character names, or private stash exports.

## Development

Requires Node.js 24 and pnpm 10.

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Keep scoring deterministic and explainable. Game-specific recommendations need a patch/versioned source and must remain visibly uncertain when evidence is incomplete. Use a provider boundary for game-specific behavior. Do not read or modify game files, request session cookies, or add private player data to fixtures.

## Pull requests

Keep changes focused, include tests for new rules, and explain the player-visible effect. Loot-filter work must preserve existing FilterBlade/NeverSink colors, sounds, styles, and strictness. Never overwrite an input filter or describe a manual handoff as an importable FilterBlade module.
