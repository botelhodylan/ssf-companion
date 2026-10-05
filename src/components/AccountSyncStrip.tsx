import { CircleHelp, CloudDownload, ShieldCheck } from "lucide-react";

interface AccountSyncStripProps {
  connected: false;
  onConnect: () => void;
  onUnavailableAction: (action: "character" | "stash" | "all") => void;
}

export function AccountSyncStrip({ onConnect, onUnavailableAction }: AccountSyncStripProps) {
  return (
    <section className="account-sync-strip" aria-label="Optional Path of Exile account sync">
      <div className="account-label">
        <span className="account-icon"><ShieldCheck size={17} /></span>
        <span>PoE account</span>
      </div>
      <button className="button button-outline connect-button" type="button" onClick={onConnect}>
        Connect account
      </button>
      <span className="account-note">Optional · official GGG OAuth</span>
      <div className="sync-actions" aria-label="Sync options">
        <button type="button" disabled title="Available after an official GGG OAuth connection" onClick={() => onUnavailableAction("character")}>
          <CloudDownload size={14} /> Sync Character
        </button>
        <button type="button" disabled title="Available after an official GGG OAuth connection" onClick={() => onUnavailableAction("stash")}>
          <CloudDownload size={14} /> Sync Stash
        </button>
        <button type="button" disabled title="Available after an official GGG OAuth connection" onClick={() => onUnavailableAction("all")}>
          <CloudDownload size={14} /> Sync All
        </button>
      </div>
      <button className="quiet-help" type="button" onClick={onConnect} aria-label="Learn about account sync">
        <CircleHelp size={15} />
      </button>
    </section>
  );
}
