"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { issueVerification } from "@/lib/verification";

export type ResendState = { message?: string; error?: string };

export async function resendVerification(): Promise<ResendState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.emailVerifiedAt) redirect("/");

  const result = await issueVerification(user.id, user.email, user.name);
  if (result.ok) return { message: `Sent again to ${user.email}.` };

  switch (result.reason) {
    case "cooldown":
      return { error: `Just a moment — try again in ${result.retryInSeconds}s.` };
    case "mail_unconfigured":
      return {
        error:
          "This installation has no mail provider configured, so the link cannot be sent. " +
          "An administrator needs to set RESEND_API_KEY.",
      };
    case "send_failed":
      return { error: `The email could not be sent: ${result.error}` };
  }
}
