import "server-only";
import { redirect, notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, memberships } from "@/db/schema";
import { currentUser, membershipsFor, type CurrentUser } from "./auth";

/**
 * Every admin-surface page and action goes through one of these. The rule is
 * that the workspace is derived from the signed-in user's membership rows and
 * then pushed into the query, so a guessed project id from another tenant
 * returns not-found rather than data.
 */

export type AdminContext = {
  user: CurrentUser;
  workspaceId: string;
  workspaceName: string;
};

/**
 * Requires a signed-in user whose email address has been confirmed.
 *
 * Unconfirmed accounts hold a valid session but reach nothing: every workspace
 * page sends them to /verify. That page uses currentUser() directly rather
 * than this guard, or it would redirect to itself.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.emailVerifiedAt) redirect("/verify");
  return user;
}

/**
 * Requires a signed-in user who administers at least one workspace.
 * Contributors with no admin membership are sent to their task list.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const user = await requireUser();
  const all = await membershipsFor(user.id);
  const admin = all.find((m) => m.role === "admin" && !m.suspended);
  if (!admin) redirect("/tasks");
  return { user, workspaceId: admin.workspaceId, workspaceName: admin.workspaceName };
}

export type ProjectContext = AdminContext & {
  project: typeof projects.$inferSelect;
};

/**
 * Loads a project only if it belongs to a workspace the user administers.
 * A project id from another tenant is indistinguishable from a bad id.
 */
export async function requireProject(projectId: string): Promise<ProjectContext> {
  const ctx = await requireAdmin();

  const [row] = await db
    .select({ project: projects })
    .from(projects)
    .innerJoin(
      memberships,
      and(
        eq(memberships.workspaceId, projects.workspaceId),
        eq(memberships.userId, ctx.user.id),
        eq(memberships.role, "admin"),
      ),
    )
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!row) notFound();
  return { ...ctx, workspaceId: row.project.workspaceId, project: row.project };
}

/** OZ staff only. */
export async function requirePlatformAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) notFound();
  return user;
}
