function fencedCodeBlocks(markdown) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const blocks = [];
  let open;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (open) {
      const closing = line.match(/^ {0,3}([`~]{3,})[ \t]*$/);
      if (
        closing &&
        closing[1][0] === open.marker &&
        closing[1].length >= open.length
      ) {
        blocks.push({
          language: open.language,
          body: lines.slice(open.startLine + 1, index).join("\n"),
          startLine: open.startLine,
          endLine: index,
        });
        open = undefined;
      }
      continue;
    }

    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!opening) continue;
    const info = opening[2].trim();
    if (opening[1][0] === "`" && info.includes("`")) continue;
    open = {
      marker: opening[1][0],
      length: opening[1].length,
      language: info.split(/\s+/, 1)[0] ?? "",
      startLine: index,
    };
  }

  if (open) {
    blocks.push({
      language: open.language,
      body: lines.slice(open.startLine + 1).join("\n"),
      startLine: open.startLine,
      endLine: lines.length - 1,
    });
  }

  return { blocks, lines };
}

export function extractMermaidBlocks(markdown) {
  return fencedCodeBlocks(markdown)
    .blocks.filter(({ language }) => language === "mermaid")
    .map(({ body }) => body);
}

export function withoutFencedCode(markdown) {
  const { blocks, lines } = fencedCodeBlocks(markdown);
  for (const { startLine, endLine } of blocks) {
    lines.fill("", startLine, endLine + 1);
  }
  return lines.join("\n");
}

export function codeFenceLanguages(markdown) {
  return fencedCodeBlocks(markdown).blocks.map(({ language }) => language);
}

export function headingShape(markdown) {
  return [...withoutFencedCode(markdown).matchAll(/^(#{1,6})\s+.+$/gm)].map(
    (match) => match[1].length,
  );
}
