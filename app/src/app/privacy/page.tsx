import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
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
        Privacy Policy
      </h1>
      <div className="flex flex-col gap-6 text-[0.92rem] leading-[1.75] text-ink-light">
        <p>
          <strong className="text-ink">Last updated:</strong> March 6, 2026
        </p>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            What We Collect
          </h2>
          <p>
            When you sign in with Facebook, we receive your name, profile photo,
            and email address. We use this to create your Westfield Buzz account
            and display your name when you recommend a local business.
          </p>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            How We Use Your Information
          </h2>
          <ul className="ml-5 list-disc flex flex-col gap-1">
            <li>Display your name and photo on recommendations you make</li>
            <li>Send you account-related notifications (if applicable)</li>
            <li>Identify you as a Westfield community member</li>
          </ul>
          <p className="mt-2">
            We do not sell your data to third parties. We do not run ads.
          </p>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            Data Storage
          </h2>
          <p>
            Your data is stored securely in Google Firebase (Firestore). Only
            your display name and profile photo are publicly visible. Your email
            is private and only used for account identification.
          </p>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            Data Deletion
          </h2>
          <p>
            You can request deletion of your account and all associated data at
            any time by emailing{" "}
            <a
              href="mailto:ajay@ajaysurie.com"
              style={{ color: "var(--accent)" }}
            >
              ajay@ajaysurie.com
            </a>
            . We will delete your data within 30 days.
          </p>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            Third-Party Services
          </h2>
          <ul className="ml-5 list-disc flex flex-col gap-1">
            <li>
              <strong className="text-ink">Facebook Login</strong> — for
              authentication only. We do not post to your Facebook account or
              access your friends list.
            </li>
            <li>
              <strong className="text-ink">Google Firebase</strong> — for data
              storage and hosting.
            </li>
          </ul>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            Contact
          </h2>
          <p>
            Questions about this policy? Email{" "}
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
