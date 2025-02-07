import { defaultParameters } from "../utils/parameters.js";
import { appendSVGTextChild } from "../utils/svg.js";
// The LineProblem class holds error and warning messages generated during
// rendering of a score. It has a render method that will render the messages
// into the SVG element immediately below the line where the problems were
// encountered.
export class LineProblem {
  constructor() {
    this.messages = []
  }
  add = (function (message) {
    this.messages.push(message);
  });
  clear = (function () {
    this.messages = [];
  });
  render = (function (svg, x0, y0) {
    // Draw each message in this.messages starting at x0, y0 and incrementing y
    // by bookParameters.problemFontHeight for each message.
    let y = y0;
    this.messages.forEach((function (message) {
      y += 1.1 * defaultParameters.lineproblemFontHeight;
      appendSVGTextChild(svg, x0, y, "⚠️" + message, ["lineproblem"]);
    }));
    return y
  });
} // end of LineProblem class 
export const lineProblems = new LineProblem();
