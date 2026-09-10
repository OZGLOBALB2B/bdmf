import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { mailConfigured } from "@/lib/mail";
import { logout } from "../actions";
import { ResendButton } from "./resend";

export const dynamic = "force-dynamic";

/**
 * The wall an unconfirmed account sees. Uses currentUser() rather than
 * requireUser(), which would redirect here and loop.
 */
export default async function VerifyPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.emailVerifiedAt) redirect("/");

  return (
    <div className="centered">
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div className="brand" style={{ marginBottom: 22 }}>BDMF</div>
        <h1 className="title" style={{ fontSize: 24 }}>Confirm your email</h1>
        <p className="sub">
          We sent a link to <strong>{user.email}</strong>. Open it and your workspace unlocks.
          The link is good for 24 hours.
        </p>

        <div className="card pad" style={{ marginTop: 20 }}>
          {mailConfigured() ? (
            <>
              <p className="desc" style={{ fontSize: 13 }}>
                Nothing in your inbox? Check spam, then send it again.
              </p>
              <div style={{ marginTop: 14 }}>
                <ResendButton />
              </div>
            </>
          ) : (
            <div className="note warn">
              <strong>This installation cannot send email yet.</strong>
              <p style={{ marginTop: 6 }}>
                No mail provider is configured, so the confirmation link has nowhere to go. An
                administrator needs to set <code>RESEND_API_KEY</code> and redeploy — or confirm
                this address from the server with:
              </p>
              <p style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 12 }}>
                npm run verify -- {user.email}
              </p>
            </div>
          )}
        </div>

        <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
          <form action={logout}>
            <button className="btn sm ghost" type="submit">Sign out</button>
          </form>
        </div>
      </div>
    </div>
  );
}
