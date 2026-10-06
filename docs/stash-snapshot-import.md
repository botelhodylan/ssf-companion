# Local PoE 1 league stash snapshots

When GGG account sync is unavailable, SSF Companion can import player-authored item counts for the selected league. This is a local convenience format; it is not a GGG API export format, and the app does not fetch stash data or validate that counts match the game.

Use Account & local data → Import a local stash snapshot → Save JSON template to create a league-specific starter file. Edit the items list with item names and counts, then import the file under that same league. A repository copy is available as the [stash snapshot template](../data/poe1-stash-snapshot-template.json).

## Format

    {
      "format": "ssf-companion-stash-snapshot",
      "schemaVersion": 1,
      "game": "poe1",
      "leagueName": "My SSF League",
      "coverage": "partial",
      "items": [
        {
          "name": "Orb of Alteration",
          "baseType": "Orb of Alteration",
          "quantity": 24,
          "tags": ["currency"]
        },
        {
          "name": "The Taming",
          "baseType": "Prismatic Ring",
          "quantity": 1
        }
      ]
    }

Name and positive integer quantity are required. Base type and player-supplied tags are optional. Duplicate records with the same normalized name and base are combined. Matching is deterministic and uses only supplied names, bases, and tags; the app does not infer item categories.

League name must match the currently selected local league. Stash counts are stored under that league, independently of selected characters and builds.

Coverage is required:

- Partial: counts confirm only items listed in the file. If an item is absent or a listed count is below a goal, the route marks that gap unknown and asks you to check the remaining tabs or import a complete snapshot.
- Complete: you assert that the file covers all stash tabs you intend the planner to count. An absent exact match can then be treated as zero for route comparisons.

The priority engine uses exact listed counts to reduce the relevance of items already owned. No raw JSON is retained; the app stores only validated item identities, counts, the selected league, the source filename, and import time in local app storage. The file is size-limited to 1.5 MB and 10,000 item types.
