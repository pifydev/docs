export type CodeLanguage =
  "bash" | "json" | "plaintext" | "typescript" | "xml" | "yaml";

export type MarkdownNode = {
  type?: string;
  lang?: string | null;
  value?: string;
  children?: MarkdownNode[];
};

const shellCommand = new RegExp(
  String.raw`^(?:\$\s+)?(?:bun|cd|chmod|cp|curl|docker|echo|export|git|mkdir|mv|node|npm|npx|pi|pnpm|rm|touch|vercel|yarn)(?:\s|$)`,
);

const typescriptSignals = [
  /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*(?:\s*:[^=;]+)?\s*=/,
  /\b(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/,
  /\b(?:class|enum|interface|namespace|type)\s+[A-Za-z_$][\w$]*/,
  /\b(?:import|export)\s+(?:type\s+)?(?:\{|\*|default|[A-Za-z_$])/,
  /(?:=>|\bawait\s+|\bnew\s+[A-Z][\w$]*\s*\()/,
  /(?:^|\n)\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*\([^\n]*\)\s*;?\s*(?:\n|$)/,
  /(?:^|\n)\s*(?:if|for|while|switch|try)\s*\(/,
];

function isJson(source: string): boolean {
  if (!/^[{[]/.test(source)) return false;

  try {
    JSON.parse(source);
    return true;
  } catch {
    return false;
  }
}

function isShell(source: string): boolean {
  if (/^#!\/usr\/bin\/(?:env\s+)?(?:ba|z)?sh\b/.test(source)) return true;

  const executableLines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  return (
    executableLines.length > 0 &&
    executableLines.every((line) => shellCommand.test(line))
  );
}

function isXml(source: string): boolean {
  return (
    /^<\??[A-Za-z][^>]*>/.test(source) &&
    /<\/[A-Za-z][\w:.-]*>\s*$/.test(source)
  );
}

function isYaml(source: string): boolean {
  const lines = source.split("\n").filter((line) => line.trim());
  const mappings = lines.filter((line) =>
    /^\s*[\w.-]+:\s*(?:[^{}]|$)/.test(line),
  );

  return lines.length >= 2 && mappings.length >= 2;
}

export function inferCodeLanguage(value: string): CodeLanguage {
  const source = value.trim();

  if (!source) return "plaintext";
  if (isJson(source)) return "json";
  if (isShell(source)) return "bash";
  if (isXml(source)) return "xml";
  if (isYaml(source)) return "yaml";
  if (typescriptSignals.some((signal) => signal.test(source)))
    return "typescript";

  return "plaintext";
}

export function remarkCodeLanguage() {
  return (tree: MarkdownNode): void => {
    const visit = (node: MarkdownNode): void => {
      if (
        node.type === "code" &&
        !node.lang?.trim() &&
        typeof node.value === "string"
      ) {
        node.lang = inferCodeLanguage(node.value);
      }

      node.children?.forEach(visit);
    };

    visit(tree);
  };
}
