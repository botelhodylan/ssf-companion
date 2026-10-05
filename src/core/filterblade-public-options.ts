export const FILTERBLADE_POE1_CUSTOMIZER_OPTIONS_URL =
  "https://raw.githubusercontent.com/NeverSinkDev/FilterBlade-Public-Assets/main/FbPoe1Configs/CustomizerDefault.options";

const MAX_OPTIONS_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const EXPECTED_HOST = "raw.githubusercontent.com";

export interface FilterBladePublicOptionsFile {
  readonly name: string;
  readonly content: string;
}

/** Fetch the public PoE 1 customizer labels only when the player asks for them. */
export async function fetchPublicFilterBladeOptions(
  fetcher: typeof fetch = fetch,
): Promise<FilterBladePublicOptionsFile> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(FILTERBLADE_POE1_CUSTOMIZER_OPTIONS_URL, {
      headers: { Accept: "text/plain" },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`FilterBlade's public assets returned ${response.status}.`);
    const finalUrl = response.url ? new URL(response.url) : new URL(FILTERBLADE_POE1_CUSTOMIZER_OPTIONS_URL);
    if (finalUrl.protocol !== "https:" || finalUrl.hostname.toLowerCase() !== EXPECTED_HOST) {
      throw new Error("FilterBlade's public file redirected outside raw.githubusercontent.com.");
    }
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/plain")) {
      throw new Error("FilterBlade's public assets did not return a plain-text options file.");
    }

    const content = await readResponseText(response);
    return {
      name: "CustomizerDefault.options (current FilterBlade public asset)",
      content,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("FilterBlade's public labels took too long to load.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseText(response: Response): Promise<string> {
  const declaredBytes = Number(response.headers.get("content-length") ?? 0);
  if (declaredBytes > MAX_OPTIONS_BYTES) throw new Error("FilterBlade's public options file is too large to index safely.");

  const reader = response.body?.getReader();
  if (!reader) {
    const content = await response.text();
    if (new TextEncoder().encode(content).byteLength > MAX_OPTIONS_BYTES) {
      throw new Error("FilterBlade's public options file is too large to index safely.");
    }
    return content;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_OPTIONS_BYTES) {
      await reader.cancel();
      throw new Error("FilterBlade's public options file is too large to index safely.");
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}
