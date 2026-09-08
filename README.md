# BDMF — Business-Driven Marketing Focus

A multi-tenant platform that runs the BDMF method: from a company's business
direction, through a scored long list of candidate marketing initiatives, to a
shortlist with deep-dive plans and an annual calendar.

Built for OZ Global B2B. Each client company gets an isolated workspace; an
admin runs projects inside it and invites contributors who see only the one
task assigned to them.

## The five stages

| # | Stage | Who | What happens |
|---|-------|-----|--------------|
| 1 | Access and people | Admin | Account, workspace, project, participants |
| 2 | Business direction | Admin + CEO | 2–3 business objectives, 5 strategic initiatives |
| 3 | Long list and scoring | Admin → contributors | Long list built, scored 1–5 on three criteria, consolidated and ranked |
| 4 | Deep dive | Admin → contributors | A ten-question scope and success plan per shortlisted initiative, with an AI summary |
| 5 | Annual plan | Admin | The shortlist across a twelve-month grid |

## Scoring

Three criteria, each 1–5, anchored **Low 1 · Moderate 3 · High 5**:
business impact, strategic differentiation, and feasibility & focus. One
respondent contributes at most 15 points to an initiative.

Ranking uses the **mean** across respondents, with the raw sum shown alongside.
The source deck sums; the two rank identically when everyone submits and
diverge when someone does not — and this product deliberately lets an admin look
at partial results. See `src/lib/scoring.ts`.

## Running it

```bash
brew install postgresql@17 && brew services start postgresql@17
createdb bdmf_dev
cp .env.example .env.local   # then set DATABASE_URL and AUTH_SECRET
npm install
npx drizzle-kit push
npm run dev
```

With `RESEND_API_KEY` unset, every email is printed to the server console and
recorded in `mail_log` — all invitation and reminder flows stay testable without
sending anything. With `ANTHROPIC_API_KEY` unset, Stage 4 summaries fall back to
a deterministic summariser rather than failing.

## Layout

```
src/db/schema.ts        the whole data model, with the tenancy rule at the top
src/lib/scoring.ts      consolidation and ranking maths
src/lib/questionnaire.ts the ten Stage 4 questions
src/lib/tenancy.ts      requireAdmin / requireProject — every admin page goes through these
src/lib/mail/           adapter + templates (Resend or console)
src/lib/ai/summarize.ts Stage 4 summaries (Anthropic or deterministic fallback)
```

## Decisions taken, and where they came from

Documented in `DECISIONS.md`. Several are assumptions that OZ still needs to
confirm; each one says so.
