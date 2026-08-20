"use client";

import { useState } from "react";
import type { Event } from "@/lib/firestore";
import CalendarExport from "@/components/CalendarExport";

export default function EventDetailActions({ event }: { event: Event }) {
  const [shareLabel, setShareLabel] = useState("Share event");

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareLabel("Link copied");
    } catch {
      setShareLabel("Share unavailable");
    }
  }

  return (
    <div className="detail-actions" aria-label="Event actions">
      <CalendarExport event={event} />
      <button type="button" className="detail-action" onClick={share}>
        {shareLabel}
      </button>
      <button
        type="button"
        className="detail-action"
        disabled
        aria-describedby="save-event-note"
      >
        Save event
      </button>
      <span id="save-event-note" className="detail-actions__note">
        Saving is coming soon. Browsing and calendar export do not require an account.
      </span>
    </div>
  );
}
