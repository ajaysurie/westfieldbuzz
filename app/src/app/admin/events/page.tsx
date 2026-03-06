"use client";

import { useEffect, useState } from "react";
import AdminGate from "@/components/AdminGate";
import { useAuth } from "@/lib/auth";
import { getEvents, createEvent, deleteEvent, type Event } from "@/lib/firestore";

export default function AdminEventsPage() {
  return (
    <AdminGate>
      <EventsAdmin />
    </AdminGate>
  );
}

const EVENT_CATEGORIES = ["Market", "Music", "Festival", "Community", "Sports", "Arts", "Food", "Other"];

function EventsAdmin() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    endDate: "",
    location: "",
    category: "Community",
  });

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);
    const data = await getEvents();
    setEvents(data);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.title || !form.date) return;

    await createEvent({
      title: form.title,
      description: form.description,
      date: new Date(form.date),
      endDate: form.endDate ? new Date(form.endDate) : null,
      location: form.location,
      category: form.category,
      createdBy: user.uid,
    });

    setForm({ title: "", description: "", date: "", endDate: "", location: "", category: "Community" });
    setShowForm(false);
    loadEvents();
  }

  async function handleDelete(eventId: string) {
    if (!confirm("Delete this event?")) return;
    await deleteEvent(eventId);
    loadEvents();
  }

  const inputClass =
    "w-full rounded-lg border border-black/12 bg-paper-pure px-4 py-3 text-[0.9rem] text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent";

  return (
    <div className="mx-auto max-w-[800px] px-12 py-12 max-md:px-6">
      <div
        className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.15em]"
        style={{ color: "var(--accent)" }}
      >
        Admin
      </div>
      <div className="mb-8 flex items-center justify-between">
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.8rem",
            fontWeight: 400,
            color: "var(--ink)",
          }}
        >
          Manage Events
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          {showForm ? "Cancel" : "+ Add Event"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-8 rounded-[10px] border border-black/6 bg-paper-pure p-6 flex flex-col gap-4"
        >
          <input
            type="text"
            required
            placeholder="Event title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={inputClass}
          />
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className={inputClass + " resize-none"}
          />
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <div>
              <label className="mb-1 block text-[0.8rem] font-medium text-ink-light">
                Start Date/Time *
              </label>
              <input
                type="datetime-local"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-[0.8rem] font-medium text-ink-light">
                End Date/Time
              </label>
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <input
            type="text"
            placeholder="Location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className={inputClass}
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className={inputClass}
          >
            {EVENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg px-6 py-3 text-[0.9rem] font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Create Event
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-ink-muted">Loading events...</p>
      ) : events.length === 0 ? (
        <p className="text-ink-muted">No events yet. Click &ldquo;+ Add Event&rdquo; to create one.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {events.map((evt) => (
            <div
              key={evt.id}
              className="flex items-start justify-between rounded-[10px] border border-black/6 bg-paper-pure p-6"
            >
              <div>
                <h3
                  className="text-[1.05rem]"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 400 }}
                >
                  {evt.title}
                </h3>
                <p className="text-[0.82rem] text-ink-muted">
                  {evt.location} &middot; {evt.category}
                </p>
                <p className="text-[0.78rem] text-ink-muted">
                  {evt.interestedCount} interested
                </p>
              </div>
              <button
                onClick={() => handleDelete(evt.id)}
                className="text-[0.82rem] font-medium text-ink-muted transition-colors hover:text-sienna"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
