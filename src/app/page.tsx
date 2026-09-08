import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { projects, assignments } from "@/db/schema";
import { requireAdmin } from "@/lib/tenancy";
import { Topbar, PageHead } from "@/components/chrome";
import { NewProjectButton } from "./new-project";
import { ProjectCard, type ProjectSummary } from "./project-card";

export const dynamic = "force-dynamic";

export default async function WorkspaceHome() {
  const ctx = await requireAdmin();

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, ctx.workspaceId))
    .orderBy(desc(projects.updatedAt));

  const active = rows.filter((p) => p.status === "active");
  const archived = rows.filter((p) => p.status === "archived");

  const outstanding = await Promise.all(
    rows.map(async (p) => {
      const all = await db
        .select({ status: assignments.status })
        .from(assignments)
        .where(eq(assignments.projectId, p.id));
      const sent = all.filter((a) => a.status !== "draft" && a.status !== "revoked");
      return {
        id: p.id,
        sent: sent.length,
        in: sent.filter((a) => a.status === "submitted").length,
      };
    }),
  );
  const counts = new Map(outstanding.map((o) => [o.id, o]));

  const stageLabel = (p: (typeof rows)[number]) => {
    if (p.planCompletedAt) return { text: "Complete", cls: "ok" };
    if (p.shortlistApprovedAt) return { text: "Deep dive under way", cls: "on" };
    if (p.directionConfirmedAt) return { text: "Long list and scoring", cls: "on" };
    return { text: "Business direction", cls: "" };
  };

  const summarise = (p: (typeof rows)[number]): ProjectSummary => {
    const c = counts.get(p.id);
    return {
      id: p.id,
      name: p.name,
      planYear: p.planYear,
      archived: p.status === "archived",
      stage: stageLabel(p),
      sent: c?.sent ?? 0,
      in: c?.in ?? 0,
    };
  };

  return (
    <>
      <Topbar who={ctx.user.email} />
      <main className="main">
        <div className="wrap">
          <PageHead
            title="Your projects"
            sub={`${ctx.workspaceName}. Every project is a separate run of the process, with its own people. Nobody outside this workspace can see them.`}
            actions={<NewProjectButton />}
          />

          {active.length === 0 ? (
            <div className="empty">
              <div style={{ fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>
                Nothing here yet
              </div>
              <p style={{ margin: "8px auto 0", maxWidth: "48ch" }}>
                A project is one full run of BDMF — business direction, a scored long list, deep
                dives on what survives, and an annual plan. Start one when you have a management
                meeting to work from.
              </p>
              <div style={{ marginTop: 18 }}>
                <NewProjectButton />
              </div>
            </div>
          ) : (
            <div className="grid2">
              {active.map((p) => (
                <ProjectCard key={p.id} project={summarise(p)} />
              ))}
            </div>
          )}

          {archived.length > 0 && (
            <>
              <h2 className="lab" style={{ margin: "30px 0 10px" }}>Archived</h2>
              <div className="grid2">
                {archived.map((p) => (
                  <ProjectCard key={p.id} project={summarise(p)} />
                ))}
              </div>
            </>
          )}

          <p className="lab" style={{ marginTop: 28 }}>
            BDMF is a method and a tool from OZ Global B2B.
          </p>
        </div>
      </main>
    </>
  );
}
