import { describe, expect, it } from "vitest";
import { normalizeBuildInput, parsePathOfBuildingXml } from "./build-import";

const POB_XML = `<?xml version="1.0"?>
<PathOfBuilding>
  <Build name="SSF Test Witch" className="Witch" ascendClassName="Elementalist" level="84" mainSkillIndex="1"/>
  <Skills activeSkillSet="2">
    <SkillSet id="1" title="Old setup">
      <Skill label="Old skill" mainActiveSkill="1"><Gem nameSpec="Fireball"/></Skill>
    </SkillSet>
    <SkillSet id="2" title="Mapping">
      <Skill label="Winter Orb 6-link" slot="Helmet" enabled="true" includeInFullDPS="true" mainActiveSkill="1">
        <Gem nameSpec="Winter Orb" level="20" quality="20" enabled="true"/>
        <Gem nameSpec="Awakened Added Cold Damage Support" level="5" quality="20" enabled="true"/>
        <Gem nameSpec="Hypothermia Support" level="20" quality="0" enabled="true"/>
      </Skill>
      <Skill label="Movement" slot="Boots" mainActiveSkill="1">
        <Gem nameSpec="Flame Dash" level="20" enabled="true"/>
        <Gem nameSpec="Arcane Surge Support" level="1" enabled="true"/>
      </Skill>
    </SkillSet>
  </Skills>
  <Items activeItemSet="2">
    <Item id="1">Rarity: UNIQUE
Old Unique
Old Ring</Item>
    <Item id="2">Rarity: RARE
Foe Shell
Torturer's Mask</Item>
    <Item id="3">Rarity: UNIQUE
The Taming
Prismatic Ring</Item>
    <ItemSet id="1" name="Old gear">
      <Slot name="Ring 1" itemId="1"/>
    </ItemSet>
    <ItemSet id="2" name="Mapping gear">
      <Slot name="Helmet" itemId="2"/>
      <Slot name="Ring 1" itemId="3"/>
    </ItemSet>
  </Items>
  <Tree activeSpec="2">
    <Spec id="1" title="Campaign" treeVersion="3_26" nodes="1,2"/>
    <Spec id="2" title="Mapping" treeVersion="3_26" nodes="100,101,101,102"/>
  </Tree>
</PathOfBuilding>`;

describe("normalizeBuildInput", () => {
  it("creates a PoE 1 manifest from pasted PoB XML and inferred equipped goals", async () => {
    const result = await normalizeBuildInput(POB_XML);

    expect(result.status).toBe("complete");
    expect(result.manifest).toMatchObject({
      game: "poe1",
      name: "SSF Test Witch",
      className: "Witch",
      ascendancy: "Elementalist",
      level: 84,
      role: "ACTIVE",
      progressionStage: "atlas",
    });
    expect(result.manifest?.itemGoals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "equip", match: { itemNames: ["The Taming"] } }),
        expect.objectContaining({ kind: "crafting", match: { baseTypes: ["Torturer's Mask"] } }),
      ]),
    );
    expect(result.manifest?.skills).toMatchObject({
      activeSkillSetId: 2,
      activeSkillSetName: "Mapping",
      mainSkillGroupIndex: 1,
      mainSkillName: "Winter Orb",
      supportGemNames: ["Awakened Added Cold Damage Support", "Hypothermia Support", "Arcane Surge Support"],
    });
    expect(result.manifest?.skills?.groups[0]?.gems[0]).toMatchObject({
      name: "Winter Orb",
      role: "other",
      level: 20,
      quality: 20,
      enabled: true,
    });
    expect(result.manifest?.equippedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slotName: "Helmet",
        itemId: "2",
        rarity: "RARE",
        itemName: "Foe Shell",
        baseType: "Torturer's Mask",
      }),
      expect.objectContaining({
        slotName: "Ring 1",
        itemId: "3",
        rarity: "UNIQUE",
        itemName: "The Taming",
        uniqueName: "The Taming",
        baseType: "Prismatic Ring",
      }),
    ]));
    expect(result.manifest?.passiveAllocationCount).toBe(3);
    expect(result.manifest?.passiveSpecs).toEqual([
      { id: 1, name: "Campaign", treeVersion: "3_26", isActive: false, allocatedNodeIds: [1, 2] },
      { id: 2, name: "Mapping", treeVersion: "3_26", isActive: true, allocatedNodeIds: [100, 101, 102] },
    ]);
    expect(result.manifest?.parseWarnings).toEqual([]);
    expect(result.manifest?.confidence).toBe("high");
    expect(result.manifest?.source).not.toHaveProperty("rawCode");
  });

  it("inflates a pasted Path of Building code through the injectable local decoder", async () => {
    let received: Uint8Array | undefined;
    const result = await normalizeBuildInput("VGhpcy1pcy1hLVBvQi1zaGFyZS1jb2Rl", {
      inflateZlib: async (compressed) => {
        received = compressed;
        return new TextEncoder().encode(POB_XML);
      },
    });

    expect(result.status).toBe("complete");
    expect(result.manifest?.name).toBe("SSF Test Witch");
    expect(received).toBeInstanceOf(Uint8Array);
    expect(result.manifest?.source).toEqual({ kind: "pob_code", importState: "complete" });
  });

  it("decodes a zlib-compressed Path of Building share code with the runtime inflater", async () => {
    const compressed = new Uint8Array(await new Response(
      new Blob([POB_XML]).stream().pipeThrough(new CompressionStream("deflate")),
    ).arrayBuffer());
    let binary = "";
    for (const byte of compressed) binary += String.fromCharCode(byte);

    const result = await normalizeBuildInput(btoa(binary));

    expect(result.status).toBe("complete");
    expect(result.manifest?.name).toBe("SSF Test Witch");
    expect(result.manifest?.skills?.mainSkillName).toBe("Winter Orb");
  });

  it("recognizes pobb.in and Maxroll links without claiming to have imported their content", async () => {
    const pobb = await normalizeBuildInput("https://pobb.in/ExampleCode");
    const maxroll = await normalizeBuildInput("https://maxroll.gg/poe/build-guides/example-build-guide");
    const maxrollShare = await normalizeBuildInput("https://maxroll.gg/poe/pob/AbC_123");
    const pobbUserLink = await normalizeBuildInput("https://pobb.in/u/SomeUser/ExampleCode/raw");

    expect(pobb).toMatchObject({ status: "partial", source: "pobb_in_url" });
    expect(pobb.manifest).toBeUndefined();
    expect(pobb.fetchPlan).toMatchObject({
      url: "https://pobb.in/ExampleCode/raw",
      allowedHost: "pobb.in",
      userAgentPolicy: "app_identity_and_configured_contact",
    });
    expect(pobbUserLink.fetchPlan?.url).toBe("https://pobb.in/u/SomeUser/ExampleCode/raw");
    expect(maxroll).toMatchObject({ status: "partial", source: "maxroll_url" });
    expect(maxroll.fetchPlan).toBeUndefined();
    expect(maxroll.message).toContain("guide pages are not imported");
    expect(maxroll.manifest).toBeUndefined();
    expect(maxrollShare.fetchPlan).toMatchObject({
      url: "https://maxroll.gg/poe/api/pob/AbC_123",
      allowedHost: "maxroll.gg",
      responseKind: "provider_payload",
    });
    expect(maxrollShare.manifest).toBeUndefined();
  });

  it("exposes a parser boundary for XML decoded by the desktop main process", () => {
    const result = parsePathOfBuildingXml(POB_XML);
    expect(result.status).toBe("complete");
    expect(result.manifest?.className).toBe("Witch");
  });

  it("returns an honest partial manifest when PoB XML omits build metadata", async () => {
    const result = await normalizeBuildInput("<PathOfBuilding><Items/></PathOfBuilding>");

    expect(result.status).toBe("partial");
    expect(result.manifest?.name).toBe("Imported Path of Building build");
    expect(result.limitations.join(" ")).toContain("Build metadata element");
    expect(result.manifest?.confidence).toBe("low");
    expect(result.manifest?.parseWarnings).toContain("The PoB XML has no Skills section.");
  });

  it("marks a metadata-only XML summary as partial when key sections are missing", () => {
    const result = parsePathOfBuildingXml(
      '<PathOfBuilding><Build name="Minimal"></Build></PathOfBuilding>',
    );
    expect(result.status).toBe("partial");
    expect(result.manifest?.source.importState).toBe("partial");
    expect(result.manifest?.confidence).toBe("low");
    expect(result.message).toContain("summary is partial");
  });

  it("rejects unknown URLs and malformed inputs", async () => {
    const url = await normalizeBuildInput("https://example.com/build");
    const text = await normalizeBuildInput("not a build");

    expect(url.status).toBe("unsupported");
    expect(text.status).toBe("unsupported");
  });

  it("rejects oversized pasted inputs before decoding", async () => {
    const result = await normalizeBuildInput("A".repeat(7_000_001));
    expect(result.status).toBe("unsupported");
    expect(result.message).toContain("larger than the local limit");
  });
});
