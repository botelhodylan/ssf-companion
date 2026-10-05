import { expect, test } from "@playwright/test";

const routePack = {
  schemaVersion: 1,
  game: "poe1",
  id: "playwright-ui-fixture",
  name: "Playwright UI fixture",
  contentVersion: "3.29.3b",
  sources: [
    {
      id: "route-source",
      title: "Synthetic route source",
      url: "https://example.org/route-fixture",
      checkedOn: "2026-10-05",
    },
    {
      id: "playbook-source",
      title: "Synthetic playbook source",
      url: "https://example.org/playbook-fixture",
      checkedOn: "2026-10-05",
    },
  ],
  acquisitionRoutes: [
    {
      id: "fixture-route",
      match: { baseTypes: ["Torturer's Mask"] },
      stage: "atlas",
      method: "league_mechanic",
      title: "Synthetic Betrayal route",
      steps: ["Fixture route step; not in-game advice."],
      mechanicPlanId: "fixture-playbook",
      sourceIds: ["route-source"],
    },
  ],
  craftPlans: [],
  mechanicPlans: [
    {
      id: "fixture-playbook",
      mechanicId: "synthetic-mechanic",
      name: "Synthetic mechanic",
      match: { baseTypes: ["Torturer's Mask"] },
      stage: "atlas",
      objective: "Fixture only; no Path of Exile mechanic advice is represented.",
      prerequisites: ["Use this test fixture only."],
      setupSteps: ["Fixture setup step."],
      executionSteps: ["Fixture execution step."],
      decisionRules: [{ when: "Fixture condition.", do: "Fixture response." }],
      stopCondition: "Stop when the UI assertion is complete.",
      sourceIds: ["playbook-source"],
    },
  ],
};

test("imports a versioned route pack and explains its linked mechanic playbook", async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/SSF Companion/);
  await expect(page.getByRole("heading", { name: "Loot filter workspace" })).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Progression route" }).click();
  await expect(page.getByRole("heading", { name: "Progression route" })).toBeVisible();

  await page.getByTestId("route-pack-input").setInputFiles({
    name: "playwright-ui-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(routePack)),
  });

  await expect(page.getByRole("region", { name: "PoE 1 route knowledge pack" }).getByRole("status"))
    .toContainText("Playwright UI fixture · PoE 3.29.3b · 1 acquisition route · 0 craft plans · 1 mechanic playbook · 2 sources");
  const routeStep = page.getByRole("button", { name: /Target league mechanic: Synthetic Betrayal route/ });
  await expect(routeStep).toBeVisible();
  await routeStep.click();

  const inspector = page.getByRole("complementary", { name: "Selected route step details" });
  await expect(inspector).toContainText("Synthetic mechanic playbook");
  await expect(inspector).toContainText("Use this league mechanic route for Torturer's Mask.");
  await expect(inspector).toContainText("Fixture only; no Path of Exile mechanic advice is represented.");
  await expect(inspector).toContainText("Use this test fixture only.");
  await expect(inspector).toContainText("Fixture setup step.");
  await expect(inspector).toContainText("Fixture execution step.");
  await expect(inspector).toContainText("Fixture condition.");
  await expect(inspector).toContainText("Stop condition: Stop when the UI assertion is complete.");
  await expect(inspector.getByRole("button", { name: "Open source" })).toHaveCount(2);
  expect(browserErrors).toEqual([]);

  await expect(page.locator(".toast-message")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("progression-route-playbook.png") });
});
