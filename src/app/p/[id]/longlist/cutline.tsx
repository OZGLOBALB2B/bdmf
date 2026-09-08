"use client";

import { useState } from "react";

export function CutLine({
  projectId,
  cutLine,
  max,
  approved,
  outstanding,
  approveAction,
  reopenAction,
}: {
  projectId: string;
  cutLine: number;
  max: number;
  approved: boolean;
  outstanding: number;
  approveAction: (fd: FormData) => Promise<void>;
  reopenAction: (fd: FormData) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  if (approved) {
    return (
      <div className="card pad row" style={{ marginTop: 18 }}>
        <div>
          <div className="name">Shortlist approved</div>
          <div className="desc">
            The top {cutLine} carried into the deep dive. The numbers above were snapshotted at that
            moment, so later submissions do not silently rewrite them.
          </div>
        </div>
        <span className="spread" />
        <form action={reopenAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <button className="btn danger" type="submit">Reopen and re-cut</button>
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="card pad" style={{ marginTop: 18 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div className="name">Where does the line fall?</div>
            <div className="desc">
              Everything above it goes to the deep dive. The method aims for four to six — enough to
              matter, few enough to actually do.
            </div>
            <form action={approveAction} style={{ marginTop: 12 }} id="cutform">
              <input type="hidden" name="projectId" value={projectId} />
              <div className="row">
                <label className="lab" htmlFor="cut">Keep the top</label>
                <input
                  id="cut"
                  name="cutLine"
                  type="number"
                  min={1}
                  max={max}
                  defaultValue={cutLine}
                  style={{ width: 70 }}
                />
                <span className="lab">of {max}</span>
                {(cutLine < 4 || cutLine > 6) && (
                  <span className="tag warn">Outside the recommended four to six</span>
                )}
              </div>
            </form>
          </div>
          <div style={{ textAlign: "right" }}>
            {outstanding > 0 && (
              <div className="tag warn" style={{ marginBottom: 8 }}>
                {outstanding} still to submit
              </div>
            )}
            <div>
              <button className="btn pri" onClick={() => setConfirming(true)}>Approve the shortlist</button>
            </div>
          </div>
        </div>
      </div>

      {confirming && (
        <div className="backdrop" onClick={(e) => e.target === e.currentTarget && setConfirming(false)}>
          <div className="modal">
            <h2 className="title" style={{ fontSize: 20 }}>Approve the top {cutLine}?</h2>
            <p className="sub">
              This freezes the ranking and opens the deep dive, where each surviving initiative
              becomes its own task.
            </p>
            {outstanding > 0 && (
              <div className="note warn" style={{ marginTop: 14 }}>
                {outstanding} invited {outstanding === 1 ? "person has" : "people have"} not scored
                yet. Approving now decides the year on a partial picture — their scores would still
                be recorded, but they will not have counted towards this cut.
              </div>
            )}
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
              <button className="btn" onClick={() => setConfirming(false)}>Not yet</button>
              <button
                className="btn pri"
                onClick={() => {
                  setConfirming(false);
                  (document.getElementById("cutform") as HTMLFormElement).requestSubmit();
                }}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
