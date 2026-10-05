import { describe, expect, it, vi } from "vitest";
import {
  fetchPublicFilterBladeOptions,
  FILTERBLADE_POE1_CUSTOMIZER_OPTIONS_URL,
} from "./filterblade-public-options";

function fetchResponse(response: Response): typeof fetch {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

describe("public FilterBlade Customizer options fetch", () => {
  it("loads the current PoE 1 options asset from the fixed public URL", async () => {
    const fetcher = fetchResponse(new Response('QuickUI([0.0, "Test", "currency;test"]);', {
      headers: { "content-type": "text/plain; charset=utf-8" },
    }));

    const file = await fetchPublicFilterBladeOptions(fetcher);

    expect(fetcher).toHaveBeenCalledWith(FILTERBLADE_POE1_CUSTOMIZER_OPTIONS_URL, expect.objectContaining({
      cache: "no-store",
      redirect: "follow",
    }));
    expect(file.name).toContain("CustomizerDefault.options");
    expect(file.content).toContain('"currency;test"');
  });

  it("rejects a response redirected outside the trusted public asset host", async () => {
    const response = new Response("QuickUI();", {
      headers: { "content-type": "text/plain" },
    });
    Object.defineProperty(response, "url", { value: "https://example.com/CustomizerDefault.options" });

    await expect(fetchPublicFilterBladeOptions(fetchResponse(response)))
      .rejects.toThrow("redirected outside raw.githubusercontent.com");
  });

  it("rejects non-text, failed, and oversized responses", async () => {
    await expect(fetchPublicFilterBladeOptions(fetchResponse(new Response("<html />", {
      headers: { "content-type": "text/html" },
    })))).rejects.toThrow("plain-text options file");
    await expect(fetchPublicFilterBladeOptions(fetchResponse(new Response("", { status: 503 }))))
      .rejects.toThrow("returned 503");
    await expect(fetchPublicFilterBladeOptions(fetchResponse(new Response("x".repeat(1_000_001), {
      headers: { "content-type": "text/plain" },
    })))).rejects.toThrow("too large");
  });

  it("turns an aborted request into a short timeout message", async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException("Aborted", "AbortError");
    }) as unknown as typeof fetch;

    await expect(fetchPublicFilterBladeOptions(fetcher)).rejects.toThrow("took too long to load");
  });
});
