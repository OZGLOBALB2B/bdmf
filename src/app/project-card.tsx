"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  renameProject,
  deleteProject,
  deletionImpact,
  archiveProject,
  reopenProject,
} from "./actions/projects";

export type ProjectSummary = {
  id: string;
  name: string;
  planYear: number;
  archived: boolean;
  stage: { text: string; cls: string };
  sent: number;
  in: number;
};

type Impact = Awaited<ReturnType<typeof deletionImpact>>;

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<null | "rename" | "delete">(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  return (
    <div className="card pad" style={{ position: "relative", opacity: project.archived ? 0.72 : 1 }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Link
          href={`/p/${project.id}`}
          style={{ textDecoration: "none", flex: 1, minWidth: 0 }}
        >
          <div className="name" style={{ fontSize: 15 }}>{project.name}</div>
          <div className="desc">Plan year {project.planYear}</div>
        </Link>

        <div ref={wrap} style={{ position: "relative", flex: "none" }}>
          <button
            className="btn sm ghost"
            aria-label={`Actions for ${project.name}`}
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            style={{ padding: "4px 9px", lineHeight: 1 }}
          >
            ⋯
          </button>
          {menu && (
            <div
              className="card"
              style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, minWidth: 190, zIndex: 40, padding: 4 }}
            >
              <Link className="rail-i" href={`/p/${project.id}`} style={{ fontSize: 13 }}>Open</Link>
              <button
                className="rail-i"
                style={{ fontSize: 13 }}
                onClick={() => { setMenu(false); setDialog("rename"); }}
              >
                Rename…
              </button>
              <form action={project.archived ? reopenProject : archiveProject}>
                <input type="hidden" name="projectId" value={project.id} />
                <button className="rail-i" style={{ fontSize: 13 }} type="submit">
                  {project.archived ? "Move out of archive" : "Archive"}
                </button>
              </form>
              <div style={{ borderTop: "1px solid var(--hair)", margin: "4px 0" }} />
              <button
                className="rail-i"
                style={{ fontSize: 13, color: "var(--danger)" }}
                onClick={() => { setMenu(false); setDialog("delete"); }}
              >
                Delete permanently…
              </button>
            </div>
          )}
        </div>
      </div>

      <Link href={`/p/${project.id}`} style={{ textDecoration: "none", display: "block" }}>
        <div style={{ marginTop: 14 }} className={`tag ${project.archived ? "" : project.stage.cls}`}>
          {project.archived ? "Archived" : project.stage.text}
        </div>
        {project.sent > 0 && (
          <div className="lab" style={{ marginTop: 10 }}>
            {project.sent} {project.sent === 1 ? "task" : "tasks"} sent · {project.in} back
          </div>
        )}
      </Link>

      {dialog === "rename" && (
        <RenameDialog project={project} onClose={() => setDialog(null)} />
      )}
      {dialog === "delete" && (
        <DeleteDialog project={project} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function RenameDialog({ project, onClose }: { project: ProjectSummary; onClose: () => void }) {
  const [name, setName] = useState(project.name);
  const [year, setYear] = useState(String(project.planYear));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const res = await renameProject(project.id, name, Number(year));
      if (res.error) setError(res.error);
      else onClose();
    });

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 className="title" style={{ fontSize: 20 }}>Rename project</h2>
        <p className="sub">
          The name appears on every invitation email, so people who have already been
          invited will see the new one.
        </p>
        <div className="stack" style={{ marginTop: 18 }}>
          {error && <div className="err">{error}</div>}
          <div>
            <label className="lab" htmlFor="rn-name">Project name</label>
            <input
              id="rn-name"
              type="text"
              value={name}
              autoFocus
              onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </div>
          <div>
            <label className="lab" htmlFor="rn-year">Plan year</label>
            <input
              id="rn-year"
              type="number"
              value={year}
              min={2000}
              max={2100}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn pri" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({ project, onClose }: { project: ProjectSummary; onClose: () => void }) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void deletionImpact(project.id).then(setImpact);
  }, [project.id]);

  const matches = typed.trim() === project.name.trim();

  const remove = () =>
    startTransition(async () => {
      const res = await deleteProject(project.id, typed);
      if (res.error) setError(res.error);
      else onClose();
    });

  const losses = impact
    ? [
        impact.longListItems && `${impact.longListItems} long-list initiatives`,
        impact.submitted && `${impact.submitted} submitted ${impact.submitted === 1 ? "response" : "responses"}`,
        impact.tasksSent && `${impact.tasksSent} sent ${impact.tasksSent === 1 ? "task" : "tasks"}`,
        impact.invited && `${impact.invited} ${impact.invited === 1 ? "person's" : "people's"} invitations`,
      ].filter(Boolean)
    : [];

  return (
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 className="title" style={{ fontSize: 20 }}>Delete “{project.name}”?</h2>
        <p className="sub">This cannot be undone. Archiving hides a project without destroying it.</p>

        {impact === null ? (
          <p className="lab" style={{ marginTop: 16 }}>Checking what this holds…</p>
        ) : losses.length ? (
          <div className="note warn" style={{ marginTop: 16 }}>
            Deleting this destroys {losses.join(", ")}. Work other people submitted goes
            with it, and they are not told.
          </div>
        ) : (
          <div className="note" style={{ marginTop: 16 }}>
            This project is empty — nothing has been written or submitted in it yet.
          </div>
        )}

        {error && <div className="err" style={{ marginTop: 14 }}>{error}</div>}

        <div style={{ marginTop: 16 }}>
          <label className="lab" htmlFor="del-confirm">
            Type <strong style={{ color: "var(--ink)" }}>{project.name}</strong> to confirm
          </label>
          <input
            id="del-confirm"
            type="text"
            value={typed}
            autoFocus
            autoComplete="off"
            onChange={(e) => { setTyped(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && matches && remove()}
          />
        </div>

        <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Keep it</button>
          <button
            className="btn pri"
            disabled={!matches || pending || impact === null}
            style={matches ? { background: "var(--danger)", borderColor: "var(--danger)" } : undefined}
            onClick={remove}
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
