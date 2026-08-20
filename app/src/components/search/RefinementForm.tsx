import { useState, type FormEvent } from "react";

const QUICK_REFINEMENTS = ["Make it free", "Include Sunday too", "Closer to Westfield"];

export default function RefinementForm({
  onSubmit,
  loading,
}: {
  onSubmit: (query: string) => void;
  loading: boolean;
}) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim()) return;
    onSubmit(value);
    setValue("");
  };
  return (
    <aside className="sticky top-28 rounded-2xl bg-accent p-5 text-white shadow-[0_15px_38px_rgba(27,58,92,.18)] max-md:static">
      <div className="text-[0.6rem] font-bold uppercase tracking-[.14em] text-white/55">Keep narrowing</div>
      <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-tight">Want something different?</h2>
      <p className="mt-2 text-xs text-white/70">The current search stays in place while you change one thing.</p>
      <div className="my-4 grid gap-2">
        {QUICK_REFINEMENTS.map((refinement) => (
          <button key={refinement} type="button" disabled={loading} onClick={() => onSubmit(refinement)} className="min-h-10 rounded-lg border border-white/20 bg-white/5 px-3 text-left text-xs text-white hover:bg-white/10 disabled:opacity-50">{refinement}</button>
        ))}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 rounded-xl bg-white p-2">
        <label htmlFor="event-refinement" className="sr-only">Refine these results</label>
        <input id="event-refinement" value={value} onChange={(event) => setValue(event.target.value)} maxLength={400} placeholder="Say what to change…" className="min-w-0 flex-1 bg-transparent px-1 text-base text-ink outline-none placeholder:text-ink-muted" />
        <button type="submit" disabled={loading || !value.trim()} className="grid size-10 shrink-0 place-items-center rounded-lg bg-gold font-bold text-white disabled:opacity-50" aria-label="Apply refinement">→</button>
      </form>
    </aside>
  );
}
