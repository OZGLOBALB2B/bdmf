"use client";

import { useState } from "react";
import { createProject } from "./actions/projects";

export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  const nextYear = new Date().getFullYear() + 1;

  return (
    <>
      <button className="btn pri" onClick={() => setOpen(true)}>Start a project</button>
      {open && (
        <div className="backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal">
            <h2 className="title" style={{ fontSize: 20 }}>Start a project</h2>
            <p className="sub">
              One run of the process, usually one planning year for one company.
            </p>
            <form action={createProject} className="stack" style={{ marginTop: 18 }}>
              <div>
                <label className="lab" htmlFor="np-name">Project name</label>
                <input id="np-name" name="name" type="text" required autoFocus
                  placeholder={`Marketing focus ${nextYear}`} />
              </div>
              <div>
                <label className="lab" htmlFor="np-year">Plan year</label>
                <input id="np-year" name="planYear" type="number" defaultValue={nextYear}
                  min={2000} max={2100} />
              </div>
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn pri">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
