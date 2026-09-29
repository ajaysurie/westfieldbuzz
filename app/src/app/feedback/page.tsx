import type { Metadata } from "next";
import Link from "next/link";
import FeedbackForm from "@/components/FeedbackForm";

export const metadata: Metadata = {
  title: "Suggest an event or fix",
  description: "Tell Westfield Buzz about a local event we're missing or anything we should fix.",
  alternates: { canonical: "/feedback" },
};

export default function FeedbackPage() {
  return (
    <div className="detail-stage">
      <div className="detail-shell feedback-page">
        <p className="eyebrow">Feedback</p>
        <h1>Suggest an event or fix</h1>
        <p className="feedback-page__lede">
          Know a local event we&apos;re missing, or a calendar we should read? Tell us here.
          To fix a specific listing, use &ldquo;Something wrong with this listing?&rdquo; on its event page.
          Friday list readers can also just reply to the email.
        </p>
        <FeedbackForm />
        <p className="feedback-page__agents">
          Building an agent? It can send the same reports to <code>POST /api/feedback</code>.
          See <Link href="/agents">For agents</Link>.
        </p>
      </div>
    </div>
  );
}
