import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

// Mock next/image to render a plain img tag
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // next/image uses "fill" as a boolean prop; convert to standard img attributes
    const { fill, priority, ...rest } = props;
    return <img {...rest} />;
  },
}));

import PageHeader from "../PageHeader";

afterEach(cleanup);

describe("PageHeader", () => {
  it("renders title", () => {
    const { container } = render(
      <PageHeader imageSrc="/test.png" title="Test Title" />
    );
    expect(container).toHaveTextContent("Test Title");
  });

  it("renders subtitle when provided", () => {
    const { container } = render(
      <PageHeader imageSrc="/test.png" title="Title" subtitle="A subtitle" />
    );
    expect(container).toHaveTextContent("A subtitle");
  });

  it("does not render subtitle when not provided", () => {
    const { container } = render(
      <PageHeader imageSrc="/test.png" title="Title" />
    );
    const subtitle = container.querySelector("p");
    expect(subtitle).toBeNull();
  });

  it("renders image with correct src", () => {
    const { container } = render(
      <PageHeader imageSrc="/header-events.png" title="Events" />
    );
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("/header-events.png");
  });
});
