import { expect, test } from "@playwright/test";

const syntheticPobXml = `<?xml version="1.0"?>
<PathOfBuilding>
  <Build name="Synthetic Atlas Tracker" className="Witch" ascendClassName="Elementalist" level="84" mainSkillIndex="1"/>
  <Skills><SkillSet id="1" title="Mapping"><Skill label="Main" slot="Helmet" enabled="true" includeInFullDPS="true" mainActiveSkill="1"><Gem nameSpec="Winter Orb" level="20" quality="20" enabled="true"/></Skill></SkillSet></Skills>
  <Items><ItemSet id="1" title="Mapping gear"/></Items>
  <Tree activeSpec="1"><Spec id="1" title="Mapping" treeVersion="3_26" nodes="100,101,102"/></Tree>
</PathOfBuilding>`;

test("previews and saves a league-scoped Atlas progress report", async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Loot filter workspace" })).toBeVisible();
  await page.locator("#league-select").selectOption("__create");
  const firstLeagueDialog = page.getByRole("dialog", { name: "Add a local league" });
  await firstLeagueDialog.getByLabel("League name").fill("Synthetic Atlas League A");
  await firstLeagueDialog.getByRole("button", { name: "Add league" }).click();

  await page.locator("#build-import").fill(syntheticPobXml);
  await page.getByRole("button", { name: "Import build" }).click();
  await expect(page.getByRole("region", { name: "Import a build" }).getByRole("status"))
    .toContainText("Imported Synthetic Atlas Tracker");

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Account" }).click();
  const reportInput = page.getByLabel("/atlaspassives report");
  await reportInput.fill([
    "120 total Atlas Passive Skill points (118 allocated)",
    "100/100 Map Bonus Objectives",
    "5/5 from Maven's Invitation: The Atlas",
  ].join("\n"));
  await page.getByRole("button", { name: "Preview report" }).click();
  const preview = page.getByRole("region", { name: "Atlas progress preview" });
  await expect(preview).toContainText("120 Atlas points earned · 118 allocated");
  await expect(preview).toContainText("Map Bonus Objectives");
  await page.screenshot({ path: testInfo.outputPath("atlas-progress-preview.png") });
  await page.getByRole("button", { name: "Confirm and save to league" }).click();
  const atlasSection = page.getByRole("region", { name: "League Atlas progress snapshot" });
  await expect(atlasSection.getByText("Saved the /atlaspassives summary for Synthetic Atlas League A")).toBeVisible();
  const persistedSnapshot = await page.evaluate(() => localStorage.getItem("ssf-companion:league-atlas-progress:v1") ?? "");
  expect(persistedSnapshot).toContain('"totalPoints":120');
  expect(persistedSnapshot).not.toContain("120 total Atlas Passive Skill points");

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Progression route" }).click();
  const routeContext = page.getByRole("region", { name: "Route planning context" });
  await expect(routeContext).toContainText("League Atlas progress report: 120 points earned, 118 allocated.");
  await expect(page.getByRole("complementary", { name: "Selected route step details" }))
    .toContainText("120 Atlas points earned and 118 allocated");

  await page.locator("#league-select").selectOption("__create");
  const secondLeagueDialog = page.getByRole("dialog", { name: "Add a local league" });
  await secondLeagueDialog.getByLabel("League name").fill("Synthetic Atlas League B");
  await secondLeagueDialog.getByRole("button", { name: "Add league" }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Account" }).click();
  await expect(page.getByText("No league Atlas progress report is loaded.")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Progression route" }).click();
  await expect(page.getByRole("region", { name: "Route planning context" })).toContainText("No league Atlas progress report is loaded.");

  await page.locator("#league-select").selectOption({ label: "Synthetic Atlas League A" });
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Account" }).click();
  await expect(atlasSection.getByText("120 Atlas points earned · 118 allocated")).toBeVisible();
  expect(browserErrors).toEqual([]);
});
