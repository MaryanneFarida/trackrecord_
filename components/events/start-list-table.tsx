import type { StartListRow } from "@/lib/events/server";
import type { ReactNode } from "react";

/** The start list as a plain table, grouped by class. Readable by a screen reader row by row. */
export function StartListTable({ rows, caption, action }: { rows: StartListRow[]; caption: string; action?: (row: StartListRow) => ReactNode }) {
  if (rows.length === 0) return <p className="text-muted-foreground">Nobody has registered yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b">
            <th scope="col" className="py-2 pr-3">Athlete</th>
            <th scope="col" className="py-2 pr-3">Class</th>
            <th scope="col" className="py-2 pr-3">Races</th>
            {action ? <th scope="col" className="py-2"><span className="sr-only">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.athleteId} className="border-b align-top">
              <th scope="row" className="py-2 pr-3 font-medium">
                {r.fullName}
                {r.guideRunner ? <span className="block text-xs font-normal text-muted-foreground">with guide runner</span> : null}
              </th>
              <td className="py-2 pr-3">{r.sportClass}</td>
              <td className="py-2 pr-3">{r.events.join(", ")}</td>
              {action ? <td className="py-2">{action(r)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
