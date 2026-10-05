# Changelog

This project follows a simple release history. Changes are grouped by version; GitHub Releases are the source for downloadable builds.

## Unreleased

- Add a read-only local audit for exported PoE filters, showing candidate build-target BaseType mentions and existing NeverSink/FilterBlade rule styling without changing or uploading the selected file.
- Add an optional local PoE 1 passive-tree JSON import that labels same-version PoB allocation differences without bundling GGG tree data.
- Keep FilterBlade exports review-only until a priority overlay can be validated against real FilterBlade output without losing existing presentation.
- Add a Markdown FilterBlade handoff guide that preserves the existing filter style and explains how to apply priorities manually.
- Include matched build roles in JSON/CSV handoffs.
- Add GitHub CI, issue templates, contribution/security guidance, and a signed-only Windows release workflow.
- The release workflow remains disabled until a trusted signing service is configured.
