"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Event } from "@/lib/firestore";
import CalendarExport from "@/components/CalendarExport";
import { useAuth } from "@/lib/auth";
import {
  clearAuthContinuation,
  continuationLoginHref,
  createAuthContinuation,
  readAuthContinuation,
  stripAuthContinuationParams,
} from "@/lib/auth-continuation";
import { isEventSaved, saveEvent, unsaveEvent } from "@/lib/personalization";

function currentReturnTo() {
  return stripAuthContinuationParams(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
}

function finishContinuation(id: string) {
  clearAuthContinuation(id);
  window.history.replaceState({}, "", currentReturnTo());
}

export default function EventDetailActions({ event }: { event: Event }) {
  const { user, loading } = useAuth();
  const userId = user?.uid;
  const router = useRouter();
  const [shareLabel, setShareLabel] = useState("Share event");
  const [saved, setSaved] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const savedRequest = useRef(0);
  const resumedContinuation = useRef<string | null>(null);

  useEffect(() => {
    const request = ++savedRequest.current;
    if (!userId) {
      setSaved(false);
      setSavePending(false);
      return;
    }
    void isEventSaved(userId, event.id)
      .then((value) => {
        if (savedRequest.current === request) setSaved(value);
      })
      .catch(() => {
        if (savedRequest.current === request) setSaveError("We could not check this saved event.");
      });
  }, [event.id, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("continuation");
    if (!id || resumedContinuation.current === id) return;
    const mode = params.get("mode");
    if (mode === "cancel") {
      resumedContinuation.current = id;
      finishContinuation(id);
      return;
    }
    if (mode !== "resume" || !userId) return;
    const continuation = readAuthContinuation(id);
    if (continuation?.action.kind !== "save-event" || continuation.action.eventId !== event.id) return;
    resumedContinuation.current = id;
    const request = ++savedRequest.current;
    setSavePending(true);
    setSaveError("");
    void saveEvent(userId, event.id)
      .then(() => {
        if (savedRequest.current !== request) return;
        setSaved(true);
        finishContinuation(id);
      })
      .catch(() => {
        if (savedRequest.current === request) {
          resumedContinuation.current = null;
          setSaveError("We could not save this event. Try again.");
        }
      })
      .finally(() => {
        if (savedRequest.current === request) setSavePending(false);
      });
  }, [event.id, userId]);

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

  async function toggleSave() {
    if (!user) {
      const returnTo = currentReturnTo();
      const id = createAuthContinuation({ kind: "save-event", eventId: event.id }, returnTo);
      if (id) router.push(continuationLoginHref(id, returnTo));
      else setSaveError("We could not prepare sign-in. Please try again.");
      return;
    }
    const request = ++savedRequest.current;
    const nextSaved = !saved;
    setSavePending(true);
    setSaveError("");
    try {
      if (nextSaved) await saveEvent(user.uid, event.id);
      else await unsaveEvent(user.uid, event.id);
      if (savedRequest.current !== request) return;
      setSaved(nextSaved);
      if (nextSaved) {
        const id = new URLSearchParams(window.location.search).get("continuation");
        if (id) finishContinuation(id);
      }
    } catch {
      if (savedRequest.current === request) setSaveError(`We could not ${nextSaved ? "save" : "remove"} this event. Try again.`);
    } finally {
      if (savedRequest.current === request) setSavePending(false);
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
        onClick={() => void toggleSave()}
        disabled={loading || savePending}
        aria-pressed={saved}
        aria-describedby="save-event-note"
      >
        {savePending ? "Saving…" : saved ? "Saved event" : "Save event"}
      </button>
      <span id="save-event-note" className="detail-actions__note" role={saveError ? "alert" : undefined}>
        {saveError || "Save events to find them again. Browsing and calendar export do not require an account."}
      </span>
    </div>
  );
}
