import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Deletion",
};

export default function DataDeletionPage() {
  return (
    <div className="mx-auto max-w-[700px] px-12 py-12 max-md:px-6">
      <h1
        className="mb-8"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "2.2rem",
          fontWeight: 400,
          color: "var(--ink)",
        }}
      >
        Data Deletion
      </h1>
      <div className="flex flex-col gap-6 text-[0.92rem] leading-[1.75] text-ink-light">
        <p>
          Westfield Buzz respects your right to control your personal data. You
          can request complete deletion of your account and all associated data
          at any time.
        </p>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            How to Request Deletion
          </h2>
          <p className="mb-3">
            <strong className="text-ink">Option 1: Email us</strong>
          </p>
          <p>
            Send an email to{" "}
            <a
              href="mailto:ajay@ajaysurie.com?subject=Westfield%20Buzz%20Data%20Deletion%20Request"
              style={{ color: "var(--accent)" }}
            >
              ajay@ajaysurie.com
            </a>{" "}
            with the subject line &ldquo;Data Deletion Request&rdquo; and
            include the email address associated with your account. We&rsquo;ll
            confirm receipt and complete the deletion within 30 days.
          </p>
          <p className="mt-3">
            <strong className="text-ink">Option 2: Remove via Facebook</strong>
          </p>
          <p>
            Go to{" "}
            <strong className="text-ink">
              Facebook Settings &rarr; Apps and Websites
            </strong>{" "}
            and remove Westfield Buzz. This revokes our access to your Facebook
            data. To also delete your Westfield Buzz account data, please email
            us as described above.
          </p>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            What Gets Deleted
          </h2>
          <ul className="ml-5 list-disc flex flex-col gap-1">
            <li>Your user profile (name, email, photo)</li>
            <li>Your public profile</li>
            <li>All recommendations you&rsquo;ve made</li>
            <li>Your event interest markers</li>
            <li>Any other data associated with your account</li>
          </ul>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            Timeline
          </h2>
          <p>
            We process deletion requests within 30 days of receipt. You&rsquo;ll
            receive a confirmation email once your data has been removed. Some
            anonymized, aggregated data (like recommendation counts on
            businesses) may be retained as it cannot be linked back to you.
          </p>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            Contact
          </h2>
          <p>
            Questions? Email{" "}
            <a
              href="mailto:ajay@ajaysurie.com"
              style={{ color: "var(--accent)" }}
            >
              ajay@ajaysurie.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
