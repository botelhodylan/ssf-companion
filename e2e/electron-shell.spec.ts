import { readFileSync } from "node:fs";
import { _electron as electron } from "playwright";
import { expect, test } from "@playwright/test";

test("launches the desktop shell with its isolated preload bridge", async ({}, testInfo) => {
  const browserErrors: string[] = [];
  const electronApp = await electron.launch({
    args: [process.cwd(), `--user-data-dir=${testInfo.outputPath("isolated-profile")}`],
    env: { ...process.env, VITE_DEV_SERVER_URL: "http://127.0.0.1:4173" },
  });

  try {
    const page = await electronApp.firstWindow();
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });

    await expect(page).toHaveTitle(/SSF Companion/);
    await expect(page.getByRole("heading", { name: "Loot filter workspace" })).toBeVisible();
    const appVersion = await page.evaluate(async () => {
      const desktop = (window as Window & { ssfDesktop?: { getAppVersion: () => Promise<string> } }).ssfDesktop;
      return desktop?.getAppVersion() ?? null;
    });
    const packageVersion = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
    expect(appVersion).toBe(packageVersion);
    expect(browserErrors).toEqual([]);
  } finally {
    await electronApp.close();
  }
});
