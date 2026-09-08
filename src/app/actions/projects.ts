"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, directionItems, auditEvents } from "@/db/schema";
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
