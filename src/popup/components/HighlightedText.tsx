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
      {snippet.hasEllipsisBefore && <span className="text-gray-400 dark:text-gray-500">...</span>}
      {parts.map((part, index) =>
        part.isKeyword ? (
          <mark
            key={index}
            className="bg-yellow-200 dark:bg-yellow-700 text-gray-900 dark:text-gray-100 rounded px-0.5"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
      {snippet.hasEllipsisAfter && <span className="text-gray-400 dark:text-gray-500">...</span>}
    </span>
  );
}
