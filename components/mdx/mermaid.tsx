import { renderMermaidSVG } from "beautiful-mermaid";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";

function renderDiagram(chart: string) {
  try {
    return renderMermaidSVG(chart, {
      bg: "var(--color-fd-background)",
      fg: "var(--color-fd-foreground)",
      transparent: true,
    });
  } catch {
    return null;
  }
}

export function Mermaid({ chart }: { chart: string }) {
  const svg = renderDiagram(chart);

  if (!svg) {
    return (
      <CodeBlock>
        <Pre>{chart}</Pre>
      </CodeBlock>
    );
  }

  return (
    <figure className="pify-mermaid" aria-label="Diagram">
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <details>
        <summary>View diagram source</summary>
        <CodeBlock>
          <Pre>{chart}</Pre>
        </CodeBlock>
      </details>
    </figure>
  );
}
