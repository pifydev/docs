import { describe, expect, it } from "vitest";

import {
  cleanLegacyMarkdownPath,
  isLocale,
  resolveContentHref,
  selectLocale,
  switchLocale,
  toPublicPath,
} from "@/lib/routes";

describe("locale routing", () => {
  it("maps legacy Markdown URLs to clean localized routes", () => {
    expect(cleanLegacyMarkdownPath("/quickstart.md", "en")).toBe(
      "/en/quickstart",
    );
    expect(cleanLegacyMarkdownPath("/how-to/add-custom-tool.mdx", "vi")).toBe(
      "/vi/how-to/add-custom-tool",
    );
    expect(cleanLegacyMarkdownPath("/vi/reference/api.md", "en")).toBe(
      "/vi/reference/api",
    );
    expect(cleanLegacyMarkdownPath("/index.mdx", "vi")).toBe("/vi");
    expect(cleanLegacyMarkdownPath("/zh/reference/api.md", "en")).toBe(
      "/zh/reference/api",
    );
    expect(cleanLegacyMarkdownPath("/en/quickstart", "vi")).toBeUndefined();
  });

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
    expect(toPublicPath("en", "course/index.mdx")).toBe("/en/course");
    expect(toPublicPath("vi", "course/07-agent-loop.md")).toBe(
      "/vi/course/07-agent-loop",
    );
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
    expect(
      resolveContentHref(
        "vi",
        "course/06-tool-contract.md",
        "./07-agent-loop.md#run-the-loop",
      ),
    ).toBe("/vi/course/07-agent-loop#run-the-loop");
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
    expect(switchLocale("/en/course/14-agent-evaluation", "vi")).toBe(
      "/vi/course/14-agent-evaluation",
    );
    expect(switchLocale("/en/not-in-the-manifest", "vi")).toBe("/vi");
    expect(switchLocale("/en/course/not-in-the-manifest", "vi")).toBe("/vi");
    expect(switchLocale("/course/not-in-the-manifest", "en")).toBe("/en");
  });

  it("maps legacy nested course Markdown URLs to clean routes", () => {
    expect(cleanLegacyMarkdownPath("/course/07-agent-loop.md", "en")).toBe(
      "/en/course/07-agent-loop",
    );
    expect(cleanLegacyMarkdownPath("/en/course/index.mdx", "vi")).toBe(
      "/en/course",
    );
    expect(
      cleanLegacyMarkdownPath("/vi/course/14-agent-evaluation.md", "en"),
    ).toBe("/vi/course/14-agent-evaluation");
  });
});
