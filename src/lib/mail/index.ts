import "server-only";
import { Resend } from "resend";
import { db } from "@/db";
import { mailLog } from "@/db/schema";

/**
 * Mail goes through one adapter so the product does not care who delivers it.
 * With no RESEND_API_KEY set, mail is logged to the console and to mail_log —
 * every flow stays exercisable in development without sending anything.
 */

export type Mail = {
  to: string;
  subject: string;
  template: string;
  html: string;
  text: string;
  assignmentId?: string;
};

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function send(mail: Mail): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.info(
      `\n📧 [mail:console] to=${mail.to}\n   subject: ${mail.subject}\n   ${mail.text.replace(/\n/g, "\n   ")}\n`,
    );
    await db.insert(mailLog).values({
      to: mail.to,
      subject: mail.subject,
      template: mail.template,
      assignmentId: mail.assignmentId,
      providerId: "console",
    });
    return { ok: true };
  }

  try {
    const res = await resend.emails.send({
      from: process.env.MAIL_FROM || "BDMF <onboarding@resend.dev>",
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (res.error) throw new Error(res.error.message);
    await db.insert(mailLog).values({
      to: mail.to,
      subject: mail.subject,
      template: mail.template,
      assignmentId: mail.assignmentId,
      providerId: res.data?.id,
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.insert(mailLog).values({
      to: mail.to,
      subject: mail.subject,
      template: mail.template,
      assignmentId: mail.assignmentId,
      error,
    });
    return { ok: false, error };
  }
}

export const mailConfigured = () => Boolean(resend);
