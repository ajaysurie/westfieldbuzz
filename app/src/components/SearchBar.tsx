"use client";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder }: SearchBarProps) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[0.95rem] text-ink-muted">
        &#x1F50D;
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Search..."}
        className="w-full rounded-lg border border-black/12 bg-paper-pure px-5 py-3 pl-11 text-[0.9rem] text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent"
        style={{ fontFamily: "var(--font-body)" }}
      />
    </div>
  );
}
