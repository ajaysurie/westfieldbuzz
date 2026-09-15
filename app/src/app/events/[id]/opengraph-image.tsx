import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPublishedEventById } from "@/lib/server/event-query/firestore-event-repository";
import { eventCategoryImage } from "@/lib/event-categories";
import type { SearchableEvent } from "@/lib/search/event-retrieval";

export const alt = "An event on the Westfield Buzz calendar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function formatWhen(event: SearchableEvent): string {
  const date = new Date(event.date);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}

function verifiedLabel(event: SearchableEvent): string {
  const date = new Date(event.lastVerifiedAt);
  if (Number.isNaN(date.getTime())) return "";
  return `Verified ${date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  })}`;
}

function toDataUri(bytes: ArrayBuffer | Buffer, contentType: string): string {
  const base64 = Buffer.from(new Uint8Array(bytes)).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

async function backgroundImage(event: SearchableEvent | null): Promise<string> {
  if (event?.imageUrl) {
    try {
      const response = await fetch(event.imageUrl, { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        return toDataUri(await response.arrayBuffer(), response.headers.get("content-type") ?? "image/jpeg");
      }
    } catch { /* fall through to local art */ }
  }
  const local = await readFile(join(process.cwd(), "public", eventCategoryImage(event?.category)));
  return toDataUri(local, "image/png");
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [font, event] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/InstrumentSerif-Regular.ttf")),
    getPublishedEventById(decodeURIComponent(id)).catch(() => null),
  ]);
  const background = await backgroundImage(event);

  const title = event?.title ?? "What's on around Westfield";
  const when = event ? formatWhen(event) : "";
  const place = event ? [event.location, event.town].filter(Boolean).join(" · ") : "";
  const verified = event ? verifiedLabel(event) : "";

  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex" }}>
        <img
          src={background}
          alt=""
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "linear-gradient(180deg, rgba(23,33,43,0.15) 0%, rgba(23,33,43,0.45) 42%, rgba(23,33,43,0.95) 72%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 56,
            bottom: 44,
            width: 1088,
            display: "flex",
            flexDirection: "column",
            color: "white",
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", opacity: 0.9 }}>
            Westfield Buzz
          </span>
          <span
            style={{
              marginTop: 18,
              fontFamily: "InstrumentSerif",
              fontSize: title.length > 48 ? 56 : 68,
              lineHeight: 1.04,
            }}
          >
            {title}
          </span>
          {(when || place) && (
            <span style={{ marginTop: 14, fontSize: 28, fontWeight: 600, opacity: 0.95 }}>
              {[when, place].filter(Boolean).join(" · ")}
            </span>
          )}
          <div
            style={{
              marginTop: 26,
              paddingTop: 16,
              borderTop: "1px solid rgba(255,255,255,0.3)",
              display: "flex",
              justifyContent: "space-between",
              fontSize: 20,
              opacity: 0.8,
            }}
          >
            <span>westfieldbuzz.com</span>
            {verified && <span>{verified}</span>}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "InstrumentSerif", data: font, weight: 400, style: "normal" }],
    }
  );
}
