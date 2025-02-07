import { appendSVGTextChild } from "../utils/svg.js";
import { defaultParameters } from "../utils/parameters.js";
class LineAnnotations {
  constructor(lyricLine, y0, cssClasses, fingerPositions = null) {
    this.lyricLine = lyricLine;
    this.y0 = y0;
    this.cssClasses = cssClasses;
    this.bars = lyricLine.bars;
    this.beats = lyricLine.beats;
    this.attacks = lyricLine.attacks;
    this.fingerMap = new Map();
    this.fingerPositions = fingerPositions;
    if (fingerPositions) {
      for (let finger of fingerPositions) {
        this.fingerMap.set(finger[0], finger[1]); // x keys y value
      }
    }
    this.isFingered = this.fingerMap.size > 0;
    // merge the bars and attacks array into one array by concatenating
    // the two arrays and sorting the result.
    this.positions = this.bars.concat(this.attacks).sort((a, b) => a - b);
  }

  nextBar(pos) {
    // return the position of the next barline after the current position
    // Add a lineProblem and return the pos unchanged if were at the last bar already.
    for (let i = 0; i < this.bars.length; i++) {
      let p = this.bars[i];
      if (p > pos) {
        //console.log(`next bar at ${p}`)
        return p
      }
    }
    lineProblems.add("Already at last bar position")
    return pos;
  }

  nextBeat(pos) {
    for (let i = 0; i < this.beats.length; i++) {
      let p = this.beats[i];
      if (p > pos) {
        // console.log(`next beat at ${p}`)
        return p
      }
    }
    lineProblems.add("Already at or past last beat position");
    return pos;
  }
  nextNote(pos) {
    for (let i = 0; i < this.attacks.length; i++) {
      let p = this.attacks[i];
      if (p > pos) {
        // console.log(`next note at ${p}`)
        return p
      }
    }
    lineProblems.add("Already at or past last note position");
    return pos;
  }
  nearestFingerY(x) {
    // return the y coordinate of the nearest finger position
    // to the given x coordinate.
    let nearest = null;
    let minDistance = Infinity;
    for (let [x0, y0] of this.fingerPositions) {
      let d = Math.abs(x0 - x);
      if (d < minDistance) {
        minDistance = d;
        nearest = y0;
      }
    }
    return nearest;
  }
  render(svg, x0, text, step) {
    if (!['bar', 'beat', 'note'].includes(step)) {
      throw new Error(`Invalid step: ${step} : must be one of 'bar', 'beat', or 'note'`);
    }
    const tokens = text.trim().split(/\s+/);
    let pos = 0;

    tokens.forEach(token => {
      switch (token) {
        case "|":
          pos = this.nextBar(pos);
          switch (step) {
            case 'beat':
              pos = this.nextBeat(pos)
              break;
            case 'note':
              pos = this.nextNote(pos)
              break
          }
          break;
        case "_":
          switch (step) {
            case 'bar':
              pos = this.nextBar(pos);
              break;
            case 'beat':
              pos = this.nextBeat(pos)
              break
            case 'note':
              pos = this.nextNote(pos);
              break;
          }
          break;
        default:
          let x = x0;
          x += pos * defaultParameters.lyricFontWidth;
          // Replace underscores with spaces in the rendered text
          let y = this.y0
          if (this.isFingered) {
            y = this.nearestFingerY(x)
          }
          appendSVGTextChild(svg, x, y, token.replace(/_/g, ' '), this.cssClasses);
          // Move to next step position if one is available
          switch (step) {
            case 'bar':
              if (pos < this.bars[this.bars.length - 1]) {
                pos = this.nextBar(pos);
              }
              break;
            case 'beat':
              if (pos < this.beats[this.beats.length - 1]) {
                pos = this.nextBeat(pos);
              }
              break;
            case 'note':
              if (pos < this.attacks[this.attacks.length - 1]) {
                pos = this.nextNote(pos);
              }
              break;
            default:
              break;
          }
          break;
      }
      // console.log(token, pos);
    });
  }
}

export class PerBar {
  constructor(text) {
    this.text = text;
  }
  render(svg, x0, y0, lyricLine) {
    const annotations = new LineAnnotations(lyricLine, y0, ['perbar']);
    annotations.render(svg, x0, this.text, 'bar');
  }
}

export class PerBeat {
  constructor(text) {
    this.text = text;
  }
  render(svg, x0, y0, lyricLine) {
    const annotations = new LineAnnotations(lyricLine, y0, ['perbeat']);
    annotations.render(svg, x0, this.text, 'beat');
  }
}

export class PerNote {
  constructor(text) {
    this.text = text;
  }
  render(svg, x0, y0, lyricLine) {
    const annotations = new LineAnnotations(lyricLine, y0, ['pernote']);
    annotations.render(svg, x0, this.text, 'note');
  }
}

// The  Finger class is used to render fingerings. It is almost identical to the PerNote class.
// except that it adds a small fudge to the x position to make the tiny font
// align better with the pitch letters. 
export class Finger {
  constructor(lyricLine, pitchLine) {
    this.lyricLine = lyricLine
    this.positions = pitchLine.fingerPositions;
  }
  render(svg, text) {
    const annotations = new LineAnnotations(
      this.lyricLine,
      0, // not needed
      ['fingering'],
      this.positions);
    annotations.render(svg, defaultParameters.leftX, text, 'note');
  }
}
