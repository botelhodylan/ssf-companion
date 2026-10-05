# Code signing policy

SSF Companion does not currently have a trusted code-signing certificate. Do not describe a Windows build as signed until a release asset has a verified Authenticode signature.

When a trusted signing service is configured, release binaries will be built by GitHub Actions from a version tag. The public release workflow will publish only after the returned executable passes Windows Authenticode verification. Signing requests must receive the configured release approval before publication. Release notes should identify the signer and include a SHA-256 hash for each executable.

The release workflow is disabled until signing is configured. Missing signer settings must never produce a public unsigned executable release.

For security reports, use the private vulnerability reporting flow on the repository's Security tab. The application does not transfer local player data unless a user explicitly submits a supported build URL or exports data.
