# Local PoE 1 route knowledge packs

SSF Companion can read an optional local JSON file to add source-backed farming, crafting, and mechanic-operation steps to a progression route. The pack stays on the player's computer. No gameplay data is bundled yet, and an imported pack is always labeled as local data that the player should review.

Import it from **Progression route → Import a PoE 1 route knowledge pack**. Files are limited to 1.5 MB. The app shows the pack's content version and uses only exact normalized item-name/base-type matches; abstract tags do not trigger a route.

## Required top-level fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Must be `1`. |
| `game` | Must be `poe1`. |
| `id` | Stable letters/numbers/dot/underscore/hyphen ID. |
| `name` | Human-readable pack name. |
| `contentVersion` | Explicit PoE patch identifier such as `3.28.1` or lettered hotfix `3.29.3b`; the app displays it but does not determine whether it is current. |
| `sources` | One or more HTTPS source records with unique IDs, title, URL, and optional `checkedOn` date (`YYYY-MM-DD`). |
| `acquisitionRoutes` | Optional exact-match campaign, vendor, drop, divination card, league mechanic, boss, or Atlas acquisition entries. Trade methods are rejected for SSF. |
| `craftPlans` | Optional exact-match, ordered craft instructions. |
| `mechanicPlans` | Optional reusable, source-backed playbooks for league-mechanic setup, encounter loops, decision rules, and stop conditions. |

Each acquisition route, craft plan, and mechanic plan must reference one or more IDs from `sources`. URLs must use HTTPS and may not include embedded credentials. Atlas tree names or node labels require an official `pathofexile.com` Atlas share URL; the app validates that URL and offers to open it.

## Acquisition route fields

An acquisition route has `id`, `match`, `stage`, `method`, `title`, `steps`, and `sourceIds`. `match` must contain `itemNames` and/or `baseTypes`; punctuation and case are normalized for exact matching. `stage` is `campaign`, `early_mapping`, `atlas`, or `endgame`. Optional Atlas fields are `atlasTreeName`, `atlasNodeNames`, and the validated `atlasShareUrl`.

An acquisition route with `method: "league_mechanic"` may name a `mechanicPlanId`. The linked playbook must use the same stage and overlap on an exact item or base target. When the route matches a Build Manifest goal, the route inspector shows the playbook objective, prerequisites, Atlas setup, setup steps, encounter loop, conditional decision rules, stop condition, and evidence links.

## Craft plan fields

A craft plan has `id`, exact `match`, `stage`, `title`, `baseType`, optional `requiredItemLevel`, `prerequisites`, `materials`, ordered `steps`, `stopCondition`, and `sourceIds`. Each material is `{ "name": "...", "quantity": 1 }`; if the selected league stash snapshot is available, the route compares exact item names and shows owned and remaining counts. It does not infer affix tiers, odds, or outcomes that are absent from the pack.

A mechanic plan has `id`, stable `mechanicId` slug, display `name`, exact `match`, `stage`, `objective`, `prerequisites`, `setupSteps`, `executionSteps`, `decisionRules` (`{ "when": "...", "do": "..." }`), `stopCondition`, and `sourceIds`. Optional Atlas fields follow the same verified-share-URL rule as acquisition routes. A playbook does not become a recommendation by itself: a source-backed `league_mechanic` acquisition route must link it to an exact build item/base goal.

## Template

[`data/poe1-route-pack-template.json`](../data/poe1-route-pack-template.json) is an importable empty template, not usable game advice. Replace its example version and source, then add routes only after checking their patch validity, source support, and reuse terms. The app does not fetch or update pack data automatically.

Every step made from a local pack remains low confidence until its facts are independently reviewed. Its route inspector shows the cited source links and the pack version so a player can check them before crafting, farming, or following a mechanic playbook.
