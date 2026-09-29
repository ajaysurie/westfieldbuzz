import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FeedbackForm from "../FeedbackForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(response: { ok: boolean; body: unknown }) {
  const fetchMock = vi.fn(async () => ({ ok: response.ok, json: async () => response.body }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("FeedbackForm", () => {
  it("reports a listing problem with the event id", async () => {
    const fetchMock = stubFetch({ ok: true, body: { ok: true, id: "fb-1" } });
    render(<FeedbackForm eventId="evt-1" />);

    fireEvent.click(screen.getByLabelText("Cancelled or postponed"));
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "Rained out" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Thanks"));
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      eventId: "evt-1",
      reason: "cancelled",
      message: "Rained out",
      contact: "",
      website: "",
      via: "web",
    });
  });

  it("offers suggestion reasons without an event", () => {
    render(<FeedbackForm />);
    expect(screen.getByLabelText("An event you're missing")).toBeChecked();
    expect(screen.queryByLabelText("Listed twice")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Event name, date, and a link if you have one")).toBeRequired();
  });

  it("shows the server's message on failure", async () => {
    stubFetch({ ok: false, body: { ok: false, message: "Too many reports from this address. Try again in a minute." } });
    render(<FeedbackForm eventId="evt-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Too many reports"));
  });
});
