import { BookmarkPlus, Check, ChevronRight } from "lucide-react";
import type { ItemCandidate, ItemRelevance } from "../core/types";

export interface PriorityRow {
  candidate: ItemCandidate;
  relevance: ItemRelevance;
  kindLabel: string;
}

interface PriorityTableProps {
  rows: readonly PriorityRow[];
  selectedItemId?: string;
  onSelect: (row: PriorityRow) => void;
  onPinGoal: (row: PriorityRow) => void;
  pinnedIds: ReadonlySet<string>;
}

const recommendationLabel = {
  keep: "KEEP VISIBLE",
  consider: "CONSIDER",
  low_priority: "LOWER PRIORITY",
} as const;

export function PriorityTable({ rows, selectedItemId, onSelect, onPinGoal, pinnedIds }: PriorityTableProps) {
  if (!rows.length) {
    return (
      <div className="empty-priorities">
        <div className="empty-mark"><BookmarkPlus size={20} /></div>
        <h3>No item priorities yet</h3>
        <p>Import a PoB build to create targets, then add SSF goals as you plan your next upgrade.</p>
      </div>
    );
  }

  return (
    <div className="priority-table-wrap">
      <table className="priority-table">
        <thead>
          <tr>
            <th scope="col">DROP / TARGET</th>
            <th scope="col">DECISION</th>
            <th scope="col">WHY</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { relevance } = row;
            const selected = selectedItemId === relevance.itemId;
            const pinned = pinnedIds.has(relevance.itemId);
            const why = relevance.reasons.find((reason) => reason.code === "build_goal")?.text
              ?? "No direct build match. Review before changing your filter.";
            return (
              <tr
                key={relevance.itemId}
                className={selected ? "priority-row is-selected" : "priority-row"}
                onClick={() => onSelect(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(row);
                  }
                }}
                tabIndex={0}
                aria-selected={selected}
              >
                <td>
                  <div className="item-cell">
                    <span className="item-name">{row.candidate.name}</span>
                    <span className="item-kind">{row.kindLabel}</span>
                  </div>
                </td>
                <td>
                  <span className={`decision decision-${relevance.recommendation}`}>
                    {relevance.recommendation === "keep" && <Check size={13} strokeWidth={2.5} />}
                    {recommendationLabel[relevance.recommendation]}
                    <span className="decision-score">{relevance.score}</span>
                  </span>
                </td>
                <td><span className="why-cell">{why}</span></td>
                <td className="row-action-cell">
                  <button
                    type="button"
                    className={pinned ? "row-goal-button is-pinned" : "row-goal-button"}
                    onClick={(event) => { event.stopPropagation(); onPinGoal(row); }}
                    aria-label={pinned ? `${row.candidate.name} is already a goal` : `Add ${row.candidate.name} as a goal`}
                    title={pinned ? "Already a goal" : "Add as a goal"}
                  >
                    {pinned ? <Check size={14} /> : <BookmarkPlus size={14} />}
                  </button>
                  <ChevronRight className="row-chevron" size={15} aria-hidden="true" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
