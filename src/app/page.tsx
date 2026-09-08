import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { projects, assignments } from "@/db/schema";
import { requireAdmin } from "@/lib/tenancy";
import { Topbar, PageHead } from "@/components/chrome";
import { NewProjectButton } from "./new-project";

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
    active.map(async (p) => {
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
              {active.map((p) => {
                const s = stageLabel(p);
                const c = counts.get(p.id);
                return (
                  <Link key={p.id} href={`/p/${p.id}`} className="card pad" style={{ display: "block", textDecoration: "none" }}>
                    <div className="name" style={{ fontSize: 15 }}>{p.name}</div>
                    <div className="desc">Plan year {p.planYear}</div>
                    <div style={{ marginTop: 14 }} className={`tag ${s.cls}`}>{s.text}</div>
                    {c && c.sent > 0 && (
                      <div className="lab" style={{ marginTop: 10 }}>
                        {c.sent} {c.sent === 1 ? "task" : "tasks"} sent · {c.in} back
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {archived.length > 0 && (
            <>
              <h2 className="lab" style={{ margin: "30px 0 10px" }}>Archived</h2>
              <div className="grid2">
                {archived.map((p) => (
                  <Link key={p.id} href={`/p/${p.id}`} className="card pad" style={{ display: "block", textDecoration: "none", opacity: 0.62 }}>
                    <div className="name" style={{ fontSize: 15 }}>{p.name}</div>
                    <div className="desc">Plan year {p.planYear}</div>
                    <div style={{ marginTop: 14 }} className="tag">Archived</div>
                  </Link>
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
