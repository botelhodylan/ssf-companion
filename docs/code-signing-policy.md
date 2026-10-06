# Code signing policy

SSF Companion does not currently have a trusted code-signing certificate. Windows releases remain unsigned for now. Do not describe a Windows build as signed until a release asset has a verified Authenticode signature.

An early-access channel can publish an explicitly tagged Windows prerelease while the executable remains unsigned. That workflow must label the release as a prerelease, verify product/version metadata and `NotSigned` Authenticode status, and publish a SHA-256 checksum. Release notes must state that Windows may show an unknown-publisher warning and describe incomplete features.

The active distribution path is an unsigned, explicitly tagged preview with verified product/version metadata, a `NotSigned` Authenticode check, and a SHA-256 checksum. The stable `v*` signing workflow stays dormant. Do not enable signing or publish a signed build unless the user changes this decision and the signer is configured; missing signer settings must never turn the stable workflow into a release.

## SignPath Foundation evaluation

SignPath Foundation is the recommended low-cost path under evaluation, not a configured signer or a guarantee of acceptance. Its [eligibility terms](https://signpath.org/terms.html) require a project to have released the same form of binary it wants signed. The Foundation certificate names SignPath Foundation as publisher, and every signing request requires manual approval. Recheck the current terms and obtain maintainer approval before applying or enabling the signing workflow.

The current local Windows candidate contains product name and version metadata (`SSF Companion`, `0.2.3`), but its Authenticode status is `NotSigned`. These metadata can be checked by a future artifact configuration. A successful signing run must still verify Authenticode status, expected signer identity, and the final release checksum before publishing.

After approval and SignPath project setup, the workflow requires the `SIGNPATH_API_TOKEN` Actions secret and repository variables `SIGNPATH_ENABLED`, `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_RELEASE_POLICY_SLUG`, `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`, and `SIGNPATH_EXPECTED_SIGNER_SUBJECT`. The workflow checks all of them, validates the portable executable's product/version metadata, and refuses to publish unless the signature is valid and its subject exactly matches the configured signer.

For security reports, use the private vulnerability reporting flow on the repository's Security tab. The application does not transfer local player data unless a user explicitly submits a supported build URL or exports data.
