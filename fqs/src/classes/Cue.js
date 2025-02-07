import { appendSVGTextChild } from "../utils/svg.js";
// The Cue class is used render cue text in the style specified in the style sheet.
export class Cue {
  constructor(text) {
    this.text = text;
  }
  render = (function (svg, x0, y0) {
    // x0 is the x coordinate of the left edge of the line
    // y0 is the y coordinate of the base line of the cue
    appendSVGTextChild(svg, x0, y0, this.text, ["cue"]);
  });
} // end Cue class
