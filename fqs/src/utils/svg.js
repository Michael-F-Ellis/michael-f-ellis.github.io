// appendSVGTextChild(svg, x, y, textContent, classList) adds a text element
// to the svg element with the given x, y coordinates and textContent. The
// classList argument is an array of class names to be added to the text
// element. The text element is returned.
export function appendSVGTextChild(svg, x, y, textContent, classList) {
  const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textEl.setAttribute("x", x);
  textEl.setAttribute("y", y);
  textEl.textContent = textContent;
  // Check if this is a chord pitch or the pencil icon.
  if (classList.includes('chord-pitch')) {
    // rotate 20 degrees counterclockwise
    textEl.setAttribute("transform", `rotate(340, ${x}, ${y})`);
  } else if (classList.includes('pencil-icon')) {
    // rotate 90 degrees clockwise
    textEl.setAttribute("transform", `rotate(90, ${x}, ${y})`);
  }
  if (classList) {
    textEl.classList.add(...classList);
  }
  svg.appendChild(textEl);
  return textEl;
}

export function appendSVGLineChild(svg, x0, y0, x1, y1, classList) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x0);
  line.setAttribute("y1", y0);
  line.setAttribute("x2", x1);
  line.setAttribute("y2", y1);
  if (classList) {
    line.classList.add(...classList);
  }
  svg.appendChild(line);
  return line;
}
