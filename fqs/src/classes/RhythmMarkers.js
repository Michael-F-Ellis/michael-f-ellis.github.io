import { appendSVGTextChild, appendSVGLineChild } from "../utils/svg.js";
import { defaultParameters } from "../utils/parameters.js";
import { lineProblems } from "./LineProblem.js";
// The FracSpan class is used to represent a fraction. It is used by the
// RhythmMarkers class to represent the subbeats within a beat and span (the number
// of rendered char positions comprising the fraction.
class FracSpan {
  constructor(value, span, kind = '*') {
    this.val = value;
    this.span = span;
    this.kind = kind; // one of attack '*', hold '-', or rest ';'
  }
}
export class RhythmMarkers {
  // The purpose of this class is to draw a group of vertical lines whose x
  // coordinates are aligned with the beat notation and having lengths
  // proportional to the subbeats within the beat.  For example, "*-**" will be
  // represented numerically as [0.5, 0.25, 0.25] because the first attack is
  // sustained for 2 of the four subbeats. 
  constructor(lyricLine) {
    this.lyricLine = lyricLine;
    // rhythm is an array of rhythm markup,  as created by LyricLine.extractRhythm()`
    this.rhythms = lyricLine.extractRhythm();
    this.beatFractions = []; // an array of arrays of FracSpan objects
    for (let i = 0; i < this.rhythms.length; i++) {
      const rhythm = this.rhythms[i];
      const baseFraction = this.computeBaseFraction(rhythm);
      //console.log(`baseFraction: ${baseFraction}`);
      // strip underscores from rhythm
      const rhythmNoUnderscores = rhythm.replace(/_/g, '');
      const fractions = [];
      const nchar = rhythm.length;
      let chordIndex = -1; // -1  means not in a chord
      let f = null; // current beat fraction
      for (let j = 0; j < nchar; j++) {
        switch (rhythmNoUnderscores[j]) {
          case '(':
            chordIndex = 0;
            continue;
          case ')':
            f.span = chordIndex;
            chordIndex = -1;
            continue;
          case '-':
            if (j == 0) {
              f = new FracSpan(baseFraction, 1, '-');
            } else {
              f.val++;
            }
            continue;
          case '*':
          case ';':
            switch (chordIndex) {
              case -1:
                if (f) {
                  fractions.push(f);
                }
                f = new FracSpan(baseFraction, 1, rhythm[j]);
                break;
              case 0:
                f = new FracSpan(baseFraction, 1, rhythm[j]);
                chordIndex++;
                break;
              default:
                // ignore attacks in chords after the first  one.
                chordIndex++;
                break
            }
            continue;
        }
      }
      // push the last fraction
      fractions.push(f);
      for (let fraction of fractions) {
        // console.log(fraction);
      }
      // divide each fraction by the sum of fractions

      //const sum = fractions.reduce((a, b) => a + b.val, 0);
      const sum = fractions.reduce((a, b) => a + b.val / baseFraction, 0);
      for (let j = 0; j < fractions.length; j++) {
        fractions[j].val = fractions[j].val / sum;
      }

      this.beatFractions.push(fractions);
    }
    // We may need to adjust the spans of the beat fractions that
    // correspond lyric line syllables with length > 1.
    const spans = this.lyricLine.syllableSpans();
    // console.log(`Syllable spans: ${spans}`)
    if (spans.length > 0) {
      let iSpan = 0;
      for (let arr of this.beatFractions) {
        for (let frac of arr) {
          if (iSpan < spans.length) {
            frac.span = spans[iSpan];
            iSpan++;
          } else {
            console.log(`Warning: too many syllables in lyric line ${this.lyricLine.lyric}`);
          }
        }
      }
    }
  }
  computeBaseFraction(rhythm) {
    // Count effective positions, treating chords as single positions
    let activePositions = 0;
    let underscores = 0;
    let inChord = false;
    for (let j = 0; j < rhythm.length; j++) {
      if (rhythm[j] === '(') {
        inChord = true;
        activePositions++;
      } else if (rhythm[j] === ')') {
        inChord = false;
      } else if (rhythm[j] === '_') {
        underscores++;
      } else if (!inChord && rhythm[j] !== '_') {
        activePositions++;
      }
    }
    if (activePositions === 0) {
      console.log(`Warning: rhythm ${rhythm} has no active positions`);
      lineProblems.add(`Invalid rhythm ${rhythm}`);
      return null;
    }
    return activePositions / (underscores + activePositions)
  }
  render(svg, x0, y0, beats, fontwidth) {
    // x0 is the x coordinate of the left edge of the line 
    // y0 is the y coordinate of the baseline of the line.
    // beats is an array of beat x positions,
    // and fontwidth is the width of the lyric font in pixels. 
    // We will render the rhythm markers by looping through the beats and and
    // drawing a line for each beatFraction.  The length of each line will be
    // proportional to the fraction of the beat and scaled so that the lines
    // will fit within two fontwidths.
    let i = 0;
    const fh = defaultParameters.lyricFontHeight
    const width = fontwidth / 4; // marker width is 1/4 of font width
    for (let fractions of this.beatFractions) {
      let nBeats = this.lyricLine.tuplets[i].tupletSize
      let x = x0 + beats[i] * fontwidth;
      let xb0 = x; let xb1 = x; // left and right ends of the beat
      let y = y0 - fh;
      let height = 0;
      for (let fraction of fractions) {
        height = fraction.val * fh * nBeats;
        height = Math.min(height, fh);
        switch (fraction.kind) {
          case '*':
            appendSVGLineChild(svg, x, y, x, y + height, ["pitch-marker"]);
            break;
          case '-':
            appendSVGLineChild(svg, x, y, x, y + height, ["hold-marker"]);
            break;
          case ';':
            appendSVGLineChild(svg, x, y, x, y + height, ["rest-marker"]);
            break;
        }
        xb1 = x + width - 1;
        x += fraction.span * fontwidth
      }
      // Now draw a thin connector line across the top of the rhythm markers
      // for the beat.
      appendSVGLineChild(svg, xb0, y, xb1, y, ["rhythm-connector"]);
      if (nBeats > 1) {
        // Draw the beat count just to left of the connector line
        appendSVGTextChild(svg, xb0 - 6, y + 8, nBeats, ["pernote", "red"]);
      }
      i++;
    }
  }
}
