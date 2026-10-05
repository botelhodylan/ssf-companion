# Code signing policy

SSF Companion does not currently have a trusted code-signing certificate. Do not describe a Windows build as signed until a release asset has a verified Authenticode signature.

When a trusted signing service is configured, release binaries will be built by GitHub Actions from a version tag. The public release workflow will publish only after the returned executable passes Windows Authenticode verification. Signing requests must receive the configured release approval before publication. Release notes should identify the signer and include a SHA-256 hash for each executable.

The release workflow is disabled until signing is configured. Missing signer settings must never produce a public unsigned executable release.

## SignPath Foundation evaluation

SignPath Foundation is the recommended low-cost path under evaluation, not a configured signer or a guarantee of acceptance. Its current [eligibility terms](https://signpath.org/terms.html) require the project to have already released the same form of binary that it wants signed. This repository currently has no release or tag, so using that service would require a separately approved initial public Windows binary release before the project can apply for signing. The Foundation certificate names SignPath Foundation as publisher, and every signing request requires manual approval. Do not enable the workflow or publish the prerequisite binary until the maintainer has approved those terms and that release step.

The current local Windows candidate contains product name and version metadata (`SSF Companion`, `0.2.0`), but its Authenticode status is `NotSigned`. These metadata can be checked by a future artifact configuration. A successful signing run must still verify Authenticode status, expected signer identity, and the final release checksum before publishing.

For security reports, use the private vulnerability reporting flow on the repository's Security tab. The application does not transfer local player data unless a user explicitly submits a supported build URL or exports data.
