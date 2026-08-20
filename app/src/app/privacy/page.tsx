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
          <strong className="text-ink">Last updated:</strong> August 19, 2026
        </p>

        <p>
          Westfield Buzz is a local event guide for Westfield, NJ and nearby towns.
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
            You can browse events and search without an account. If you sign in
            with Google or an email link, we receive the account identifier,
            name or photo the provider supplies, and verified email address.
            If you choose to save them, we also store saved events, saved
            searches, and household preferences such as towns, interests,
            children&rsquo;s age ranges, budget, timing, or accessibility needs.
          </p>
          <p className="mt-2">
            Natural-language event requests are sent to our AI service to turn
            them into search filters. Anonymous raw requests are not stored as
            saved searches unless you explicitly save one. We also collect
            basic usage data through Vercel Analytics (page
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
            <li>Find and rank source-backed events for your request</li>
            <li>Save events, searches, and optional household preferences</li>
            <li>Send the generic or personalized Friday email you request</li>
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
            Account data, preferences, saves, subscriptions, and delivery state
            are stored in Google Firebase (Firestore). Preferences and saves
            are private to your account and administrators. We keep operational
            records only as long as needed for delivery, security, source
            accuracy, and legal obligations.
          </p>
        </section>

        <section>
          <h2
            className="mb-2 text-[1.15rem]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 400, color: "var(--ink)" }}
          >
            Authentication
          </h2>
          <p>
            Google and passwordless email links are the primary sign-in methods.
            Existing Facebook-linked accounts may retain that provider during
            migration, but Facebook is not required for browsing or new accounts.
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
            You can request deletion of your account, saved searches, saved
            events, and household preferences at
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
              <strong className="text-ink">Google Firebase</strong> &mdash; for
              authentication and data storage
            </li>
            <li>
              <strong className="text-ink">OpenAI</strong> &mdash; to interpret
              natural-language searches into structured filters
            </li>
            <li>
              <strong className="text-ink">Resend</strong> &mdash; to deliver
              requested Friday emails and process delivery status
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
            Westfield Buzz is for adults and is not directed at children under
            13. An adult may optionally save a child&rsquo;s age range to improve
            event matching; we do not ask for a child&rsquo;s name, contact details,
            account, or precise identity. If you believe a child has provided us
            with personal data, contact us and we will delete it promptly.
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
