import { getSmartSnippet, splitByKeywords } from "../utils/highlight.ts";

interface HighlightedTextProps {
  content: string;
  keywords: string[];
  maxLength?: number;
}

export function HighlightedText({ content, keywords, maxLength = 120 }: HighlightedTextProps) {
  const snippet = getSmartSnippet(content, keywords, maxLength);
  const parts = splitByKeywords(snippet.text, keywords);

  return (
    <span>
      {snippet.hasEllipsisBefore && <span className="text-[var(--text-muted)]">...</span>}
      {parts.map((part, index) =>
        part.isKeyword ? (
          <mark
            key={index}
            className="bg-[var(--highlight-bg)] text-[var(--highlight-text)] px-0.5"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
      {snippet.hasEllipsisAfter && <span className="text-[var(--text-muted)]">...</span>}
    </span>
  );
}
