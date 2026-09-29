import type { Metadata } from "next";
import Link from "next/link";
import { FridaySignup } from "@/components/FridaySignup";
import { FRIDAY_EXPECTATIONS } from "@/lib/friday";

export const metadata: Metadata = {
  title: "Get the Friday list",
  description:
    "A short email every Friday morning with the week's verified events around Westfield and nearby towns. Free, no account needed.",
  alternates: { canonical: "/subscribe" },
};

export default function SubscribePage() {
  return (
    <div className="subscribe-page">
      <div className="home-shell subscribe-page__intro">
        <p className="eyebrow">Friday email</p>
        <h1>Plan your weekend.</h1>
        <p>
          One short email every Friday morning with the week&apos;s verified events in
          Westfield and nearby towns. Free, and no account needed.
        </p>
      </div>

      <section className="friday-section" aria-labelledby="subscribe-heading">
        <div className="home-shell friday-strip">
          <div>
            <p className="eyebrow">Get the list</p>
            <h2 id="subscribe-heading">Confirm once, then it&apos;s automatic.</h2>
            <p>We&apos;ll email a link to confirm your address. Unsubscribe in one click from any email.</p>
          </div>
          <FridaySignup />
        </div>
      </section>

      <div className="home-shell subscribe-page__details">
        <dl className="subscribe-page__expect">
          {FRIDAY_EXPECTATIONS.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="subscribe-page__more">
          Want a look first? <Link href="/events">See what&apos;s on this week</Link>, or{" "}
          <a href="webcal://www.westfieldbuzz.com/calendar.ics">subscribe in your calendar app</a> instead.
        </p>
      </div>
    </div>
  );
}
