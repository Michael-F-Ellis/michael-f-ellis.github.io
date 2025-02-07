import { appendSVGTextChild } from "./svg.js";
export function normalizeBarlines(text) {
  let normalized = "";
  // Add final barline if missing (text doesn't end with '|' after trimming)
  if (!normalized.trim().endsWith('|')) {
    normalized = normalized.trim() + ' |';
  }
  // Next ensure all barlines have one space before and after
  normalized = text.replace(/\s*\|\s*/g, ' | ');

  // Trim any space after the final barline
  return normalized.trim();
}

// countLeadingSpaces returns the number of leading spaces in the line.
// It's needed by renderMultiline() because SVG text elements ignore leading
// whitespace.
function countLeadingSpaces(line) {
  let i = 0;
  while (line[i] === ' ') {
    i++;
  }
  return i;
}

export function renderMultiline(svg, x, y, text, fontHeight, className) {
  const lines = text.split('\n');

  lines.forEach(line => {
    // We support a single '.' as a blank line indicator
    if (line.trimEnd() === '.') {
      y += fontHeight;
      return
    }
    const dx = countLeadingSpaces(line) * fontHeight * 0.5 // assume fontwidth is half of font height
    // get the fontSize of the textElement
    appendSVGTextChild(svg, x + dx, y, line.trimEnd(), [className]);
    y += fontHeight
  });

  return y;
}
