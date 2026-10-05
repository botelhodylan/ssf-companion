import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Download, ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import { parseAtlasTreeDataset, parseAtlasTreeImport, serializeAtlasTreeSnapshot, type AtlasTreeDataset, type AtlasTreeImport, type SavedAtlasTree } from "../core/atlas-tree-import";

interface LeagueOption {
  readonly id: string;
  readonly name: string;
}

interface AtlasTreesPageProps {
  readonly league?: LeagueOption;
  readonly trees: readonly SavedAtlasTree[];
  readonly dataset?: AtlasTreeDataset | null;
  readonly onImport: (tree: AtlasTreeImport, name: string) => void;
  readonly onLoadDataset: (dataset: AtlasTreeDataset) => void;
  readonly onRemove: (treeId: string) => void;
  readonly onOpenShare: (url: string) => void;
}

export function AtlasTreesPage({ league, trees, dataset, onImport, onLoadDataset, onRemove, onOpenShare }: AtlasTreesPageProps) {
  const [nameInput, setNameInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataFileInputRef = useRef<HTMLInputElement>(null);

  function importText(content: string, sourceName?: string) {
    if (!league) {
      setMessage({ kind: "error", text: "Choose or create a league before importing an Atlas tree. Atlas trees are saved with league context." });
      return;
    }
    try {
      const imported = parseAtlasTreeImport(content);
      const fileBaseName = sourceName?.replace(/\.[^.]+$/, "").trim();
      const name = nameInput.trim() || imported.name || fileBaseName || `Atlas tree · ${imported.nodeSkillHashes.length} nodes`;
      onImport(imported, name.slice(0, 100));
      setMessage({ kind: "success", text: `Saved ${name} to ${league.name} · ${imported.nodeSkillHashes.length} allocated node hashes imported.` });
      setUrlInput("");
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "The Atlas tree could not be imported." });
    }
  }

  async function openLocalFile() {
    if (!league) {
      setMessage({ kind: "error", text: "Choose or create a league before importing an Atlas tree." });
      return;
    }
    if (window.ssfDesktop) {
      try {
        const file = await window.ssfDesktop.openAtlasTreeFile();
        if (file) importText(file.content, file.name);
      } catch (error) {
        setMessage({ kind: "error", text: error instanceof Error ? error.message : "The local Atlas tree file could not be opened." });
      }
      return;
    }
    fileInputRef.current?.click();
  }

  async function browserFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 12_000_000) {
      setMessage({ kind: "error", text: "That Atlas tree file is too large to import safely." });
      event.target.value = "";
      return;
    }
    importText(await file.text(), file.name);
    event.target.value = "";
  }

  async function openAtlasDataFile() {
    if (window.ssfDesktop) {
      try {
        const file = await window.ssfDesktop.openAtlasTreeFile();
        if (file) loadAtlasDataset(file.content, file.name);
      } catch (error) {
        setMessage({ kind: "error", text: error instanceof Error ? error.message : "The Atlas data file could not be opened." });
      }
      return;
    }
    dataFileInputRef.current?.click();
  }

  async function browserDataFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 12_000_000) {
      setMessage({ kind: "error", text: "That GGG Atlas export is too large to import safely." });
      event.target.value = "";
      return;
    }
    loadAtlasDataset(await file.text(), file.name);
    event.target.value = "";
  }

  function loadAtlasDataset(content: string, fileName: string) {
    try {
      const imported = parseAtlasTreeDataset(content, fileName);
      onLoadDataset(imported);
      setMessage({ kind: "success", text: `Loaded ${Object.keys(imported.nodes).length} node labels from ${imported.sourceFile}. This file does not identify its PoE patch.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "The GGG Atlas data export could not be imported." });
    }
  }

  function importOnShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") importText(urlInput);
  }

  async function exportLocalCopy(tree: SavedAtlasTree) {
    const content = serializeAtlasTreeSnapshot({
      name: tree.name,
      shareUrl: tree.sourceUrl,
      ruleset: tree.ruleset,
      encodingVersion: tree.encodingVersion,
      nodeSkillHashes: tree.nodeSkillHashes,
    });
    const fileName = `ssf-atlas-${toSafeSlug(tree.name)}.json`;
    if (window.ssfDesktop) {
      try {
        const result = await window.ssfDesktop.saveExport(fileName.replace(/\.json$/, ""), content, "json");
        if (result.saved) setMessage({ kind: "success", text: `Saved a local snapshot of ${tree.name}.` });
      } catch (error) {
        setMessage({ kind: "error", text: error instanceof Error ? error.message : "The local snapshot could not be saved." });
      }
      return;
    }
    const blob = new Blob([content], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
    setMessage({ kind: "success", text: `Downloaded a local snapshot of ${tree.name}.` });
  }

  return (
    <div className="atlas-tree-workspace">
      <section className="atlas-tree-import settings-section">
        <div>
          <span className="section-kicker">IMPORT A POE 1 ATLAS TREE</span>
          <h2>Save a share setup to this league</h2>
          <p>Paste a public GGG Atlas Skill Tree URL, choose a text file containing that URL, or re-import an SSF Companion JSON snapshot. The URL itself contains the allocated node hashes, so the app does not fetch another site.</p>
        </div>
        <label className="settings-input-label" htmlFor="atlas-tree-name">Name this setup</label>
        <input id="atlas-tree-name" value={nameInput} onChange={(event) => setNameInput(event.target.value)} placeholder="Harvest and Expedition" maxLength={100} />
        <label className="settings-input-label" htmlFor="atlas-tree-url">Atlas Skill Tree share URL</label>
        <textarea
          id="atlas-tree-url"
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          onKeyDown={importOnShortcut}
          placeholder="https://www.pathofexile.com/atlas-skill-tree/..."
          rows={3}
          disabled={!league}
        />
        <div className="atlas-tree-import-actions">
          <button className="button button-primary" type="button" disabled={!league || !urlInput.trim()} onClick={() => importText(urlInput)}>Import share URL</button>
          <button className="button button-outline" type="button" disabled={!league} onClick={() => void openLocalFile()}><FolderOpen size={14} /> Import local file</button>
          <input ref={fileInputRef} className="sr-only" type="file" accept=".txt,.json,.atlas,text/plain,application/json" onChange={(event) => void browserFileChosen(event)} />
          <button className="button button-outline" type="button" onClick={() => void openAtlasDataFile()}><FolderOpen size={14} /> Load local GGG Atlas data</button>
          <input ref={dataFileInputRef} className="sr-only" type="file" accept=".json,application/json" onChange={(event) => void browserDataFileChosen(event)} />
          <span className="keyboard-hint">Ctrl + Enter to import</span>
        </div>
        {!league && <div className="atlas-tree-no-league" role="status">Select a league above before importing. Atlas trees belong to league context.</div>}
        {message && <div className={`import-message message-${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</div>}
      </section>

      <section className={`atlas-tree-data-status ${dataset ? "is-loaded" : "is-empty"}`} aria-label="Local Atlas tree labels">
        <div>
          <strong>{dataset ? "Local Atlas node data loaded" : "Optional: load GGG Atlas node data"}</strong>
          <span>{dataset ? `${Object.keys(dataset.nodes).length} node facts · ${dataset.sourceFile} · imported ${formatDate(dataset.importedAt)}` : "Choose the data.json file from GGG's public atlastree-export repository to see local node names and stats beside imported hashes."}</span>
          <p>GGG's export has no patch version. Names are reference labels from that file; patch matching and farm recommendations remain unverified.</p>
        </div>
        {!dataset && <a className="text-link" href="https://github.com/grindinggear/atlastree-export" onClick={(event) => { event.preventDefault(); onOpenShare("https://github.com/grindinggear/atlastree-export"); }}>Open GGG Atlas export <ExternalLink size={13} /></a>}
      </section>

      <section className="atlas-tree-saved-section" aria-label="Saved Atlas tree setups">
        <div className="builds-page-toolbar">
          <div>
            <strong>Saved Atlas trees</strong>
            <span>{league ? `League · ${league.name}` : "Choose a league to view its saved Atlas setups."}</span>
          </div>
          <span>{trees.length} saved</span>
        </div>
        {trees.length ? (
          <div className="atlas-tree-list">
            {[...trees].sort((left, right) => right.importedAt.localeCompare(left.importedAt)).map((tree) => (
              <article className="atlas-tree-card" key={tree.id}>
                <div className="atlas-tree-card-heading">
                  <div className="atlas-tree-card-copy">
                    <strong>{tree.name}</strong>
                    <span>{tree.ruleset === "ruthless" ? "Ruthless" : "Standard"} · {tree.nodeSkillHashes.length} allocated node hashes · GGG URL wire format v{tree.encodingVersion}</span>
                    <small>Imported {formatDate(tree.importedAt)}</small>
                  </div>
                  <div className="atlas-tree-card-actions">
                    <button className="text-link" type="button" onClick={() => onOpenShare(tree.sourceUrl)}><ExternalLink size={13} /> Open share</button>
                    <button className="text-link" type="button" onClick={() => void exportLocalCopy(tree)}><Download size={13} /> Save JSON</button>
                    <button className="text-link atlas-tree-remove" type="button" onClick={() => onRemove(tree.id)}><Trash2 size={13} /> Remove</button>
                  </div>
                </div>
                {dataset ? (
                  <details className="atlas-tree-hash-details">
                    <summary>View node labels ({tree.nodeSkillHashes.filter((hash) => dataset.nodes[String(hash)]).length}/{tree.nodeSkillHashes.length} matched)</summary>
                    <ul>{tree.nodeSkillHashes.map((hash) => {
                      const node = dataset.nodes[String(hash)];
                      return (
                        <li key={hash}>
                          <span><strong>{node?.name ?? "Unmatched node hash"}</strong><code>#{hash}{node?.kind ? ` · ${node.kind}` : ""}</code></span>
                          {node?.stats.length ? <small>{node.stats.join(" · ")}</small> : null}
                        </li>
                      );
                    })}</ul>
                  </details>
                ) : (
                  <details className="atlas-tree-hash-details">
                    <summary>View imported node hashes</summary>
                    <code>{tree.nodeSkillHashes.join(", ") || "No allocated nodes in this setup"}</code>
                  </details>
                )}
                <a className="atlas-tree-source" href={tree.sourceUrl} onClick={(event) => { event.preventDefault(); onOpenShare(tree.sourceUrl); }}>{tree.sourceUrl}</a>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-builds atlas-tree-empty">
            <h2>{league ? "No Atlas setups saved for this league" : "Choose a league first"}</h2>
            <p>{league ? "Import a GGG Atlas tree link to keep a local, league-scoped copy. You can also export it as JSON for offline use." : "Choose or create a league above. Saved Atlas setups stay with that league and are shared across its characters."}</p>
          </div>
        )}
        <p className="atlas-tree-limit-note">This slice records the exact allocated hashes from the share link. Node names, farming value, tree ordering, and patch matching need a matching reviewed Atlas data pack before the planner can make recommendations.</p>
      </section>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown date" : date.toLocaleDateString();
}

function toSafeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "tree";
}
