"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces, users, sessions, auditEvents } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/tenancy";

export async function setWorkspaceSuspended(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const workspaceId = String(formData.get("workspaceId"));
  const suspended = formData.get("suspended") === "true";

  await db.update(workspaces).set({ suspended }).where(eq(workspaces.id, workspaceId));
  await db.insert(auditEvents).values({
    workspaceId,
    actorId: admin.id,
    action: suspended ? "platform.workspace_suspended" : "platform.workspace_reactivated",
  });
  revalidatePath("/oz");
}

/**
 * Deactivating revokes access without erasing the person's submitted work —
 * a business record belongs to the project, not to the account.
 */
export async function deactivateUser(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const userId = String(formData.get("userId"));

  await db.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.insert(auditEvents).values({
    actorId: admin.id,
    action: "platform.user_deactivated",
    detail: { userId },
  });
  revalidatePath("/oz");
}

export async function reactivateUser(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const userId = String(formData.get("userId"));
  await db.update(users).set({ deactivatedAt: null }).where(eq(users.id, userId));
  await db.insert(auditEvents).values({
    actorId: admin.id,
    action: "platform.user_reactivated",
    detail: { userId },
  });
  revalidatePath("/oz");
}
