"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, auditEvents } from "@/db/schema";
import { requireProject } from "@/lib/tenancy";

export async function completePlan(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const ctx = await requireProject(projectId);
  await db
    .update(projects)
    .set({ planCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  await db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    projectId,
    actorId: ctx.user.id,
    action: "stage5.completed",
  });
  revalidatePath(`/p/${projectId}`, "layout");
}

export async function reopenPlan(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  await requireProject(projectId);
  await db.update(projects).set({ planCompletedAt: null }).where(eq(projects.id, projectId));
  revalidatePath(`/p/${projectId}`, "layout");
}
