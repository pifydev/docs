import type { Root } from "mdast";
import { describe, expect, it } from "vitest";

import { remarkAccordion } from "@/lib/remark-accordion";

describe("remarkAccordion", () => {
  it("wraps the marked block and keeps its code child", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "html",
          value:
            '<Accordions type="single">\n<Accordion title="Fixture source">',
        },
        { type: "code", lang: "ts", value: "const attempt = 1;" },
        { type: "html", value: "</Accordion>\n</Accordions>" },
      ],
    };

    remarkAccordion()(tree);

    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]).toMatchObject({
      type: "mdxJsxFlowElement",
      name: "Accordions",
      attributes: [{ name: "type", value: "single" }],
      children: [
        {
          type: "mdxJsxFlowElement",
          name: "Accordion",
          attributes: [{ name: "title", value: "Fixture source" }],
          children: [{ type: "code", lang: "ts", value: "const attempt = 1;" }],
        },
      ],
    });
  });

  it("leaves unrelated HTML unchanged", () => {
    const html = { type: "html" as const, value: "<section>Example</section>" };
    const tree: Root = { type: "root", children: [html] };

    remarkAccordion()(tree);

    expect(tree.children).toEqual([html]);
  });

  it("rejects an accordion without closing tags", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "html",
          value:
            '<Accordions type="single">\n<Accordion title="Broken fixture">',
        },
        { type: "code", lang: "ts", value: "const attempt = 1;" },
      ],
    };

    expect(() => remarkAccordion()(tree)).toThrowError(
      'Accordion "Broken fixture" has no closing tags',
    );
  });
});
