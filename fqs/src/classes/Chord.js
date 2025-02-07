import { appendSVGTextChild } from "../utils/svg.js";
// The Chord class is used to render chords symbols above beats.
export class Chord {
  constructor(text) {
    this.text = text;
    // Trim the text and split on whitespace
    this.tokens = this.text.trim().split(/\s+/);
    // Replace common abreviations with symbols, e.g. "maj" with "△"
    // so that, for example, "Cmaj7" will render as "C△7"
    this.tokens = this.tokens.map(token => {
      return token.replace(/m7b5/, "ø7")
        .replace(/-7b5/, "ø7")
        .replace(/maj7/, "△7")
        .replace(/min/, "m")
        .replace(/m/, "m")
        .replace(/dim/, "°")
        .replace(/aug/, "+")
        .replace(/7b9/, "7♭9")
        .replace(/b/, "♭")
        .replace(/#/, "♯")
        .replace(/\//, "/")
    });
  }
  render = (function (svg, x0, y0, beats, fontwidth) {
    // x0 is the x coordinate of the left edge of the line
    // y0 is the y coordinate of the baseline of the line
    // fontwidth is the width of the lyric font in pixels.
    // (the chord font will typically be larger than the lyric font)
    // As with the Pitch class, we will render the expression
    // by looping through the tokens and rendering each one
    // at the next beat from the lyric line. Before rendering,
    // we split the chord tokens into the root and the chord text,
    // e.g. "Cmaj7" will be split into ["C", "maj7"]. The chord
    // text is rendered in a smaller font than the root.
    // Note, at present I'm using a couple of fudge factors to
    // get the chord text to render correctly. This is not ideal
    // and should be replaced with a more robust solution.
    const xfudge = 1.2 * fontwidth // px
    const yfudge = 4 // px
    let i = 0;
    for (let token of this.tokens) {
      const root = token[0]
      const chtext = token.slice(1)
      let x = x0;
      let y = y0;
      if (i < beats.length) {
        x = x0 + beats[i] * fontwidth;
        // replace any underscores with spaces
        appendSVGTextChild(svg, x, y, root.replace(/_/g, " "), ["chord"]);
        if (root != "_") {
          x += xfudge;
          appendSVGTextChild(svg, x, y, chtext, ["chord-text"]);
        }
      }
      i++;
    }
  })
}
