import type { FormEvent } from "react";

export default function SearchForm({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex max-w-[920px] items-center gap-2 rounded-2xl border border-accent/20 bg-white p-2 pl-4 shadow-[0_8px_30px_rgba(27,58,92,.07)]"
    >
      <span aria-hidden="true" className="text-xl text-accent">⌕</span>
      <label htmlFor="event-search" className="sr-only">Describe the event you want</label>
      <input
        id="event-search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={400}
        autoComplete="off"
        placeholder="Something indoors Saturday morning for a 5-year-old…"
        className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-muted"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="min-h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Searching…" : "Search"}
      </button>
    </form>
  );
}
