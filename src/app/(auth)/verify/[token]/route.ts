import { NextResponse, type NextRequest } from "next/server";
import { consumeVerification } from "@/lib/verification";
import { currentUser, createSession } from "@/lib/auth";

/**
 * Opening the emailed link.
 *
 * A route handler rather than a page, because confirming signs the person in
 * and only handlers and server actions may write cookies — a Server Component
 * that calls cookies().set() throws at render.
 *
 * Signing in here means confirming from a phone, or from a browser that never
 * held the registration session, still lands in the workspace.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const userId = await consumeVerification(token);

  if (!userId) {
    return NextResponse.redirect(new URL("/verify/expired", request.url));
  }

  const signedIn = await currentUser();
  if (signedIn?.id !== userId) await createSession(userId);

  return NextResponse.redirect(new URL("/", request.url));
}
