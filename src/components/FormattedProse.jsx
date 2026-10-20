import React from 'react';

/**
 * Parses inline formatting:
 * - **bold**
 * - *italic*
 * - Playing cards like A♠, K♥, 10♦, 9♣
 * - Suits ♥, ♦ (red), ♠, ♣ (black/white)
 */
export const parseInlineFormatted = (text) => {
  if (!text || typeof text !== 'string') return text;

  // Tokenize by bold (**...**), italic (*...*), cards ((10|[2-9]|[AKQJ])[♠♣♥♦]), and standalone suits ([♠♣♥♦])
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|\b(?:10|[2-9]|[AKQJ])[♠♣♥♦]|[♠♣♥♦])/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Bold: **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <strong key={index} className="prose-bold">
          {parseInlineFormatted(inner)}
        </strong>
      );
    }

    // Italic: *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      const inner = part.slice(1, -1);
      return (
        <em key={index} className="prose-italic">
          {parseInlineFormatted(inner)}
        </em>
      );
    }

    // Card mention like A♥, 10♦, 9♠, K♣
    const cardMatch = part.match(/^((?:10|[2-9]|[AKQJ]))([♠♣♥♦])$/);
    if (cardMatch) {
      const rank = cardMatch[1];
      const suit = cardMatch[2];
      const isRed = suit === '♥' || suit === '♦';
      return (
        <span key={index} className={`inline-card-chip ${isRed ? 'card-red' : 'card-black'}`}>
          <span className="chip-rank">{rank}</span>
          <span className="chip-suit">{suit}</span>
        </span>
      );
    }

    // Standalone suit symbols ♥ ♦ ♠ ♣
    if (part === '♥' || part === '♦') {
      return (
        <span key={index} className="suit-red" title={part === '♥' ? 'Hearts' : 'Diamonds'}>
          {part}
        </span>
      );
    }
    if (part === '♠' || part === '♣') {
      return (
        <span key={index} className="suit-black" title={part === '♠' ? 'Spades' : 'Clubs'}>
          {part}
        </span>
      );
    }

    return part;
  });
};

/**
 * FormattedProse:
 * Converts raw markdown-like text into structured, elegant typography:
 * - Numbered lists (1. **Item**: ...)
 * - Bulleted lists (- **Item**: ...)
 * - Subheadings (**Section Title:**)
 * - Formula cards (**Formula:** ...)
 * - Paragraphs with bold and suit highlights
 */
const FormattedProse = ({ content, className = '' }) => {
  if (!content) return null;

  // Split content into lines
  const lines = content.split('\n');
  const renderedBlocks = [];
  let currentList = null; // { type: 'numbered' | 'bulleted', items: [] }

  const flushList = () => {
    if (!currentList) return;
    if (currentList.type === 'numbered') {
      renderedBlocks.push(
        <div key={`list-${renderedBlocks.length}`} className="prose-numbered-list">
          {currentList.items.map((item, idx) => (
            <div key={idx} className="prose-numbered-item">
              <span className="prose-num-badge">{item.num}</span>
              <div className="prose-item-content">
                {item.title && <strong className="prose-item-title">{item.title}</strong>}
                <span className="prose-item-desc">{parseInlineFormatted(item.desc)}</span>
              </div>
            </div>
          ))}
        </div>
      );
    } else if (currentList.type === 'bulleted') {
      renderedBlocks.push(
        <div key={`list-${renderedBlocks.length}`} className="prose-bullet-list">
          {currentList.items.map((item, idx) => (
            <div key={idx} className="prose-bullet-item">
              <span className="prose-bullet-dot">•</span>
              <div className="prose-item-content">
                {item.title && <strong className="prose-item-title">{item.title}</strong>}
                <span className="prose-item-desc">{parseInlineFormatted(item.desc)}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }
    currentList = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Empty line: flush any pending list
    if (!trimmed) {
      flushList();
      return;
    }

    // Numbered List Item: e.g. "1. **Royal Flush**: A-K-Q-J-10 of ..." or "1. Text"
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      const num = numberedMatch[1];
      const rest = numberedMatch[2];

      if (!currentList || currentList.type !== 'numbered') {
        flushList();
        currentList = { type: 'numbered', items: [] };
      }

      // Check if it has a bold title: **Title**: or **Title** -
      const titleMatch = rest.match(/^\*\*([^*]+)\*\*[:\s-]*(.*)$/);
      if (titleMatch) {
        currentList.items.push({
          num,
          title: titleMatch[1] + (rest.includes(':') ? ': ' : ' '),
          desc: titleMatch[2]
        });
      } else {
        currentList.items.push({
          num,
          title: null,
          desc: rest
        });
      }
      return;
    }

    // Bulleted List Item: e.g. "- **Step 1**: ..." or "* Bullet"
    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      const rest = bulletMatch[1];

      if (!currentList || currentList.type !== 'bulleted') {
        flushList();
        currentList = { type: 'bulleted', items: [] };
      }

      const titleMatch = rest.match(/^\*\*([^*]+)\*\*[:\s-]*(.*)$/);
      if (titleMatch) {
        currentList.items.push({
          title: titleMatch[1] + (rest.includes(':') ? ': ' : ' '),
          desc: titleMatch[2]
        });
      } else {
        currentList.items.push({
          title: null,
          desc: rest
        });
      }
      return;
    }

    // Not a list item: flush list if active
    flushList();

    // Standalone Subheading: e.g. "**Common Beginner Confusions Resolved:**" or "### Title"
    const headingMatch = trimmed.match(/^(?:###\s*|\*\*)([^*:]+)(?:\*\*|:|\*\*:)?:?$/);
    if (headingMatch && trimmed.startsWith('**') && trimmed.endsWith('**') || trimmed.startsWith('###')) {
      const headingText = trimmed.replace(/^[#*\s]+|[#*\s:]+$/g, '');
      renderedBlocks.push(
        <h3 key={`h-${index}`} className="prose-subheading">
          {headingText}
        </h3>
      );
      return;
    }

    // Formula or Callout: e.g. "**Pot Odds % = Amount to Call / (Total Pot After You Call)**"
    if (trimmed.startsWith('**') && trimmed.endsWith('**') && (trimmed.includes('=') || trimmed.includes('%'))) {
      const formulaText = trimmed.slice(2, -2);
      renderedBlocks.push(
        <div key={`formula-${index}`} className="prose-formula-card">
          <span className="formula-icon">📐</span>
          <span className="formula-code">{formulaText}</span>
        </div>
      );
      return;
    }

    // Regular Paragraph
    renderedBlocks.push(
      <p key={`p-${index}`} className="prose-paragraph">
        {parseInlineFormatted(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className={`formatted-prose-container ${className}`}>{renderedBlocks}</div>;
};

export default FormattedProse;
