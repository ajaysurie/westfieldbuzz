import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <p className="site-footer__brand">Westfield Buzz</p>
          <p>Freshly checked events around Westfield and nearby towns.</p>
          <p className="site-footer__credit">
            Built by <a href="https://www.ajaysurie.com" target="_blank" rel="noopener noreferrer">Ajay Surie</a>, Westfield dad &amp; resident.
          </p>
        </div>
        <nav aria-label="Footer navigation">
          <div>
            <Link href="/">This week</Link>
            <Link href="/events">Calendar</Link>
            <Link href="/#friday-list">Get the Friday list</Link>
          </div>
          <div>
            <Link href="/privacy">Privacy</Link>
            <Link href="/data-deletion">Data deletion</Link>
          </div>
        </nav>
      </div>
      <p className="site-footer__copyright">© {new Date().getFullYear()} Westfield Buzz</p>
    </footer>
  );
}
