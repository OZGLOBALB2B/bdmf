import Link from "next/link";
import { logout } from "@/app/(auth)/actions";

const initials = (s: string) =>
  s.split(/[\s._@]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export function Topbar({
  crumbs = [],
  who,
}: {
  crumbs?: { label: string; href?: string }[];
  who?: string | null;
}) {
  return (
    <div className="topbar">
      <Link href="/" className="brand">BDMF</Link>
      {crumbs.map((c) => (
        <span key={c.label} className="crumb">
          <span className="sep">/</span>
          {c.href ? <Link href={c.href} className="crumb">{c.label}</Link> : c.label}
        </span>
      ))}
      <span className="spread" />
      {who && (
        <>
          <span className="who">{who}</span>
          <span className="avatar">{initials(who)}</span>
          <form action={logout}>
            <button className="btn sm ghost" type="submit">Sign out</button>
          </form>
        </>
      )}
    </div>
  );
}

export type StageKey = "overview" | "direction" | "longlist" | "deepdive" | "plan";
export type StageState = "done" | "now" | "off";

export const STAGES: { n: number; key: Exclude<StageKey, "overview">; label: string; slug: string }[] = [
  { n: 2, key: "direction", label: "Business direction", slug: "direction" },
  { n: 3, key: "longlist", label: "Long list and scoring", slug: "longlist" },
  { n: 4, key: "deepdive", label: "Deep dive", slug: "deepdive" },
  { n: 5, key: "plan", label: "Annual plan", slug: "plan" },
];

export function StageRail({
  projectId,
  active,
  state,
}: {
  projectId: string;
  active: StageKey;
  state: Record<Exclude<StageKey, "overview">, StageState>;
}) {
  return (
    <nav className="rail">
      <div className="rail-h">The process</div>
      {STAGES.map((s) => {
        const st = state[s.key];
        const locked = st === "off";
        const cur = active === s.key;
        const cls = `dot ${st === "done" ? "done" : cur ? "now" : ""}`;
        const inner = (
          <>
            <span className={cls}>{st === "done" ? "✓" : s.n}</span>
            {s.label}
          </>
        );
        return locked ? (
          <span key={s.key} className="rail-i" aria-disabled="true" title={`Opens when stage ${s.n - 1} is done`}>
            {inner}
          </span>
        ) : (
          <Link
            key={s.key}
            className="rail-i"
            href={`/p/${projectId}/${s.slug}`}
            aria-current={cur ? "true" : undefined}
          >
            {inner}
          </Link>
        );
      })}
      <div style={{ height: 14 }} />
      <Link className="rail-i" href={`/p/${projectId}`} aria-current={active === "overview" ? "true" : undefined}>
        <span className="dot">↩</span>Project overview
      </Link>
    </nav>
  );
}

export function AdminShell({
  projectId,
  projectName,
  active,
  state,
  who,
  children,
}: {
  projectId: string;
  projectName: string;
  active: StageKey;
  state: Record<Exclude<StageKey, "overview">, StageState>;
  who: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Topbar crumbs={[{ label: projectName, href: `/p/${projectId}` }]} who={who} />
      <div className="shell">
        <StageRail projectId={projectId} active={active} state={state} />
        <main className="main">
          <div className="wrap">{children}</div>
        </main>
      </div>
    </>
  );
}

export function PageHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="head">
      <div>
        <h1 className="title">{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      <span className="spread" />
      {actions}
    </div>
  );
}
