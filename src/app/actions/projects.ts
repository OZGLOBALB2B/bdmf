"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  directionItems,
  assignments,
  longListItems,
  longListVersions,
  auditEvents,
} from "@/db/schema";
import { requireAdmin, requireProject } from "@/lib/tenancy";

/** A new project opens with every stage not started, per SET-03. */
export async function createProject(form: FormData) {
  const ctx = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const planYear = Number(form.get("planYear")) || new Date().getFullYear() + 1;
  if (!name) return;

  const id = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(projects)
      .values({ workspaceId: ctx.workspaceId, name, planYear, ownerId: ctx.user.id })
      .returning({ id: projects.id });

    // Seed the empty slots the brief asks for: 3 objectives, 5 initiatives.
    await tx.insert(directionItems).values([
      ...Array.from({ length: 3 }, (_, i) => ({
        projectId: p.id,
        kind: "objective" as const,
        position: i,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        projectId: p.id,
        kind: "initiative" as const,
        position: i,
      })),
    ]);

    await tx.insert(auditEvents).values({
      workspaceId: ctx.workspaceId,
      projectId: p.id,
      actorId: ctx.user.id,
      action: "project.created",
      detail: { name, planYear },
    });
    return p.id;
  });

  redirect(`/p/${id}`);
}

export async function archiveProject(formData: FormData) {
  const id = String(formData.get("projectId"));
  const ctx = await requireProject(id);
  await db.update(projects).set({ status: "archived" }).where(eq(projects.id, id));
  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId: id,
    actorId: ctx.user.id,
    action: "project.archived",
  });
  revalidatePath("/");
}

export async function reopenProject(formData: FormData) {
  const id = String(formData.get("projectId"));
  const ctx = await requireProject(id);
  await db.update(projects).set({ status: "active" }).where(eq(projects.id, id));
  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId: id,
    actorId: ctx.user.id,
    action: "project.reopened",
  });
  revalidatePath("/");
}

/**
 * What a delete would destroy. Shown before the admin confirms, because a
 * project holds other people's submitted work, not just the admin's own.
 */
export async function deletionImpact(projectId: string) {
  const ctx = await requireProject(projectId);

  const [tasks] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${assignments.status} <> 'draft' and ${assignments.status} <> 'revoked')`,
      submitted: sql<number>`count(*) filter (where ${assignments.status} = 'submitted')`,
      people: sql<number>`count(distinct ${assignments.userId})`,
    })
    .from(assignments)
    .where(eq(assignments.projectId, projectId));

  const [{ items }] = await db
    .select({ items: sql<number>`count(*)` })
    .from(longListItems)
    .innerJoin(longListVersions, eq(longListVersions.id, longListItems.versionId))
    .where(eq(longListVersions.projectId, projectId));

  return {
    name: ctx.project.name,
    longListItems: Number(items),
    invited: Number(tasks?.people ?? 0),
    tasksSent: Number(tasks?.sent ?? 0),
    submitted: Number(tasks?.submitted ?? 0),
  };
}

/**
 * Permanent deletion. Everything below the project goes with it by cascade:
 * the business direction, every long-list version, all scores, every
 * questionnaire response and its AI summary, and the shortlist.
 *
 * The confirmation typed by the admin must match the project name, checked
 * again here — a client-side check is a convenience, not a control.
 */
export async function deleteProject(
  projectId: string,
  confirmation: string,
): Promise<{ error?: string }> {
  const ctx = await requireProject(projectId);

  if (confirmation.trim() !== ctx.project.name.trim()) {
    return { error: "That does not match the project name." };
  }

  const impact = await deletionImpact(projectId);

  // Written BEFORE the delete and with projectId left null: audit_events
  // cascades on project deletion, so a row pointing at this project would be
  // erased by the very action it records.
  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId: null,
    actorId: ctx.user.id,
    action: "project.deleted",
    detail: {
      projectId,
      name: ctx.project.name,
      planYear: ctx.project.planYear,
      destroyed: impact,
      deletedAt: new Date().toISOString(),
    },
  });

  await db.delete(projects).where(eq(projects.id, projectId));

  revalidatePath("/");
  return {};
}

/** Rename, or correct the plan year. Both are safe to change at any stage. */
export async function renameProject(
  projectId: string,
  name: string,
  planYear: number,
): Promise<{ error?: string }> {
  const ctx = await requireProject(projectId);

  const trimmed = name.trim();
  if (!trimmed) return { error: "A project needs a name." };
  if (trimmed.length > 120) return { error: "That name is too long." };
  if (!Number.isInteger(planYear) || planYear < 2000 || planYear > 2100) {
    return { error: "Give a plan year between 2000 and 2100." };
  }

  await db
    .update(projects)
    .set({ name: trimmed, planYear, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId,
    actorId: ctx.user.id,
    action: "project.renamed",
    detail: {
      from: { name: ctx.project.name, planYear: ctx.project.planYear },
      to: { name: trimmed, planYear },
    },
  });

  revalidatePath("/", "layout");
  return {};
}
