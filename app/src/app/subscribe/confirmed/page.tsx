import Link from "next/link";

const expectations = [
  { label: "When", value: "Fridays, morning" },
  { label: "What", value: "5–8 verified events" },
  { label: "Off switch", value: "One click, in every email" },
];

export default async function SubscriptionConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const confirmed = status === "confirmed" || status === "already-confirmed";
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "88px 24px 96px", textAlign: "center" }}>
      {confirmed && (
        <div
          aria-hidden="true"
          style={{
            width: 58,
            height: 58,
            margin: "0 auto 22px",
            borderRadius: "50%",
            background: "#2e7d4f",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
          }}
        >
          ✓
        </div>
      )}
      <p style={{ color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, fontSize: "0.72rem" }}>
        {confirmed ? "Confirmed" : "Friday's list"}
      </p>
      <h1 style={{ fontSize: "2.6rem", lineHeight: 1.05 }}>{confirmed ? "See you Friday." : "That confirmation link isn't valid."}</h1>
      <p style={{ margin: "16px auto 0", maxWidth: 480, color: "var(--ink-light)" }}>
        {confirmed
          ? "You're on the list. Your first email lands Friday morning with the week's verified events."
          : "The link may have expired or already been replaced. Submit your email again to get a new one."}
      </p>
      {confirmed && (
        <div
          style={{
            margin: "34px auto 0",
            maxWidth: 480,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          {expectations.map((item) => (
            <div
              key={item.label}
              style={{
                padding: "14px 10px",
                borderRadius: 10,
                background: "var(--paper-pure)",
                border: "1px solid var(--paper-dark)",
                fontSize: "0.74rem",
                color: "var(--ink-muted)",
              }}
            >
              <strong style={{ display: "block", color: "var(--ink)", fontSize: "0.8rem", marginBottom: 3 }}>
                {item.label}
              </strong>
              {item.value}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 34, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href={confirmed ? "/events" : "/"} className="btn btn-primary">
          {confirmed ? "Browse this week's events" : "Return home"}
        </Link>
        {confirmed && (
          <Link href="/" className="btn btn--ghost">
            Back to homepage
          </Link>
        )}
      </div>
    </main>
  );
}
