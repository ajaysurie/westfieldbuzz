import type { EventSearchSuccess } from "@/lib/search/search-contract";

export default function SearchNotice({
  result,
  onRefine,
  loading,
}: {
  result: EventSearchSuccess;
  onRefine: (query: string) => void;
  loading: boolean;
}) {
  return (
    <div className="grid gap-3">
      {result.fallbackUsed && (
        <div className="rounded-xl border-l-4 border-gold bg-gold/10 px-4 py-3 text-sm text-ink-light" role="status">
          We used local date, category, and keyword matching because the language parser was unavailable. You can still edit the filters or browse the calendar.
        </div>
      )}
      {result.ambiguities.map((ambiguity) => (
        <div key={`${ambiguity.field}-${ambiguity.message}`} className="rounded-xl border border-gold/30 bg-paper-pure px-4 py-3">
          <p className="text-sm font-semibold text-ink">{ambiguity.message}</p>
          {ambiguity.options.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {ambiguity.options.map((option) => (
                <button
                  type="button"
                  key={option}
                  disabled={loading}
                  onClick={() => onRefine(option)}
                  className="min-h-10 rounded-full border border-accent/20 px-3 text-xs font-semibold text-accent hover:bg-accent/5"
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
