import { describe, expect, it } from "vitest";

import {
  isLocale,
  selectLocale,
  switchLocale,
  toPublicPath,
} from "@/lib/routes";

describe("locale routing", () => {
  it("accepts only public locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("vi")).toBe(true);
    expect(isLocale("zh")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("prefers a valid cookie over browser negotiation", () => {
    expect(selectLocale("vi", "en-US,en;q=0.9")).toBe("vi");
    expect(selectLocale("en", "vi-VN,vi;q=0.9")).toBe("en");
  });

  it("uses Vietnamese browser preference and otherwise English", () => {
    expect(selectLocale(undefined, "vi-VN,vi;q=0.9,en;q=0.8")).toBe("vi");
    expect(selectLocale(undefined, "en-US,en;q=0.9,vi;q=0.8")).toBe("en");
    expect(selectLocale(undefined, "fr-FR,fr;q=0.9")).toBe("en");
    expect(selectLocale("invalid", undefined)).toBe("en");
  });

  it("maps source paths to stable locale-prefixed URLs", () => {
    expect(toPublicPath("en", "index.mdx")).toBe("/en");
    expect(toPublicPath("vi", "how-to/add-custom-tool.md")).toBe(
      "/vi/how-to/add-custom-tool",
    );
  });

  it("switches paired routes and falls back for unknown routes", () => {
    expect(switchLocale("/en/ch03-agent-loop", "vi")).toBe(
      "/vi/ch03-agent-loop",
    );
    expect(switchLocale("/vi/how-to/add-custom-tool", "en")).toBe(
      "/en/how-to/add-custom-tool",
    );
    expect(switchLocale("/en/not-in-the-manifest", "vi")).toBe("/vi");
  });
});
