const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const virtualStore = path.join(process.cwd(), "node_modules", ".pnpm");
const candidates = [
  path.join(process.cwd(), "node_modules", "http-cache-semantics"),
  ...(fs.existsSync(virtualStore) ? fs.readdirSync(virtualStore, { withFileTypes: true }) : [])
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("http-cache-semantics@4.3.0"))
  .map((entry) => path.join(virtualStore, entry.name, "node_modules", "http-cache-semantics")),
]
  .filter((directory) => fs.existsSync(path.join(directory, "index.js")));
const patchedDirectory = candidates.find((directory) =>
  fs.readFileSync(path.join(directory, "index.js"), "utf8").includes("staleReuseForbidden"),
);

assert.ok(patchedDirectory, "expected the patched http-cache-semantics 4.3.0 dependency");
const packageJson = JSON.parse(fs.readFileSync(path.join(patchedDirectory, "package.json"), "utf8"));
assert.equal(packageJson.version, "4.3.0");

const CachePolicy = require(patchedDirectory);
CachePolicy.prototype.now = () => 0;

function evaluate(responseHeaders, requestCacheControl, options) {
  const request = { url: "/private", headers: { host: "cache.example" } };
  const policy = new CachePolicy(request, { status: 200, headers: responseHeaders }, options);
  return policy.evaluateRequest({
    ...request,
    headers: { ...request.headers, "cache-control": requestCacheControl },
  });
}

for (const responseHeaders of [
  { "cache-control": "max-age=0", "set-cookie": "session=secret" },
  { "cache-control": "max-age=60, proxy-revalidate" },
  { "cache-control": "max-age=60, no-cache" },
  { "cache-control": "max-age=60", vary: "*" },
]) {
  const result = evaluate(responseHeaders, "max-stale=100");
  assert.equal(result.response, undefined, "must revalidate security-restricted stale responses");
  assert.ok(result.revalidation, "must return revalidation instructions");
}

const ordinaryStaleResponse = evaluate({ "cache-control": "max-age=1", age: "2" }, "max-stale=10");
assert.ok(ordinaryStaleResponse.response, "max-stale should still serve ordinary stale responses when allowed");
assert.equal(ordinaryStaleResponse.revalidation, undefined);

for (const responseHeaders of [
  { "cache-control": "public, max-age=0", "set-cookie": "session=secret" },
  { "cache-control": "immutable, max-age=0", "set-cookie": "session=secret" },
]) {
  assert.ok(evaluate(responseHeaders, "max-stale=100").response, "explicitly permitted shared cookie responses may remain stale-eligible");
}

assert.ok(
  evaluate(
    { "cache-control": "max-age=0", "set-cookie": "session=secret" },
    "max-stale=100",
    { shared: false },
  ).response,
  "private caches should retain their original stale-response behavior",
);

console.log("http-cache-semantics max-stale security regression checks passed");
