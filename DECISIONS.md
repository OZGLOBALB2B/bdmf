# Decisions taken, and where they came from

Every decision below was needed to build something that runs. Items marked
**ASSUMPTION** are ones OZ still needs to confirm; each says what would change
if the answer is different.

## Resolved from the source material

**Scoring is three criteria, not one score.** The brief says "a score from 1 to
5 for every item", which reads as one number per initiative. The scoring matrix
on slides 8 and 23 of the Spectrum deck — a linked spreadsheet embedded as an
image, so invisible to text search — has columns *Initiative | Business Impact |
Strategic Differentiation | Feasibility & Focus | Total Score | Owner*, with the
legend *Low 1 · Moderate 3 · High 5*. So it is 1–5 **per criterion**: three
scores per initiative, 15 points per respondent, 39 scores per person on a
13-item list. The criteria themselves are defined on slide 7.

**The "ten-question questionnaire" is the Scope & Success Plan.** Slide 9 of the
deck is a placeholder reading "insert 10 questions". The Word form has eleven
field groups; it becomes exactly ten questions here because the initiative title
is inherited from the shortlist rather than retyped. See `src/lib/questionnaire.ts`.

**The calendar is slides 10/27.** Months across; a Goal band, the initiative
rows, then KPIs, Special days and Special events. Only the names are filled in.

## Decisions where the sources disagreed

**Ranking uses the mean, not the sum.** The deck's combined matrix sums across
respondents; the written PRS proposes the arithmetic mean. They rank identically
when everyone submits, and diverge as soon as someone does not — and this product
deliberately lets an admin look at the ranking while responses are outstanding.
Ranking on the sum would quietly punish an initiative for a respondent's silence.
The product ranks on the mean and **shows the sum alongside**, so the number
reconciles with the deck. Ties share a rank rather than being broken arbitrarily.

**Stage numbering follows the brief, not the PRS.** The brief numbers stages 1–5;
the PRS renumbers to "Setup + Stages 1–4" and then flags its own ambiguity.
The product uses 1–5.

**Contributors get magic links, not accounts.** Stage 1 says everyone registers
with email and password; Stages 3 and 4 describe Figma-style invitations to a
single scoped page. A CEO with one ten-minute scoring task should not be creating
a password. Contributors are passwordless rows reached by a single-purpose,
expiring, hashed token that opens one page and nothing else. If they later sign
in with an account, `/tasks` lists only their own assignments.

## ASSUMPTIONS — confirm before this ships to a client

**The ten questions.** Taken from the Word form. If a canonical list exists,
bump `TEMPLATE_VERSION` and add it; responses record the version they answered,
so old submissions stay readable.

**Full 1–5, not just 1/3/5.** The legend anchors Low/Moderate/High at 1/3/5, but
the scale allows 2 and 4. Restricting to three values would change the
distribution and the ranking.

**Email verification is not enforced.** Registration marks the account verified
immediately. The PRS requires verification before access to client data. This is
the largest known gap and should close before any real client data is entered.

**Reminder rate limit is one per person per day**, and reminders reissue the
link (the original token is only stored hashed and cannot be read back).

**Invitations expire in 30 days** (scoring) and **45 days** (questionnaires).

**Project deletion is permanent and irreversible**, added at OZ's request. The
PRS said archive-only with deletion TBD; the counter-argument was that being
able to start a project without being able to remove one is a one-way door.

Guards: the admin must type the project's exact name, checked again on the
server; the dialog names what will be destroyed before they confirm; and the
deletion is written to the audit log *before* the delete runs, with a null
project reference, because `audit_events` cascades on project deletion and a
row pointing at the project would be erased by the very action it records.

What it does not do: contributors whose submitted work is destroyed are not
notified, and there is no recovery window. If either matters to a client, a
soft-delete with a 30-day restore window is the usual answer.

**OZ staff cannot read client content.** The `/oz` back office shows metadata and
operational status. A support-access path into client strategy content would need
an explicit, audited impersonation flow — deliberately not built.

## Knowingly out of scope for this version

**The deck's "Refine & commit" round.** The method has four steps: set direction,
build the pool, deep-dive, then *management re-scores after reading the position
papers and cuts 6 down to 4–5*. The brief's Stage 5 jumps from deep dive to
calendar. The product bridges this with a checkbox list on the annual plan — the
admin unticks whatever that meeting dropped — but there is no second scoring
round. If OZ wants one, it is a Stage 4.5 and reuses the whole scoring mechanism.

**Calendar export.** The grid renders on screen. PNG/PDF/PPTX is not built.

**Per-client branding.** One generic BDMF interface, OZ colours throughout.
