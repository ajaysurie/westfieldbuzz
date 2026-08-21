import type { CSSProperties } from "react";

export interface DigestEventItem {
  id: string;
  title: string;
  when: string;
  location: string;
  town: string;
  url: string;
  statusLabel?: string;
}

export interface FridayDigestProps {
  issueLabel: string;
  intro: string;
  events: DigestEventItem[];
  calendarUrl: string;
  unsubscribePageUrl: string;
  oneClickUnsubscribeUrl: string;
  personalized?: boolean;
}

const colors = {
  ink: "#12233f",
  gold: "#c89a42",
  paper: "#f8f3e9",
  white: "#ffffff",
  muted: "#5f6672",
};

const page: CSSProperties = {
  margin: 0,
  padding: "32px 16px",
  background: colors.paper,
  color: colors.ink,
  fontFamily: "Arial, Helvetica, sans-serif",
};

export function FridayDigest({
  issueLabel,
  intro,
  events,
  calendarUrl,
  unsubscribePageUrl,
  personalized = false,
}: FridayDigestProps) {
  return (
    <html lang="en">
      <body style={page}>
        <main
          style={{
            width: "100%",
            maxWidth: 620,
            margin: "0 auto",
            background: colors.white,
            border: "1px solid #e4dccd",
          }}
        >
          <header style={{ padding: "32px 32px 24px", borderTop: `6px solid ${colors.gold}` }}>
            <p style={{ margin: "0 0 8px", color: colors.gold, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase" }}>
              {issueLabel}
            </p>
            <h1 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 34, lineHeight: 1.1 }}>
              Westfield Buzz
            </h1>
            <p style={{ margin: "14px 0 0", color: colors.muted, fontSize: 16, lineHeight: 1.55 }}>
              {intro}
            </p>
            {personalized ? (
              <p style={{ margin: "10px 0 0", color: colors.muted, fontSize: 12 }}>
                Chosen from your saved household preferences. Event facts always come from the original source.
              </p>
            ) : null}
          </header>

          <section style={{ padding: "0 32px" }}>
            {events.map((event) => (
              <article key={event.id} style={{ padding: "20px 0", borderTop: "1px solid #ece5d9" }}>
                <p style={{ margin: "0 0 6px", color: colors.gold, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
                  {event.when}{event.statusLabel ? ` · ${event.statusLabel}` : ""}
                </p>
                <h2 style={{ margin: "0 0 7px", fontFamily: "Georgia, serif", fontSize: 23, lineHeight: 1.25 }}>
                  <a href={event.url} style={{ color: colors.ink, textDecoration: "none" }}>
                    {event.title}
                  </a>
                </h2>
                <p style={{ margin: 0, color: colors.muted, fontSize: 14 }}>
                  {event.location} · {event.town}
                </p>
              </article>
            ))}
          </section>

          <section style={{ padding: "24px 32px 32px" }}>
            <a
              href={calendarUrl}
              style={{ display: "block", padding: "14px 20px", background: colors.ink, color: colors.white, textAlign: "center", textDecoration: "none", fontSize: 15, fontWeight: 700 }}
            >
              View the full calendar
            </a>
          </section>

          <footer style={{ padding: "20px 32px 28px", borderTop: "1px solid #ece5d9", color: colors.muted, fontSize: 12, lineHeight: 1.5 }}>
            <p style={{ margin: 0 }}>
              You received this Friday list from Westfield Buzz. <a href={unsubscribePageUrl} style={{ color: colors.muted }}>Unsubscribe</a>.
            </p>
          </footer>
        </main>
      </body>
    </html>
  );
}

export function fridayDigestText(props: FridayDigestProps): string {
  const lines = [
    `WESTFIELD BUZZ — ${props.issueLabel}`,
    "",
    props.intro,
    "",
    ...props.events.flatMap((event) => [
      `${event.when}${event.statusLabel ? ` · ${event.statusLabel}` : ""}`,
      event.title,
      `${event.location} · ${event.town}`,
      event.url,
      "",
    ]),
    `Full calendar: ${props.calendarUrl}`,
    `Unsubscribe: ${props.unsubscribePageUrl}`,
  ];
  return lines.join("\n");
}
