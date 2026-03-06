import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mx-auto flex max-w-[1100px] items-center justify-between border-t border-black/8 px-12 py-10 max-md:flex-col max-md:gap-4 max-md:px-6 max-md:text-center">
      <div className="text-[0.8rem]" style={{ color: "var(--ink-muted)" }}>
        Westfield Buzz &middot; Curated by neighbors, for neighbors
      </div>
      <ul className="flex list-none gap-8 max-md:gap-4">
        <li>
          <Link
            href="/directory"
            className="text-[0.8rem] no-underline transition-colors hover:text-ink"
            style={{ color: "var(--ink-muted)" }}
          >
            Directory
          </Link>
        </li>
        <li>
          <Link
            href="/events"
            className="text-[0.8rem] no-underline transition-colors hover:text-ink"
            style={{ color: "var(--ink-muted)" }}
          >
            Events
          </Link>
        </li>
        <li>
          <Link
            href="/suggest"
            className="text-[0.8rem] no-underline transition-colors hover:text-ink"
            style={{ color: "var(--ink-muted)" }}
          >
            Suggest
          </Link>
        </li>
      </ul>
    </footer>
  );
}
