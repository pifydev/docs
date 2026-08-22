export function extractMermaidBlocks(markdown) {
  return [
    ...markdown.matchAll(/^```mermaid\s*\r?\n([\s\S]*?)\r?\n```\s*$/gm),
  ].map((match) => match[1]);
}

export function withoutFencedCode(markdown) {
  return markdown.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");
}

export function codeFenceLanguages(markdown) {
  return [...markdown.matchAll(/^```([^\s]*)[^\n]*\n[\s\S]*?^```\s*$/gm)].map(
    (match) => match[1],
  );
}

export function headingShape(markdown) {
  return [...withoutFencedCode(markdown).matchAll(/^(#{1,6})\s+.+$/gm)].map(
    (match) => match[1].length,
  );
}
