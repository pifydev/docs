import type { Root, RootContent } from "mdast";

const OPEN = /^<Accordions type="single">\r?\n<Accordion title="([^"\r\n]+)">$/;
const CLOSE = /^<\/Accordion>\r?\n<\/Accordions>$/;

export function remarkAccordion() {
  return (tree: Root) => {
    for (let index = 0; index < tree.children.length; index += 1) {
      const opening = tree.children[index];
      if (opening.type !== "html") continue;

      const match = OPEN.exec(opening.value);
      if (!match) continue;

      const closingIndex = tree.children.findIndex(
        (node, candidate) =>
          candidate > index && node.type === "html" && CLOSE.test(node.value),
      );
      if (closingIndex === -1) {
        throw new Error(`Accordion "${match[1]}" has no closing tags`);
      }

      const accordion = {
        type: "mdxJsxFlowElement",
        name: "Accordions",
        attributes: [
          { type: "mdxJsxAttribute", name: "type", value: "single" },
        ],
        children: [
          {
            type: "mdxJsxFlowElement",
            name: "Accordion",
            attributes: [
              {
                type: "mdxJsxAttribute",
                name: "title",
                value: match[1],
              },
            ],
            children: tree.children.slice(index + 1, closingIndex),
          },
        ],
      } as unknown as RootContent;

      tree.children.splice(index, closingIndex - index + 1, accordion);
    }
  };
}
