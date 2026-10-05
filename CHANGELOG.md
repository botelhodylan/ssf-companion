# Changelog

This project follows a simple release history. Changes are grouped by version; GitHub Releases are the source for downloadable builds.

## Unreleased

- Import official PoE 1 Atlas Skill Tree share URLs, keep them with their selected league, and save/re-import local JSON snapshots; optionally load a player-selected GGG Atlas export to show node labels with a patch-version caveat.
- Keep Windows portable builds unsigned while preserving the SSF Companion product name and version metadata.
- Add a read-only local audit for exported PoE filters, showing candidate build-target BaseType mentions and existing NeverSink/FilterBlade rule styling without changing or uploading the selected file.
- Add an optional combined Markdown handoff that places current audit references and existing style directives alongside build-aware priority recommendations.
- Optionally index local FilterBlade `CustomizerDefault.options` rule labels and attach exact matches to the read-only filter audit and Markdown handoff.
- Load the current public PoE 1 FilterBlade Customizer labels on request, with size, content-type, redirect-host, and timeout checks; retain local options-file import for offline/version-specific audits.
- Preview and save a separate style-matched `.filter` copy by reusing complete exact-base `Show` rules from a selected export; keep the source text unchanged and require simulator/in-game review.
- Preserve and display all named PoB skill and equipment sets, with active selections distinguished from alternate setups.
- Import bounded PoB item level, quality, socket layout, display properties, item flags, and modifier-like lines across active and alternate gear sets; include differences in the route as inspectable evidence without ranking the items.
- Pair each priority target with its bounded candidate NeverSink/FilterBlade rule references in the Markdown handoff, while labeling them as clues rather than effective filter outcomes.
- Harden the disabled Windows signing workflow with SignPath configuration, binary metadata, signer-identity, and release-checksum gates.
- Compare ACTIVE and target PoB equipment labels by slot to surface build-transition differences, while requiring live gear and item modifiers before calling any difference an upgrade.
- Compare ACTIVE and target PoB main skill/support gem groups and identify added or removed support gems, while requiring confirmed live sockets and reviewed PoE 1 gem progression data before giving switch timing.
- Extend the optional local PoE 1 passive-tree import with relevant node links and class starts; produce a caveated deterministic allocation traversal when matching topology is complete, without bundling GGG tree data.
- Add an inspectable suggested passive allocation order to the progression route, seeded from retained same-version allocations or the class start and labeled partial/unavailable when topology is incomplete.
- Keep external FilterBlade module imports and online filter updates separate from the local `.filter` copy workflow; generated copies remain unvalidated, and portable executables remain unsigned.
- Add a Markdown FilterBlade handoff guide that preserves the existing filter style and explains how to apply priorities manually.
- Include matched build roles in JSON/CSV handoffs.
- Add GitHub CI, issue templates, contribution/security guidance, and a signed-only Windows release workflow.
- The release workflow remains disabled until a trusted signing service is configured.
