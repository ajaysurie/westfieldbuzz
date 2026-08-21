import Link from "next/link";

export default async function SubscriptionConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const confirmed = status === "confirmed" || status === "already-confirmed";
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "96px 24px", textAlign: "center" }}>
      <p style={{ color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
        Friday&apos;s list
      </p>
      <h1>{confirmed ? "You're on the list." : "That confirmation link isn't valid."}</h1>
      <p style={{ margin: "18px auto 28px", maxWidth: 520 }}>
        {confirmed
          ? "We'll send a fresh, source-checked list of events around Westfield each Friday."
          : "The link may have expired or already been replaced. Submit your email again to get a new one."}
      </p>
      <Link href={confirmed ? "/events" : "/"} className="btn btn-primary">
        {confirmed ? "Explore the calendar" : "Return home"}
      </Link>
    </main>
  );
}
