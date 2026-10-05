import { Minus, Plus, Sparkles } from "lucide-react";
import type { ItemRelevance } from "../core/types";

interface ExplanationPanelProps {
  relevance?: ItemRelevance;
  sampleMode: boolean;
}

const FACTORS = [
  { code: "build_goal", label: "Current build" },
  { code: "scarcity", label: "Scarcity" },
  { code: "already_owned", label: "League stash" },
  { code: "clutter_cost", label: "Clutter cost" },
] as const;

export function ExplanationPanel({ relevance, sampleMode }: ExplanationPanelProps) {
  if (!relevance) {
    return (
      <aside className="explanation-panel">
        <h2>Why am I seeing this?</h2>
        <p className="panel-intro">Select a priority row to inspect the rule inputs behind it.</p>
      </aside>
    );
  }

  const byCode = new Map<string, typeof relevance.reasons[number]>();
  relevance.reasons.forEach((reason) => {
    const existing = byCode.get(reason.code);
    if (!existing || Math.abs(reason.points) > Math.abs(existing.points)) byCode.set(reason.code, reason);
  });
  return (
    <aside className="explanation-panel">
      <h2>Why am I seeing this?</h2>
      <p className="panel-intro">This priority is based on the selected build and SSF context.</p>
      <div className="inspected-item">
        <span className="inspected-kicker">SELECTED ITEM</span>
        <strong>{relevance.itemName}</strong>
        <span className={`inspected-recommendation decision-${relevance.recommendation}`}>
          {relevance.recommendation.replace("_", " ").toUpperCase()} · {relevance.score}/100
        </span>
      </div>
      <div className="factor-list">
        {FACTORS.map((factor) => {
          const reason = byCode.get(factor.code);
          const positive = reason ? reason.points >= 0 : false;
          const active = reason !== undefined;
          return (
            <div className={active ? "factor-row is-active" : "factor-row"} key={factor.code}>
              <span className={active ? `factor-icon ${positive ? "positive" : "negative"}` : "factor-icon"}>
                {active ? positive ? <Plus size={12} /> : <Minus size={12} /> : <span className="factor-dot" />}
              </span>
              <span className="factor-copy">
                <strong>{factor.label}</strong>
                {reason ? <small>{reason.text}</small> : <small>{factor.code === "build_goal" ? "No direct match in the selected builds." : "No signal in this local profile."}</small>}
              </span>
              <span className={active ? `factor-points ${positive ? "positive" : "negative"}` : "factor-points muted"}>
                {reason ? `${reason.points > 0 ? "+" : ""}${reason.points}` : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="explanation-note">
        <Sparkles size={15} />
        <p>{sampleMode ? "Example build data is shown. Import your own PoB to replace this preview." : "Scores are deterministic. They describe build and goal matches, not a simulation of every possible rare item."}</p>
      </div>
    </aside>
  );
}
