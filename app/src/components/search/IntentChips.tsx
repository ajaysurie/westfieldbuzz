import { intentChips, type SearchIntent } from "@/lib/search/event-intent";

export default function IntentChips({
  intent,
  onRemove,
  disabled,
}: {
  intent: SearchIntent;
  onRemove: (field: string, label: string) => void;
  disabled: boolean;
}) {
  const chips = intentChips(intent);
  if (!chips.length) return null;
  return (
    <div aria-label="Interpreted search filters" className="mx-auto mt-3 flex max-w-[920px] gap-2 overflow-x-auto pb-1">
      {chips.map((chip) => (
        <button
          key={`${chip.field}-${chip.label}`}
          type="button"
          disabled={disabled}
          onClick={() => onRemove(chip.field, chip.label)}
          aria-label={`Remove ${chip.label} filter`}
          className="min-h-10 shrink-0 rounded-full border border-accent/15 bg-accent/5 px-3 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          {chip.label} <span aria-hidden="true" className="ml-1 opacity-50">×</span>
        </button>
      ))}
    </div>
  );
}
