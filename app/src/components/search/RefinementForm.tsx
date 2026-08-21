import { useState, type FormEvent } from "react";

const DEFAULT_SUGGESTIONS = ["Only free things", "What about Sunday?", "Something indoors"];

export default function RefinementForm({
  onSubmit,
  loading,
  suggestions,
}: {
  onSubmit: (query: string) => void;
  loading: boolean;
  suggestions?: string[];
}) {
  const [value, setValue] = useState("");
  const chips = suggestions?.length ? suggestions : DEFAULT_SUGGESTIONS;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value.trim()) return;
    onSubmit(value);
    setValue("");
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {chips.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={loading}
            onClick={() => onSubmit(suggestion)}
            className="search-followup-chip disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="search-followup-bar">
        <label htmlFor="event-refinement" className="sr-only">Ask a follow-up</label>
        <input
          id="event-refinement"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={400}
          placeholder="Ask a follow-up…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          aria-label="Apply refinement"
          className="ml-auto grid size-9 shrink-0 place-items-center rounded-full bg-accent disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--paper-pure)" strokeWidth="2.4">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
