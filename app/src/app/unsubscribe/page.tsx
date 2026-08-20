import { UnsubscribeForm } from "@/components/UnsubscribeForm";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "96px 24px", textAlign: "center" }}>
      <p style={{ color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
        Email preferences
      </p>
      <UnsubscribeForm token={token} />
    </main>
  );
}
