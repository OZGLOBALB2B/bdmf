import Link from "next/link";

export default function VerifyExpiredPage() {
  return (
    <div className="centered">
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <div className="brand" style={{ marginBottom: 22, justifyContent: "center" }}>BDMF</div>
        <div className="card pad" style={{ padding: 44 }}>
          <h1 className="title" style={{ fontSize: 22 }}>That link does not work</h1>
          <p className="sub" style={{ margin: "10px auto 0", maxWidth: "40ch" }}>
            It may have expired, already been used, or been replaced by a newer one. Sign in and
            we will send a fresh one.
          </p>
          <div style={{ marginTop: 20 }}>
            <Link className="btn pri" href="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
