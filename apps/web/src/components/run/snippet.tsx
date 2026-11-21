/** Lines of context shown around a change in the diff view. */
export const CONTEXT_LINES = 4;

/**
 * A few numbered lines of a contract around one line, with that line marked. The text is rendered as text: React
 * escapes it, and nothing in a contract is interpreted as markup.
 */
export function Snippet({
  lines,
  line,
  side,
  tone,
}: {
  lines: readonly string[];
  /** 1-based line to mark; undefined when the location is not in this contract. */
  line: number | undefined;
  side: "base" | "head";
  /** Text colour class of the marked line (the change's label). */
  tone: string;
}) {
  if (line === undefined) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        {side === "base" ? "Not in the old contract (it was added)." : "Not in the new contract (it was removed)."}
      </p>
    );
  }
  const first = Math.max(1, line - CONTEXT_LINES);
  const last = Math.min(lines.length, line + CONTEXT_LINES);
  const numbers = Array.from({ length: last - first + 1 }, (_, index) => first + index);
  return (
    <pre tabIndex={0} className="overflow-x-auto p-3 font-mono text-xs leading-5" data-testid={`snippet-${side}`}>
      {numbers.map((number) => (
        <div key={number} className={number === line ? `bg-muted ${tone}` : ""} data-marked={number === line}>
          <span className="mr-3 inline-block w-10 text-right text-muted-foreground select-none">{number}</span>
          {lines[number - 1] ?? ""}
        </div>
      ))}
    </pre>
  );
}
