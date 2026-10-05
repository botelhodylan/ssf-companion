import { expect, test } from "@playwright/test";

const syntheticPobXml = `<?xml version="1.0"?>
<PathOfBuilding>
  <Build name="Synthetic Winter Orb Witch" className="Witch" ascendClassName="Elementalist" level="84" mainSkillIndex="1"/>
  <Skills activeSkillSet="1">
    <SkillSet id="1" title="Mapping">
      <Skill label="Winter Orb main" slot="Helmet" enabled="true" includeInFullDPS="true" mainActiveSkill="1">
        <Gem nameSpec="Winter Orb" level="20" quality="20" enabled="true"/>
        <Gem nameSpec="Hypothermia Support" level="20" enabled="true"/>
      </Skill>
    </SkillSet>
  </Skills>
  <Items activeItemSet="1">
    <Item id="1">Rarity: UNIQUE
The Taming
Prismatic Ring</Item>
    <ItemSet id="1" title="Mapping gear"><Slot name="Ring 1" itemId="1"/></ItemSet>
  </Items>
  <Tree activeSpec="1"><Spec id="1" title="Atlas" treeVersion="3_26" nodes="100,101,102"/></Tree>
</PathOfBuilding>`;

test("imports a PoB into a league character and opens its progression route", async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  const externalRequests: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4173/")) externalRequests.push(request.url());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Loot filter workspace" })).toBeVisible();
  await page.locator("#league-select").selectOption("__create");
  const leagueDialog = page.getByRole("dialog", { name: "Add a local league" });
  await leagueDialog.getByLabel("League name").fill("Synthetic SSF League");
  await leagueDialog.getByRole("button", { name: "Add league" }).click();
  await expect(page.locator("#league-select")).toHaveValue(/league-/);
  await expect(page.locator("#character-select")).toBeEnabled();

  await page.locator("#build-import").fill(syntheticPobXml);
  await page.getByRole("button", { name: "Import build" }).click();
  const importStatus = page.getByRole("region", { name: "Import a build" }).getByRole("status");
  await expect(importStatus).toContainText("Imported Synthetic Winter Orb Witch for this session");
  await expect(page.getByRole("region", { name: "Imported build details" })).toContainText("Winter Orb");

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Create character from ACTIVE PoB" }).click();
  const characterDialog = page.getByRole("dialog", { name: "Create character from ACTIVE PoB" });
  await expect(characterDialog.getByLabel("Character name")).toHaveValue("Synthetic Winter Orb Witch");
  await expect(characterDialog.getByLabel("Class")).toHaveValue("Witch");
  await expect(characterDialog.getByLabel("Level")).toHaveValue("84");
  await expect(characterDialog.getByLabel("Current progression stage · confirm")).toHaveValue("atlas");
  await characterDialog.getByRole("button", { name: "Create local snapshot" }).click();

  await expect(page.getByRole("heading", { name: "Progression route" })).toBeVisible();
  const routeContext = page.getByRole("region", { name: "Route planning context" });
  await expect(routeContext).toContainText("Synthetic Winter Orb Witch");
  await expect(routeContext).toContainText("Atlas progression");
  const passiveStep = page.getByRole("button", { name: /PoB tree spec: Atlas/ });
  await expect(passiveStep).toBeVisible();
  await passiveStep.click();
  const inspector = page.getByRole("complementary", { name: "Selected route step details" });
  await expect(inspector).toContainText("Imported Path of Building tree");
  await expect(inspector).toContainText("3 target node IDs");
  await expect(inspector).toContainText("3_26");
  expect(browserErrors).toEqual([]);
  expect(externalRequests).toEqual([]);

  await expect(page.locator(".toast-message")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("current-character-route.png") });
});
