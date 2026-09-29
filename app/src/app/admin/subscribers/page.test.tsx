import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/AdminGate", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { getIdToken: async () => "id-token" } }) }));

import AdminSubscribersPage from "./page";

const items = [
  { email: "new@example.com", status: "pending", source: "website", signedUpAt: "2026-09-29T14:00:00.000Z", confirmedAt: null, unsubscribedAt: null },
  { email: "reader@example.com", status: "active", source: "website", signedUpAt: "2026-09-20T14:00:00.000Z", confirmedAt: "2026-09-20T14:05:00.000Z", unsubscribedAt: null },
  { email: "second@example.com", status: "active", source: "website", signedUpAt: "2026-09-10T14:00:00.000Z", confirmedAt: "2026-09-10T14:05:00.000Z", unsubscribedAt: null },
  { email: "gone@example.com", status: "unsubscribed", source: "website", signedUpAt: "2026-09-01T14:00:00.000Z", confirmedAt: null, unsubscribedAt: "2026-09-05T14:00:00.000Z" },
];

function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn(async () => ({ ok, json: async () => body }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const payload = {
  ok: true,
  items,
  counts: { active: 2, pending: 1, unsubscribed: 1, suppressed: 0, total: 4 },
  truncated: false,
};

describe("AdminSubscribersPage", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("asks the admin API with the signed-in token and leads with the active count", async () => {
    const fetchMock = stubFetch(payload);
    render(<AdminSubscribersPage />);

    expect(await screen.findByText(/active subscribers/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/subscribers", { headers: { Authorization: "Bearer id-token" } });
    expect(screen.getByText(/1 more haven't confirmed yet/)).toBeInTheDocument();
  });

  it("shows active subscribers first and switches groups", async () => {
    stubFetch(payload);
    render(<AdminSubscribersPage />);

    expect(await screen.findByText("reader@example.com")).toBeInTheDocument();
    expect(screen.getByText("second@example.com")).toBeInTheDocument();
    expect(screen.queryByText("new@example.com")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Waiting to confirm · 1" }));
    expect(screen.getByText("new@example.com")).toBeInTheDocument();
    expect(screen.queryByText("reader@example.com")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Everyone · 4" }));
    expect(screen.getByText("gone@example.com")).toBeInTheDocument();
  });

  it("downloads a CSV of exactly the group on screen", async () => {
    stubFetch(payload);
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((value: Blob | MediaSource) => { blob = value as Blob; return "blob:test"; });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<AdminSubscribersPage />);
    await screen.findByText("reader@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));

    expect(click).toHaveBeenCalledTimes(1);
    const csv = await blob!.text();
    expect(csv.split("\r\n")).toHaveLength(4); // header, two active rows, trailing newline
    expect(csv).toContain("reader@example.com,active");
    expect(csv).toContain("second@example.com,active");
    expect(csv).not.toContain("new@example.com");
    expect(csv).not.toContain("gone@example.com");
    click.mockRestore();
  });

  it("notes when the list is cut off", async () => {
    stubFetch({ ...payload, truncated: true });
    render(<AdminSubscribersPage />);
    expect(await screen.findByRole("status")).toHaveTextContent("newest 4 sign-ups");
  });

  it("shows the server's message when loading fails", async () => {
    stubFetch({ ok: false, message: "Admin authorization required." }, false);
    render(<AdminSubscribersPage />);
    await waitFor(() => expect(screen.getByText("Admin authorization required.")).toBeInTheDocument());
  });
});
