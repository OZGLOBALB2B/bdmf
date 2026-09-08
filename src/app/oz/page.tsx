import Link from "next/link";
import { sql, eq, desc, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { workspaces, users, memberships, assignments, mailLog, aiSummaries, auditEvents } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/tenancy";
import { Topbar, PageHead } from "@/components/chrome";
import { setWorkspaceSuspended, deactivateUser, reactivateUser } from "./actions";
import { mailConfigured } from "@/lib/mail";
import { aiConfigured } from "@/lib/ai/summarize";
import { TEMPLATE_VERSION, QUESTIONS } from "@/lib/questionnaire";
import { CRITERIA } from "@/lib/scoring";

export const dynamic = "force-dynamic";

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="card pad" style={{ padding: "14px 16px" }}>
      <div className="lab">{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: warn && value ? "var(--danger)" : "var(--navy)",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const when = (d: Date | null) =>
  d ? d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * OZ's product-level control layer. Metadata and operational status only —
 * client content stays inside the client's workspace. Reading a client's
 * strategy from here would need an explicit, audited support-access flow,
 * which is deliberately not built yet.
 */
export default async function OzAdmin() {
  const admin = await requirePlatformAdmin();

  const wsRows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      descriptor: workspaces.clientDescriptor,
      suspended: workspaces.suspended,
      createdAt: workspaces.createdAt,
      // The outer table is named explicitly: drizzle renders `${workspaces.id}`
      // as a bare "id", which a subquery resolves against its OWN table first
      // and silently counts zero.
      projectCount: sql<number>`(select count(*) from projects p where p.workspace_id = workspaces.id)`,
      memberCount: sql<number>`(select count(*) from memberships m where m.workspace_id = workspaces.id)`,
    })
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt));

  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isPlatformAdmin: users.isPlatformAdmin,
      deactivatedAt: users.deactivatedAt,
      hasPassword: sql<boolean>`${users.passwordHash} is not null`,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(50);

  // Memberships are fetched separately and grouped here rather than as a
  // correlated subquery: drizzle renders `users.id` unqualified inside one,
  // which collides with the joined tables' own id columns.
  const membershipRows = await db
    .select({ userId: memberships.userId, role: memberships.role, workspace: workspaces.name })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId));

  const belongsTo = new Map<string, string[]>();
  for (const m of membershipRows) {
    const list = belongsTo.get(m.userId) ?? [];
    list.push(`${m.workspace} (${m.role})`);
    belongsTo.set(m.userId, list);
  }

  const [failedMail] = await db
    .select({ n: sql<number>`count(*)` })
    .from(mailLog)
    .where(isNotNull(mailLog.error));
  const [failedAi] = await db
    .select({ n: sql<number>`count(*)` })
    .from(aiSummaries)
    .where(isNotNull(aiSummaries.error));
  const [staleTasks] = await db
    .select({ n: sql<number>`count(*)` })
    .from(assignments)
    .where(sql`${assignments.status} in ('sent','opened','in_progress') and ${assignments.sentAt} < now() - interval '14 days'`);

  const recent = await db
    .select({
      action: auditEvents.action,
      createdAt: auditEvents.createdAt,
      workspace: workspaces.name,
      actor: users.email,
    })
    .from(auditEvents)
    .leftJoin(workspaces, eq(workspaces.id, auditEvents.workspaceId))
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(15);

  return (
    <>
      <Topbar crumbs={[{ label: "OZ platform administration" }]} who={admin.email} />
      <main className="main">
        <div className="wrap">
          <PageHead
            title="Platform administration"
            sub="Every client workspace on this installation. Metadata and operational status only — client strategy content stays inside the client's own workspace."
          />

          <div className="grid2" style={{ gridTemplateColumns: "repeat(5,1fr)", marginBottom: 24 }}>
            <Stat label="Client workspaces" value={wsRows.filter((w) => !w.suspended).length} />
            <Stat label="Projects" value={wsRows.reduce((n, w) => n + Number(w.projectCount), 0)} />
            <Stat label="Failed emails" value={Number(failedMail.n)} warn />
            <Stat label="Failed AI summaries" value={Number(failedAi.n)} warn />
            <Stat label="Tasks open over 14 days" value={Number(staleTasks.n)} warn />
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Client workspaces</h2>
          <div className="tbl" style={{ marginBottom: 30 }}>
            <table>
              <thead>
                <tr><th>Workspace</th><th>Projects</th><th>People</th><th>Created</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {wsRows.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <div className="name">{w.name}</div>
                      {w.descriptor && <div className="desc">{w.descriptor}</div>}
                    </td>
                    <td className="num">{Number(w.projectCount)}</td>
                    <td className="num">{Number(w.memberCount)}</td>
                    <td className="lab">{when(w.createdAt)}</td>
                    <td>
                      <span className={`tag ${w.suspended ? "warn" : "ok"}`}>
                        {w.suspended ? "Suspended" : "Active"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <form action={setWorkspaceSuspended}>
                        <input type="hidden" name="workspaceId" value={w.id} />
                        <input type="hidden" name="suspended" value={w.suspended ? "false" : "true"} />
                        <button className={`btn sm ${w.suspended ? "" : "danger"}`}>
                          {w.suspended ? "Reactivate" : "Suspend"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!wsRows.length && <tr><td className="lab">No workspaces yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>People</h2>
          <div className="tbl" style={{ marginBottom: 30 }}>
            <table>
              <thead>
                <tr><th>Person</th><th>Belongs to</th><th>Account</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {userRows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="name">{u.name || u.email}</div>
                      {u.name && <div className="desc">{u.email}</div>}
                    </td>
                    <td className="desc" style={{ maxWidth: 320 }}>
                      {belongsTo.get(u.id)?.join(", ") ?? "—"}
                    </td>
                    <td>
                      <span className="tag">
                        {u.isPlatformAdmin ? "OZ staff" : u.hasPassword ? "Password" : "Link only"}
                      </span>
                    </td>
                    <td>
                      <span className={`tag ${u.deactivatedAt ? "warn" : "ok"}`}>
                        {u.deactivatedAt ? "Deactivated" : "Active"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!u.isPlatformAdmin && (
                        <form action={u.deactivatedAt ? reactivateUser : deactivateUser}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button className={`btn sm ${u.deactivatedAt ? "" : "danger"}`}>
                            {u.deactivatedAt ? "Reactivate" : "Deactivate"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid2">
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Product configuration</h2>
              <div className="card pad">
                <div className="row" style={{ marginBottom: 10 }}>
                  <span className="lab" style={{ width: 150 }}>Scoring criteria</span>
                  <span>{CRITERIA.map((c) => c.short).join(" · ")} — 1 to 5 each</span>
                </div>
                <div className="row" style={{ marginBottom: 10 }}>
                  <span className="lab" style={{ width: 150 }}>Questionnaire</span>
                  <span>{QUESTIONS.length} questions, template version {TEMPLATE_VERSION}</span>
                </div>
                <div className="row" style={{ marginBottom: 10 }}>
                  <span className="lab" style={{ width: 150 }}>Email delivery</span>
                  <span className={`tag ${mailConfigured() ? "ok" : "warn"}`}>
                    {mailConfigured() ? "Resend" : "Console only — no key set"}
                  </span>
                </div>
                <div className="row">
                  <span className="lab" style={{ width: 150 }}>AI summaries</span>
                  <span className={`tag ${aiConfigured() ? "ok" : "warn"}`}>
                    {aiConfigured() ? `Anthropic · ${process.env.ANTHROPIC_MODEL}` : "Fallback summariser — no key set"}
                  </span>
                </div>
                <p className="desc" style={{ marginTop: 14 }}>
                  Criteria, scale labels, the questionnaire and email copy are code-level templates
                  for now. Making them editable here is the next step, and needs versioning so past
                  responses stay readable.
                </p>
              </div>
            </div>

            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Recent activity</h2>
              <div className="card pad">
                {recent.map((e, i) => (
                  <div key={i} className="row" style={{ padding: "5px 0", fontSize: 12.5 }}>
                    <span className="lab" style={{ width: 110 }}>{when(e.createdAt)}</span>
                    <span style={{ flex: 1 }}>{e.action}</span>
                    <span className="desc">{e.workspace ?? "—"}</span>
                  </div>
                ))}
                {!recent.length && <span className="lab">Nothing logged yet.</span>}
              </div>
            </div>
          </div>

          <p className="lab" style={{ marginTop: 28 }}>
            Signed in as OZ staff. <Link href="/" style={{ color: "var(--accent)" }}>Back to your own workspace</Link>
          </p>
        </div>
      </main>
    </>
  );
}
