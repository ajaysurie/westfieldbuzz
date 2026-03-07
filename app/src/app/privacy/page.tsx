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

        <p>
          Westfield Buzz is a community directory for Westfield, NJ residents.
          This policy explains what data we collect, how we use it, and your
          rights.
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
          <p className="mt-2">
            We also collect basic usage data through Vercel Analytics (page
            views, device type, country). This data is anonymous and not tied to
            your account.
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
            <li>Identify you as a Westfield community member</li>
            <li>Improve the platform based on anonymous usage patterns</li>
          </ul>
          <p className="mt-2">
            We do not sell, rent, or share your personal data with third parties
            for marketing purposes. We do not run ads.
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
            Facebook OAuth
          </h2>
          <p>
            We use Facebook Login for authentication only. We access your public
            profile (name and photo) and email address. We do not post to your
            Facebook account, access your friends list, or request any other
            Facebook permissions.
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
            any time. See our{" "}
            <a href="/data-deletion" style={{ color: "var(--accent)" }}>
              Data Deletion page
            </a>{" "}
            for details. Deletion is completed within 30 days.
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
              <strong className="text-ink">Facebook Login</strong> &mdash; for
              authentication only
            </li>
            <li>
              <strong className="text-ink">Google Firebase</strong> &mdash; for
              data storage
            </li>
            <li>
              <strong className="text-ink">Vercel</strong> &mdash; for hosting
              and anonymous analytics
            </li>
          </ul>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            Children&rsquo;s Privacy
          </h2>
          <p>
            Westfield Buzz is not directed at children under 13. We do not
            knowingly collect personal information from children. If you believe
            a child has provided us with personal data, please contact us and we
            will delete it promptly.
          </p>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            Changes to This Policy
          </h2>
          <p>
            We may update this policy from time to time. Updates will be posted
            here with a revised &ldquo;Last updated&rdquo; date.
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
