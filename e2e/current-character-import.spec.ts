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

const syntheticProgressionPack = {
  schemaVersion: 1,
  game: "poe1",
  id: "synthetic-winter-orb-route",
  name: "Synthetic Winter Orb route",
  contentVersion: "3.29.3b",
  sources: [{
    id: "synthetic-guide",
    title: "Synthetic route source",
    url: "https://example.org/synthetic-winter-orb",
    checkedOn: "2026-10-05",
  }],
  acquisitionRoutes: [],
  craftPlans: [],
  mechanicPlans: [],
  progressionPlans: [{
    id: "winter-orb-elementalist",
    name: "Synthetic Winter Orb progression",
    match: { className: "Witch", ascendancy: "Elementalist", mainSkillName: "Winter Orb" },
    checkpoints: [
      {
        id: "campaign-milestone",
        level: 65,
        title: "Campaign milestone",
        objective: "Synthetic earlier checkpoint objective.",
        steps: ["Review this fixture milestone."],
        sourceIds: ["synthetic-guide"],
      },
      {
        id: "atlas-milestone",
        level: 90,
        title: "Atlas milestone",
        objective: "Synthetic next checkpoint objective.",
        steps: ["Review the imported Atlas PoB spec.", "Inspect the synthetic Atlas tree share."],
        passiveSpecName: "Atlas",
        atlasTreeName: "Synthetic Atlas setup",
        atlasNodeNames: ["Synthetic Atlas node"],
        atlasShareUrl: "https://www.pathofexile.com/atlas-skill-tree/AAAABgAAAfdPAAA=",
        sourceIds: ["synthetic-guide"],
      },
    ],
  }],
};

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

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Loot filter" }).click();
  await page.getByRole("tab", { name: /NEXT/ }).click();
  const targetPobXml = syntheticPobXml
    .replace("Synthetic Winter Orb Witch", "Synthetic Winter Orb Transition")
    .replace("nodes=\"100,101,102\"", `nodes=\"${Array.from({ length: 14 }, (_, index) => 100 + index).join(",")}\"`);
  await page.locator("#build-import").fill(targetPobXml);
  await page.getByRole("button", { name: "Import build" }).click();
  await expect(page.getByRole("region", { name: "Import a build" }).getByRole("status"))
    .toContainText("Imported Synthetic Winter Orb Transition");

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Progression route" }).click();
  const treeNodes: Record<string, { skill: number; name: string; stats: string[]; in?: string[]; out?: string[]; classStartIndex?: number }> = Object.fromEntries(Array.from({ length: 14 }, (_, index) => {
    const id = 100 + index;
    return [String(id), { skill: id, name: `Node ${id}`, stats: [], in: index > 0 ? [String(id - 1)] : ["99"], out: index < 13 ? [String(id + 1)] : [] }];
  }));
  treeNodes["99"] = { skill: 99, name: "WITCH", stats: [], classStartIndex: 0, out: ["100"] };
  await page.getByTestId("passive-tree-input").setInputFiles({
    name: "synthetic-tree-3_26.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ classes: [{ name: "Witch" }], nodes: treeNodes })),
  });
  await expect(page.getByRole("region", { name: "Local passive tree data" }).getByRole("status"))
    .toContainText("tree 3_26");
  const targetPassiveStep = page.getByRole("button", { name: /PoB tree spec: Atlas/ });
  await targetPassiveStep.click();
  const specLevelInput = inspector.getByLabel("Use this tree at level");
  await specLevelInput.fill("85");
  const assignedCheckpoint = page.getByRole("button", { name: /Next checkpoint: PoB tree · Atlas/ });
  await expect(assignedCheckpoint).toBeVisible();
  await assignedCheckpoint.click();
  await expect(inspector).toContainText("You assigned this level to an imported PoB tree");
  await targetPassiveStep.click();
  await inspector.getByLabel("Use this tree at level").fill("");
  await expect(assignedCheckpoint).toHaveCount(0);
  await page.getByTestId("route-pack-input").setInputFiles({
    name: "synthetic-winter-orb-route.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(syntheticProgressionPack)),
  });
  await expect(page.getByRole("region", { name: "PoE 1 route knowledge pack" }).getByRole("status"))
    .toContainText("Synthetic Winter Orb route · PoE 3.29.3b · 1 progression path · 0 acquisition routes · 0 craft plans · 0 mechanic playbooks · 1 source");
  const nextCheckpoint = page.getByRole("button", { name: /Next checkpoint: Atlas milestone/ });
  await expect(nextCheckpoint).toBeVisible();
  await nextCheckpoint.click();
  await expect(inspector).toContainText("Level 90 · Synthetic Winter Orb progression");
  await expect(inspector).toContainText("Synthetic next checkpoint objective.");
  await expect(inspector).toContainText("Passive tree spec: Atlas");
  await expect(inspector).toContainText("Atlas setup: Synthetic Atlas setup");
  await expect(inspector).toContainText("Synthetic Atlas node");
  await expect(inspector).toContainText("Review the imported Atlas PoB spec.");
  await expect(inspector.getByRole("button", { name: "Open source" })).toHaveCount(1);
  await expect(inspector.getByRole("button", { name: "Open Atlas tree share" })).toHaveCount(1);
  await targetPassiveStep.click();
  await expect(inspector).toContainText("up to ten nodes from this traversal");
  await inspector.getByText("View 2 traversal checkpoints · 11 nodes").click();
  await inspector.getByText("Checkpoint 1 · nodes 1–10").click();
  await expect(inspector).toContainText("Node 112");
  await inspector.getByText("Checkpoint 2 · nodes 11–11").click();
  await expect(inspector).toContainText("Node 113");
  expect(browserErrors).toEqual([]);
  expect(externalRequests).toEqual([]);

  await expect(page.locator(".toast-message")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("current-character-route.png") });
});
