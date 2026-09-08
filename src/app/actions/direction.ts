"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { directionItems, projects, auditEvents, longListItems } from "@/db/schema";
import { requireProject } from "@/lib/tenancy";

type Kind = "objective" | "initiative";

async function assertOwns(projectId: string, itemId: string) {
  const ctx = await requireProject(projectId);
  const [item] = await db
    .select({ id: directionItems.id })
    .from(directionItems)
    .where(and(eq(directionItems.id, itemId), eq(directionItems.projectId, projectId)));
  if (!item) throw new Error("Not found");
  return ctx;
}

export async function saveDirectionItem(
  projectId: string,
  itemId: string,
  patch: { title?: string; body?: string },
) {
  await assertOwns(projectId, itemId);
  await db.update(directionItems).set(patch).where(eq(directionItems.id, itemId));
  await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function addDirectionItem(projectId: string, kind: Kind, parentId?: string) {
  await requireProject(projectId);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${directionItems.position}), -1)` })
    .from(directionItems)
    .where(and(eq(directionItems.projectId, projectId), eq(directionItems.kind, kind)));

  const [row] = await db
    .insert(directionItems)
    .values({ projectId, kind, parentId: parentId ?? null, position: max + 1 })
    .returning();
  revalidatePath(`/p/${projectId}/direction`);
  return row;
}

/**
 * DIR-warn: an item already referenced by a long-list row cannot be removed
 * silently, so the caller is told what depends on it.
 */
export async function directionItemUsage(projectId: string, itemId: string) {
  await assertOwns(projectId, itemId);
  const rows = await db
    .select({ title: longListItems.title })
    .from(longListItems)
    .where(eq(longListItems.directionItemId, itemId));
  return rows.map((r) => r.title).filter(Boolean);
}

export async function deleteDirectionItem(projectId: string, itemId: string) {
  const ctx = await assertOwns(projectId, itemId);
  await db.delete(directionItems).where(eq(directionItems.parentId, itemId));
  await db.delete(directionItems).where(eq(directionItems.id, itemId));
  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId,
    actorId: ctx.user.id,
    action: "direction.item_deleted",
    detail: { itemId },
  });
  revalidatePath(`/p/${projectId}/direction`);
}

export async function moveDirectionItem(projectId: string, itemId: string, delta: -1 | 1) {
  await assertOwns(projectId, itemId);
  const [item] = await db.select().from(directionItems).where(eq(directionItems.id, itemId));
  const siblings = await db
    .select()
    .from(directionItems)
    .where(
      and(
        eq(directionItems.projectId, projectId),
        eq(directionItems.kind, item.kind),
        item.parentId
          ? eq(directionItems.parentId, item.parentId)
          : sql`${directionItems.parentId} is null`,
      ),
    )
    .orderBy(directionItems.position);

  const i = siblings.findIndex((s) => s.id === itemId);
  const j = i + delta;
  if (j < 0 || j >= siblings.length) return;

  await db.transaction(async (tx) => {
    await tx.update(directionItems).set({ position: siblings[j].position }).where(eq(directionItems.id, siblings[i].id));
    await tx.update(directionItems).set({ position: siblings[i].position }).where(eq(directionItems.id, siblings[j].id));
  });
  revalidatePath(`/p/${projectId}/direction`);
}

export async function confirmDirection(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const ctx = await requireProject(projectId);

  await db
    .update(projects)
    .set({ directionConfirmedAt: new Date(), directionConfirmedBy: ctx.user.id, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId,
    actorId: ctx.user.id,
    action: "stage2.confirmed",
  });
  revalidatePath(`/p/${projectId}`, "layout");
}

export async function reopenDirection(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const ctx = await requireProject(projectId);
  await db
    .update(projects)
    .set({ directionConfirmedAt: null, directionConfirmedBy: null, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId,
    actorId: ctx.user.id,
    action: "stage2.reopened",
  });
  revalidatePath(`/p/${projectId}`, "layout");
}
