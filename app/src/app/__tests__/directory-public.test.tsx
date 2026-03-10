import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Directory pages are public (no AuthGate)", () => {
  it("directory/page.tsx does not import AuthGate", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../directory/page.tsx"),
      "utf-8"
    );
    expect(source).not.toContain("AuthGate");
  });

  it("directory/[id]/page.tsx does not import AuthGate", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../directory/[id]/page.tsx"),
      "utf-8"
    );
    expect(source).not.toContain("AuthGate");
  });

  it("suggest/page.tsx still uses AuthGate (protected)", () => {
    const suggestPath = path.resolve(__dirname, "../suggest/page.tsx");
    if (fs.existsSync(suggestPath)) {
      const source = fs.readFileSync(suggestPath, "utf-8");
      expect(source).toContain("AuthGate");
    }
  });

  it("account/page.tsx still uses AuthGate (protected)", () => {
    const accountPath = path.resolve(__dirname, "../account/page.tsx");
    if (fs.existsSync(accountPath)) {
      const source = fs.readFileSync(accountPath, "utf-8");
      expect(source).toContain("AuthGate");
    }
  });
});
