const fs = require("node:fs");
const path = require("node:path");

const workflowPath = path.join(__dirname, "..", ".github", "workflows", "release.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const requirements = [
  ["release builds only run when SignPath is enabled", /package-and-sign:\s*\n\s*if:\s*vars\.SIGNPATH_ENABLED\s*==\s*'true'/],
  ["release builds are tag-triggered", /tags:\s*\["v\*"\]/],
  ["release metadata is checked before signing", /name:\s*Check SignPath release configuration[\s\S]*?name:\s*Verify portable product metadata/],
  ["portable product/version metadata is validated", /VersionInfo\.ProductName[\s\S]*?VersionInfo\.ProductVersion/],
  ["SignPath artifact configuration is required", /artifact-configuration-slug:\s*\$\{\{\s*vars\.SIGNPATH_ARTIFACT_CONFIGURATION_SLUG\s*\}\}/],
  ["Authenticode validity is required", /signature\.Status\s*-ne\s*"Valid"/],
  ["signer subject is checked before and after upload", /SignerCertificate\.Subject\s*-cne\s*\$env:EXPECTED_SIGNER_SUBJECT/],
  ["publication waits for the enabled signing job", /publish:\s*\n\s*needs:\s*package-and-sign[\s\S]*?if:\s*vars\.SIGNPATH_ENABLED\s*==\s*'true'\s*&&\s*needs\.package-and-sign\.result\s*==\s*'success'/],
  ["publication verifies the signed artifact checksum", /expected[\s\S]*?SHA256SUMS\.txt[\s\S]*?actual[\s\S]*?expected\s*-ne\s*\$actual/],
];

const failures = requirements
  .filter(([name, pattern]) => {
    const minimum = name === "signer subject is checked before and after upload" ? 2 : 1;
    const matchCount = minimum > 1
      ? [...workflow.matchAll(new RegExp(pattern.source, "g"))].length
      : Number(pattern.test(workflow));
    if (matchCount >= minimum) return false;
    console.error(`Missing release workflow guard: ${name}`);
    return true;
  });

if (failures.length) process.exitCode = 1;
else console.log("Windows release workflow fail-closed signing checks passed.");
