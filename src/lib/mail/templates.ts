import type { Mail } from "./index";

const APP = () => process.env.APP_URL || "http://localhost:3000";

function shell(heading: string, body: string, cta: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;background:#F6F5FA;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#10024A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #D7D4E3;border-radius:10px">
      <tr><td style="padding:28px 30px">
        <div style="font-size:16px;font-weight:600;color:#10024A;margin-bottom:22px">
          <span style="display:inline-block;width:10px;height:10px;background:#88CC39;border-radius:2px;margin-right:8px"></span>BDMF
        </div>
        <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;line-height:1.25">${heading}</h1>
        <div style="font-size:14px;line-height:1.55;color:#443C63">${body}</div>
        <div style="margin:26px 0 6px">
          <a href="${cta.href}" style="display:inline-block;background:#10024A;color:#fff;text-decoration:none;padding:11px 20px;border-radius:7px;font-size:14px;font-weight:500">${cta.label}</a>
        </div>
        <p style="font-size:12px;color:#736D8C;margin:18px 0 0">This link is for you alone and opens one page only. If you were not expecting it, ignore this email.</p>
      </td></tr>
    </table>
    <p style="font-size:11px;color:#A09AB4;margin:16px 0 0">BDMF — a method and a tool from OZ Global B2B.</p>
  </td></tr></table></body></html>`;
}

const plain = (lines: string[]) => lines.join("\n");

export function scoringInvite(o: {
  to: string;
  projectName: string;
  adminName: string;
  itemCount: number;
  token: string;
  message?: string | null;
  assignmentId: string;
}): Mail {
  const href = `${APP()}/t/${o.token}`;
  const note = o.message
    ? `<p style="margin:0 0 12px;padding:12px 14px;background:#F6F5FA;border-radius:7px;font-style:italic">${escapeHtml(o.message)}</p>`
    : "";
  return {
    to: o.to,
    assignmentId: o.assignmentId,
    template: "scoring_invite",
    subject: `${o.projectName}: score ${o.itemCount} marketing initiatives`,
    html: shell(
      `Which initiatives deserve the year?`,
      `${note}<p style="margin:0 0 12px">${escapeHtml(o.adminName)} has asked you to score ${o.itemCount} candidate marketing initiatives for <strong>${escapeHtml(o.projectName)}</strong>.</p>
       <p style="margin:0 0 12px">You will rate each one on three criteria — business impact, strategic differentiation, and feasibility &amp; focus — from 1 (low) to 5 (high). It takes about ten minutes.</p>
       <p style="margin:0">Only the admin sees your individual scores. Other participants never do.</p>`,
      { label: "Open the scoring page", href },
    ),
    text: plain([
      `${o.adminName} has asked you to score ${o.itemCount} candidate marketing initiatives for ${o.projectName}.`,
      o.message ? `\n"${o.message}"\n` : "",
      `Rate each on business impact, strategic differentiation, and feasibility & focus, from 1 (low) to 5 (high). About ten minutes.`,
      `Only the admin sees your individual scores.`,
      ``,
      href,
    ]),
  };
}

export function questionnaireInvite(o: {
  to: string;
  projectName: string;
  initiativeTitle: string;
  adminName: string;
  token: string;
  message?: string | null;
  assignmentId: string;
}): Mail {
  const href = `${APP()}/t/${o.token}`;
  const note = o.message
    ? `<p style="margin:0 0 12px;padding:12px 14px;background:#F6F5FA;border-radius:7px;font-style:italic">${escapeHtml(o.message)}</p>`
    : "";
  return {
    to: o.to,
    assignmentId: o.assignmentId,
    template: "questionnaire_invite",
    subject: `${o.projectName}: scope and success plan for "${o.initiativeTitle}"`,
    html: shell(
      escapeHtml(o.initiativeTitle),
      `${note}<p style="margin:0 0 12px">This initiative made the shortlist. ${escapeHtml(o.adminName)} has asked you to write its scope and success plan for <strong>${escapeHtml(o.projectName)}</strong>.</p>
       <p style="margin:0">Ten questions: what it is, who owns it, the milestones and go-live date, how success gets measured, what it will take, and what could go wrong. You can save a draft and come back.</p>`,
      { label: "Open the plan", href },
    ),
    text: plain([
      `"${o.initiativeTitle}" made the shortlist for ${o.projectName}.`,
      o.message ? `\n"${o.message}"\n` : "",
      `${o.adminName} has asked you to write its scope and success plan — ten questions. You can save a draft and come back.`,
      ``,
      href,
    ]),
  };
}

export function verifyEmail(o: {
  to: string;
  name: string | null;
  token: string;
}): Mail {
  const href = `${APP()}/verify/${o.token}`;
  return {
    to: o.to,
    template: "verify_email",
    subject: "Confirm your email address for BDMF",
    html: shell(
      "Confirm your email address",
      `<p style="margin:0 0 12px">${o.name ? escapeHtml(o.name) + ", a" : "A"} BDMF workspace was just created with this address.</p>
       <p style="margin:0">Confirm it to open the workspace. The link is good for 24 hours.</p>`,
      { label: "Confirm my email", href },
    ),
    text: plain([
      `${o.name ? o.name + ", a" : "A"} BDMF workspace was just created with this address.`,
      `Confirm it to open the workspace. The link is good for 24 hours.`,
      ``,
      href,
      ``,
      `If this was not you, ignore this email — the workspace stays locked without it.`,
    ]),
  };
}

export function reminder(o: {
  to: string;
  projectName: string;
  what: string;
  token: string;
  assignmentId: string;
}): Mail {
  const href = `${APP()}/t/${o.token}`;
  return {
    to: o.to,
    assignmentId: o.assignmentId,
    template: "reminder",
    subject: `Reminder: ${o.what} — ${o.projectName}`,
    html: shell(
      "Still waiting on you",
      `<p style="margin:0 0 12px">Your response to <strong>${escapeHtml(o.what)}</strong> for ${escapeHtml(o.projectName)} has not come in yet.</p>
       <p style="margin:0">Anything you have already entered has been saved.</p>`,
      { label: "Pick up where you left off", href },
    ),
    text: plain([
      `Your response to ${o.what} for ${o.projectName} has not come in yet.`,
      `Anything you already entered has been saved.`,
      ``,
      href,
    ]),
  };
}

export function submissionReceipt(o: {
  to: string;
  projectName: string;
  what: string;
}): Mail {
  return {
    to: o.to,
    template: "submission_receipt",
    subject: `Received: ${o.what}`,
    html: shell(
      "That is in — thank you",
      `<p style="margin:0">Your response to <strong>${escapeHtml(o.what)}</strong> for ${escapeHtml(o.projectName)} has been recorded. If it needs changing, ask the project admin to reopen it.</p>`,
      { label: "Open BDMF", href: APP() },
    ),
    text: `Your response to ${o.what} for ${o.projectName} has been recorded. If it needs changing, ask the project admin to reopen it.`,
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
