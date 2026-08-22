import { describe, expect, it } from "vitest";

import {
  inferCodeLanguage,
  remarkCodeLanguage,
  type MarkdownNode,
} from "@/lib/code-language";

describe("inferCodeLanguage", () => {
  it.each([
    [
      "typescript",
      `const response = await llm.chat({ messages });\nconsole.log(response.content);`,
    ],
    [
      "typescript",
      `session.subscribe((event) => {\n  if (event.type === "message") console.log(event);\n});`,
    ],
    ["json", `{"model":"gpt-5","tools":["read","write"]}`],
    [
      "bash",
      `pi install npm:@foo/pi-tools\n# or directly from a git repo\npi install git:github.com/user/repo`,
    ],
    [
      "xml",
      `<project_context>\n  <root>/workspace/pify</root>\n</project_context>`,
    ],
    ["yaml", `model: gpt-5\ntemperature: 0.2\ntools:\n  - read\n  - write`],
  ] as const)("infers %s", (language, source) => {
    expect(inferCodeLanguage(source)).toBe(language);
  });

  it.each([
    `User request\n    |\n    v\nAgent loop ----> Tool result`,
    `src/\n├── app.ts\n└── tools.ts`,
    `Session started\nWaiting for input...`,
  ])("keeps diagrams and terminal output as plaintext", (source) => {
    expect(inferCodeLanguage(source)).toBe("plaintext");
  });
});

describe("remarkCodeLanguage", () => {
  it("adds an inferred language to unlabeled code blocks", () => {
    const code: MarkdownNode = {
      type: "code",
      value: `const answer = await agent.run("hello");`,
    };
    const tree: MarkdownNode = { type: "root", children: [code] };

    remarkCodeLanguage()(tree);

    expect(code.lang).toBe("typescript");
  });

  it("preserves explicit language labels", () => {
    const code: MarkdownNode = {
      type: "code",
      lang: "json",
      value: `const intentionallyDocumentedAsJson = true;`,
    };
    const tree: MarkdownNode = { type: "root", children: [code] };

    remarkCodeLanguage()(tree);

    expect(code.lang).toBe("json");
  });
});
