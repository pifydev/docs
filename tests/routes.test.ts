import { describe, expect, it } from "vitest";

import {
  isLocale,
  resolveContentHref,
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

  it("resolves Markdown authoring links to clean localized routes", () => {
    expect(resolveContentHref("en", "index.mdx", "quickstart.md")).toBe(
      "/en/quickstart",
    );
    expect(
      resolveContentHref(
        "vi",
        "how-to/add-custom-tool.md",
        "../ch05-tool-system.md",
      ),
    ).toBe("/vi/ch05-tool-system");
    expect(
      resolveContentHref("en", "reference/api.md", "configuration.md#models"),
    ).toBe("/en/reference/configuration#models");
  });

  it("leaves external, fragment, and clean route links unchanged", () => {
    expect(
      resolveContentHref(
        "en",
        "index.mdx",
        "https://github.com/pifydev/docs/blob/main/CONTRIBUTING.md",
      ),
    ).toBe("https://github.com/pifydev/docs/blob/main/CONTRIBUTING.md");
    expect(resolveContentHref("vi", "quickstart.md", "#install")).toBe(
      "#install",
    );
    expect(resolveContentHref("vi", "quickstart.md", "/vi/glossary")).toBe(
      "/vi/glossary",
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
