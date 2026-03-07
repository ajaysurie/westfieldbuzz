import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-black/8">
      <div className="mx-auto max-w-[1100px] px-12 py-10 max-md:px-6">
        {/* Top row: nav + legal */}
        <div className="flex items-start justify-between gap-8 max-md:flex-col max-md:gap-6">
          <div>
            <div
              className="mb-1 text-[0.95rem] font-medium"
              style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
            >
              Westfield Buzz
            </div>
            <div className="text-[0.84rem] text-ink-muted">
              Curated by neighbors, for neighbors
            </div>
            <div className="mt-1 text-[0.8rem] text-ink-muted">
              Built by{" "}
              <a
                href="https://www.ajaysurie.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink no-underline transition-colors hover:text-accent"
              >
                Ajay Surie
              </a>
              , Westfield dad &amp; resident.
            </div>
          </div>

          <div className="flex gap-8 max-md:gap-6">
            <div className="flex flex-col gap-2">
              <Link href="/directory" className="text-[0.84rem] text-ink-muted no-underline transition-colors hover:text-ink">
                Directory
              </Link>
              <Link href="/events" className="text-[0.84rem] text-ink-muted no-underline transition-colors hover:text-ink">
                Events
              </Link>
              <Link href="/suggest" className="text-[0.84rem] text-ink-muted no-underline transition-colors hover:text-ink">
                Suggest
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <Link href="/privacy" className="text-[0.84rem] text-ink-muted no-underline transition-colors hover:text-ink">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-[0.84rem] text-ink-muted no-underline transition-colors hover:text-ink">
                Terms of Service
              </Link>
              <Link href="/data-deletion" className="text-[0.84rem] text-ink-muted no-underline transition-colors hover:text-ink">
                Data Deletion
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="mt-8 border-t border-black/6 pt-6 max-md:text-center">
          <div className="text-[0.8rem] text-ink-muted">
            &copy; {new Date().getFullYear()} Westfield Buzz. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
