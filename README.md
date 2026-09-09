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

## Published documentation

The system map and decision log are published as a static site from a separate
**public** repository, so this one stays private:

- Site — https://ozglobalb2b.github.io/bdmf-docs/
- Repo — https://github.com/OZGLOBALB2B/bdmf-docs

The sources live here, in `docs/`. To republish after editing them, rebuild the
standalone pages and push that repo — the published copies are wrapped with
their own `<head>`, which the artifact and PDF versions do not need.

GitHub Pages cannot host the application itself; see below.

## Deploying

GitHub Pages cannot host this app — it serves static files, and BDMF needs a
server for sign-in, tenant isolation, invitation tokens, email and AI
summaries. Vercel is the intended target; the repo can stay private.

1. **Database.** Create a Postgres on [Neon](https://neon.tech) (free tier is
   enough to start). Copy the **pooled** connection string — on Neon the host
   contains `-pooler`. The app opens one connection per serverless invocation,
   which needs a pooled endpoint.
2. **Project.** On [Vercel](https://vercel.com), *Add New → Project*, and import
   `OZGLOBALB2B/bdmf`. Framework and build command are detected automatically.
3. **Environment variables.** Set these on the Vercel project:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the pooled Neon string |
   | `APP_URL` | the deployed URL, e.g. `https://bdmf.vercel.app` — invitation links are built from it |
   | `RESEND_API_KEY` | optional; without it email logs to the console |
   | `MAIL_FROM` | e.g. `BDMF <invites@yourdomain.com>` |
   | `ANTHROPIC_API_KEY` | optional; without it summaries use the built-in summariser |
   | `ANTHROPIC_MODEL` | `claude-opus-5` |

4. **Create the schema.** Once, from your machine, against the new database:

   ```bash
   DATABASE_URL="postgresql://…pooled string…" npm run db:migrate
   ```

   This is deliberately not wired into the build: a deploy should never silently
   alter a production schema.
5. **First account.** Register through the deployed site, then grant yourself
   the OZ back office:

   ```bash
   DATABASE_URL="postgresql://…" npm run oz:grant -- you@ozglobalb2b.com
   ```

Do **not** run `npm run seed` against production — it deletes and recreates the
demo workspace.

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
