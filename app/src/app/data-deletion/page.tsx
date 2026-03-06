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
          Westfield Buzz respects your right to control your personal data. If
          you would like to delete your account and all associated data, you
          have two options:
        </p>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            Option 1: Email Us
          </h2>
          <p>
            Send an email to{" "}
            <a
              href="mailto:ajay@ajaysurie.com?subject=Westfield%20Buzz%20Data%20Deletion%20Request"
              style={{ color: "var(--accent)" }}
            >
              ajay@ajaysurie.com
            </a>{" "}
            with the subject line &ldquo;Data Deletion Request&rdquo; and include
            the email address associated with your account.
          </p>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            Option 2: Remove via Facebook
          </h2>
          <p>
            You can remove Westfield Buzz from your Facebook account at any time
            by going to{" "}
            <strong className="text-ink">
              Facebook Settings &rarr; Apps and Websites
            </strong>{" "}
            and removing Westfield Buzz. This revokes our access to your Facebook
            data.
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
            <li>Your recommendations and activity</li>
            <li>Your event interest markers</li>
          </ul>
          <p className="mt-2">
            Deletion is completed within 30 days of your request.
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
