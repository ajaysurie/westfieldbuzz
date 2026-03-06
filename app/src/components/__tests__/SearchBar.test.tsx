import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import SearchBar from "../SearchBar";

afterEach(cleanup);

describe("SearchBar", () => {
  it("renders with default placeholder", () => {
    render(<SearchBar value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("renders with custom placeholder", () => {
    render(<SearchBar value="" onChange={() => {}} placeholder="Find a service..." />);
    expect(screen.getByPlaceholderText("Find a service...")).toBeInTheDocument();
  });

  it("displays the current value", () => {
    render(<SearchBar value="plumber" onChange={() => {}} />);
    expect(screen.getByDisplayValue("plumber")).toBeInTheDocument();
  });

  it("calls onChange when typing", () => {
    const handleChange = vi.fn();
    render(<SearchBar value="" onChange={handleChange} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "electrician" } });
    expect(handleChange).toHaveBeenCalledWith("electrician");
  });
});
