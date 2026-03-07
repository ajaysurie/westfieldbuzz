"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { submitSuggestion, getCategories } from "@/lib/firestore";
import AuthGate from "@/components/AuthGate";
import PageHeader from "@/components/PageHeader";
import { useEffect } from "react";

export default function SuggestPage() {
  return (
    <>
      <PageHeader
        imageSrc="/header-suggest.png"
        title="Know a great business?"
        subtitle="Help your neighbors find trusted providers"
      />
      <AuthGate>
        <SuggestForm />
      </AuthGate>
    </>
  );
}

function SuggestForm() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    businessName: "",
    category: "",
    address: "",
    phone: "",
    website: "",
    notes: "",
  });

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.businessName || !form.category) return;

    setLoading(true);
    try {
      await submitSuggestion({
        userId: user.uid,
        businessName: form.businessName,
        category: form.category,
        address: form.address,
        phone: form.phone,
        website: form.website,
        notes: form.notes,
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Suggestion failed:", err);
    }
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-[500px] px-12 py-16 text-center max-md:px-6">
        <h1
          className="mb-4"
          style={{ fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 400 }}
        >
          Thank you!
        </h1>
        <p className="text-[0.95rem] text-ink-light">
          Your suggestion has been submitted. We&apos;ll review it and add it to the
          directory if it&apos;s a good fit.
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-black/12 bg-paper-pure px-4 py-3 text-[0.9rem] text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent";

  return (
    <div className="mx-auto max-w-[500px] px-12 py-12 max-md:px-6">
      <p className="mb-8 text-[0.9rem] text-ink-light">
        We&apos;ll review and add them to the directory.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-[0.8rem] font-medium text-ink-light">
            Business Name *
          </label>
          <input
            type="text"
            required
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            placeholder="e.g. Joe's Plumbing"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-[0.8rem] font-medium text-ink-light">
            Address
          </label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="123 Elm St, Westfield NJ"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-[0.8rem] font-medium text-ink-light">
            Category *
          </label>
          <select
            required
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className={inputClass}
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[0.8rem] font-medium text-ink-light">
            Phone
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="(908) 555-1234"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-[0.8rem] font-medium text-ink-light">
            Website
          </label>
          <input
            type="url"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder="https://"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-[0.8rem] font-medium text-ink-light">
            Why do you recommend them?
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Tell us about your experience..."
            rows={3}
            className={inputClass + " resize-none"}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`mt-2 rounded-lg px-6 py-3 text-[0.9rem] font-semibold text-white transition-all hover:-translate-y-0.5 ${
            loading ? "opacity-50" : ""
          }`}
          style={{ background: "var(--accent)" }}
        >
          {loading ? "Submitting..." : "Submit Suggestion"}
        </button>
      </form>
    </div>
  );
}
