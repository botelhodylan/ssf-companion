const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const packageDirectory = path.join(process.cwd(), "node_modules", "sprintf-js");
const sourcePath = path.join(packageDirectory, "src", "sprintf.js");
assert.ok(fs.existsSync(sourcePath), "expected sprintf-js source in node_modules");

const source = fs.readFileSync(sourcePath, "utf8");
assert.ok(source.includes("precision must be between 0 and 100"), "expected the local bounded-precision patch");
assert.ok(source.includes("parseFloat(arg).toPrecision(ph.precision || 1)"), "expected zero significant-digit precision to be normalized");

const { sprintf } = require(packageDirectory);
assert.equal(sprintf("%.0g", 1), "1");
assert.equal(sprintf("%.100f", 1), `1.${"0".repeat(100)}`);

for (const format of ["%.101f", "%.101e", "%.101g", "%.999999999999999999999999f"]) {
  assert.throws(
    () => sprintf(format, 1),
    { name: "RangeError", message: /precision must be between 0 and 100/ },
    `${format} must be rejected before reaching a native number formatter`,
  );
}

console.log("sprintf-js bounded-precision security regression checks passed");
