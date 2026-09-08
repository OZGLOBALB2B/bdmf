import { requireProject } from "@/lib/tenancy";
import { projectFacts } from "@/lib/project";
import { AdminShell, PageHead } from "@/components/chrome";
import { DirectionEditor } from "./editor";
import { confirmDirection, reopenDirection } from "@/app/actions/direction";

export const dynamic = "force-dynamic";

export default async function DirectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireProject(id);
  const p = ctx.project;
  const f = await projectFacts(p);
  const locked = Boolean(p.directionConfirmedAt);

  const named = [...f.direction.objectives, ...f.direction.initiatives].filter((i) => i.title.trim());
  const objectivesNamed = f.direction.objectives.filter((i) => i.title.trim()).length;
  const initiativesNamed = f.direction.initiatives.filter((i) => i.title.trim()).length;
  const canConfirm = objectivesNamed >= 2 && initiativesNamed >= 1;

  return (
    <AdminShell projectId={id} projectName={p.name} active="direction" state={f.states} who={ctx.user.email}>
      <PageHead
        title="Business direction"
        sub="Fill this in with the CEO — it is their answer to what the company is trying to do, written down. You type it; nothing goes anywhere until you confirm the stage."
      />

      {locked && (
        <div className="note" style={{ marginBottom: 18 }}>
          <div className="row">
            <span>
              This stage is confirmed and read-only. Reopening it while the long list is being scored
              means people are scoring against a direction that has since changed.
            </span>
            <span className="spread" />
            <form action={reopenDirection}>
              <input type="hidden" name="projectId" value={id} />
              <button className="btn sm">Reopen</button>
            </form>
          </div>
        </div>
      )}

      <DirectionEditor
        projectId={id}
        objectives={f.direction.objectives}
        initiatives={f.direction.initiatives}
        locked={locked}
      />

      {!locked && (
        <div className="card pad row" style={{ marginTop: 20 }}>
          <div>
            <div className="desc">
              Confirming saves this as the first completed stage and unlocks the long list.
              You can reopen it later.
            </div>
            {!canConfirm && (
              <div className="lab" style={{ marginTop: 4 }}>
                {objectivesNamed < 2
                  ? "Name at least two objectives first."
                  : "Name at least one strategic initiative first."}
              </div>
            )}
          </div>
          <span className="spread" />
          <span className="lab">{named.length} items written</span>
          <form action={confirmDirection}>
            <input type="hidden" name="projectId" value={id} />
            <button className="btn pri" type="submit" disabled={!canConfirm}>Confirm stage 2</button>
          </form>
        </div>
      )}
    </AdminShell>
  );
}
