import { intentChips, type SearchIntent } from "@/lib/search/event-intent";

/** Maps a saved-preference field name (from response.appliedPreferenceFields)
 * to the intentChips() field key it corresponds to, so a chip whose value
 * came from the household's saved preferences renders as "saved" rather
 * than as a freshly interpreted filter. */
const PREFERENCE_FIELD_MAP: Record<string, string> = {
  ages: "partyAges",
  towns: "towns",
  "drive time": "maxDriveMinutes",
  budget: "budget",
};

export default function IntentChips({
  intent,
  onRemove,
  disabled,
  appliedPreferenceFields,
}: {
  intent: SearchIntent;
  onRemove: (field: string, label: string) => void;
  disabled: boolean;
  appliedPreferenceFields?: string[];
}) {
  const chips = intentChips(intent);
  if (!chips.length) return null;
  const savedFields = new Set(
    (appliedPreferenceFields ?? []).map((name) => PREFERENCE_FIELD_MAP[name]).filter(Boolean)
  );
  return (
    <div aria-label="Interpreted search filters" className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => {
        const saved = savedFields.has(chip.field);
        return (
          <button
            key={`${chip.field}-${chip.label}`}
            type="button"
            disabled={disabled}
            onClick={() => onRemove(chip.field, chip.label)}
            aria-label={`Remove ${chip.label} filter`}
            className={
              saved
                ? "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-accent/30 bg-paper-dark px-3 text-xs font-medium text-ink-light transition disabled:opacity-50"
                : "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-medium text-paper-pure transition disabled:opacity-50"
            }
          >
            {chip.label}
            {saved ? " · saved" : ""}
            <span aria-hidden="true" className="opacity-60">✕</span>
          </button>
        );
      })}
    </div>
  );
}
