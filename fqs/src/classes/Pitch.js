import { keyTable } from '../utils/keyTable.js';
import { lineProblems } from './LineProblem.js';
import { appendSVGTextChild } from '../utils/svg.js';
import { IntervalCalculator } from './IntervalCalculator.js';
export class Alterations {
  constructor(keysym) {
    this.keyLUT = keyTable[keysym];
    // We allow for incomplete key signatures to avoid raising errors
    // while the user is typing.  If the key signature is invalid, we
    // set the key to "0" (C major) and log a warning.
    if (this.keyLUT === undefined) {
      this.keyLUT = keyTable["0"];
      lineProblems.add("invalid or incomplete keysym: " + keysym);
    }
    this.altered = {}
  }
  setKey = () => {
    this.keyLUT = keyTable[keysym];
  }
  initAltered = () => {
    this.altered = {};
  }
  get = (pitchSym, octave, alteration) => {
    // if alteration is not "?", update the altered table entry with the new
    // alteration and return the alteration
    const pitch = pitchSym + octave;
    if (alteration !== "?") {
      this.altered[pitch] = alteration;
      return alteration
    }
    // Otherwise, the value '?' means we need to look up the pitch in the altered
    // table to see if it has a prior alteration. If it does, return that, otherwise
    // look it up in keyLUT and return the value from that.
    if (this.altered[pitch] !== undefined) {
      return this.altered[pitch];
    }
    return this.keyLUT[pitchSym];
  }
} // end of Alterations class

// The Pitch class is used to render a single pitch. It is instantiated with a
// letter, octave and accidental class. The accidental class is a UTF-8 character
// for natural, sharp, flat, double-sharp or double-flat. The render() method
// draws the pitch letter at the proper x, y location within the svg with the
// color and font specified in the style sheet for its accidental class.
export class Pitch {
  constructor(letter, octave, accidentalClass, fontheight) {
    this.letter = letter;
    this.octave = octave; // octave is an offset relative to a center octave whose value is 0
    this.accidentalClass = accidentalClass; // one of '', '𝄫', '♯', '𝄪' or ''
    this.classes = [accidentalClass, "pitch"];
    this.isChordPitch = false; // initalized to false
  }
  // addClass() is used to add a class to the pitch. At present, this is used to add the
  // 'chord-pitch' class to the pitch when it is part of a chord.
  addClass = (className) => {
    this.classes.push(className);
  }
  // vOffsets is used when rendering pitches. The offsets are fractions of the
  // font height.  Note that svg coordinates increase from the top of the
  // viewport, hence the reverse ordering for the 12 pitch classes. The letter
  // 'f' is empiricaly lowered .6 units to make it appear a little lower than
  // 'g', i.e. to compensate for the visual effect of 'g's descender.
  static vOffsets = {
    "𝄪a": 1, "♮b": 1, "♭c": 13,   // B enharmonics (special case for C♭)
    "♯a": 2, "♭b": 2, "𝄫c": 14,   // B-flat enharmonics (special case for C𝄫)
    "𝄪g": 3, "♮a": 3, "𝄫b": 3,    // A enharmonics
    "♯g": 4, "♭a": 4,              // A-flat enharmonics
    "𝄪f": 5.6, "♮g": 5, "𝄫a": 5,    // G enharmonics
    "𝄪e": 6, "♯f": 6.6, "♭g": 6,    // G-flat enharmonics
    "♯e": 7, "♮f": 7.6, "𝄫g": 7,     // F enharmonics
    "𝄪d": 8, "♮e": 8, "♭f": 8.6,     // E enharmonics
    "♯d": 9, "♭e": 9, "𝄫f": 9.6,    // E-flat enharmonics
    "𝄪c": 10, "♮d": 10, "𝄫e": 10, // D enharmonics
    "𝄪b": -1, "♯c": 11, "♭d": 11, // D-flat enharmonics
    "♯b": 0, "♮c": 12, "𝄫d": 12, // C enharmonics
  }

  // render() is a closure that renders the pitch at the specified x, y coordinates.
  render = (function render(svg, x, y, fontheight) {
    if (this.isChordPitch) {
      this.classes.push("chord-pitch");
    }
    // Draw the pitch at the specified x, y coordinates.
    // Adjust the y coordinate by the octave and vertical offset for this pitch
    y -= this.octave * fontheight;
    const gOffset = 7 // causes the pitch to be rendered as though each staff line is on g natural.
    y += (gOffset + Pitch.vOffsets[this.accidentalClass + this.letter]) * (fontheight / 12);
    appendSVGTextChild(svg, x, y, this.letter, this.classes);
    return y
  });
}
// The PitchLine class is used to render a single line of pitches from a
// text string.  This is the most complicated class in the program as it
// must handle octavation, key signatures, accidentals and alterations and
// match each pitch to its corresponding attack location in the Lyric line.
export class PitchLine {
  constructor(text, staffLines = 4) {
    this.centerOctave = 0;
    this.staffLines = staffLines;
    this.text = text;
    // trim leading or trailing whitespace
    this.text = this.text.trim();
    // split the text on whitespace
    this.beatTokens = text.split(/\s+/);
    // A beat token may contain one or pitch tokens, e.g "c^&d&e"
    // We need to split these into individual pitch tokens. A pitch
    // token is zero or more of [^/] followed by zero or more of [#&%]
    // followed by exactly one of [a-g]. So, for example, "c^&d//&e"
    // would be split into ["^c", "&d", "//&e"]. It's permissible, but
    // not required, to include bar lines in the source to make it a little
    // easier to read and edit. However, omitting bar lines may result
    // in accidentals propagating beyond the bar lines defined in the lyric line.
    this.tokens = [];
    let pitchToken = "";
    for (let i = 0; i < this.beatTokens.length; i++) {
      let beatToken = this.beatTokens[i];
      // Handle key designator of the form "K[#&]?[0-7]".
      // The key designator is optional, so if it's not there, we'll just
      // use the default key of C major.

      if (beatToken.match(/K.*/)) {
        this.tokens.push(beatToken);
        continue
      }
      if (beatToken.match(/:*\|:*/)) {
        this.tokens.push(beatToken);
        continue
      }
      // If the beat token is empty, just skip it.
      if (beatToken.length === 0) {
        continue;
      }
      // Now we split the beat token into individual pitch tokens.
      // let pitchToken = "";
      for (let j = 0; j < beatToken.length; j++) {
        if (beatToken == '|' || beatToken == '|:' || beatToken[j] == ':|') {
          this.tokens.push(beatToken)
        } else if (beatToken[j].match(/\(/)) {
          pitchToken += beatToken[j];
        } else if (beatToken[j].match(/[\^\/]/)) {
          pitchToken += beatToken[j];
        } else if (beatToken[j].match(/[#&%]/)) {
          pitchToken += beatToken[j];
        } else if (beatToken[j].match(/[a-g]/)) {
          pitchToken += beatToken[j];
          this.tokens.push(pitchToken);
          pitchToken = "";
        } else if (beatToken[j].match(/\)/)) {
          pitchToken += beatToken[j];
        } else {
          //throw new Error("Invalid pitch token: " + beatToken);
          lineProblems.add("Invalid pitch token: " + beatToken);
        }
      }
    }


    // Next we parse the tokens into an array of pitch objects.
    // The octave of each pitch depends on the prior pitch. To
    // begin, we let the prior pitch be C natural on the center
    // octave.
    let prevPitch = new Pitch("c", this.centerOctave, "");
    // A pitch token always ends with a letter in [a-g].
    // It may optionally be preceded by at most one of the following accidentals
    // "##", "&&", "#", "&", or '%'.
    // where ## is double-sharp, && is double-flat, # is sharp, and & is flat.
    // The accidentals and letter are optionally preceded by octavation marks, `^ ` and ` / `.
    // It is an error to mix '^`' and ' / ' in a single pitch token. It is also an
    // error if the octave marks cause the new octave be less than -3 or greater than 3.
    // The following are all valid pitch tokens:
    // 'g', '#f', '^b', '//&d', '&&f'
    // The following are all invalid pitch tokens:
    // 'h', '###f', '#&g', '^/a'
    this.pitches = [];
    this.inChord = -1;
    this.chordIndex = 0;
    this.alterations = new Alterations("0"); // default key is C major
    for (let i = 0; i < this.tokens.length; i++) {
      // Skip position calculation for underscore tokens
      if (this.tokens[i] === '_') {
        continue;
      }
      // Handle key designator of the form "K(0|[#&]?[1-7])".
      if (this.tokens[i].match(/K/)) {
        this.alterations = new Alterations(this.tokens[i].slice(1));
        continue;
      }
      // If the pitch token begins with a ')', we're ending a chord.
      if (this.tokens[i].match(/\)/)) {
        this.inChord = -1;
        this.chordIndex = 0;
        // remove the ')' from the token
        this.tokens[i] = this.tokens[i].slice(1);

      }
      // If the pitch token begins with a '(', we're starting a chord.
      if (this.tokens[i].match(/\(/)) {
        this.inChord = 1;
        // remove the '(' from the token
        this.tokens[i] = this.tokens[i].slice(1);

      }
      // first, get the pitch letter from the token
      // it's the last char in the token. It's an error if the token is empty
      // or if the token does not end with a letter in [a-g]
      let token = this.tokens[i];
      if (token.length === 0) {
        // throw new Error("Empty pitch token");
        lineProblems.add("Empty pitch token");
      }
      if (token == "|" || token == "|:" || token == ":|") {
        this.alterations.initAltered();
        continue
      }
      let letter = token[token.length - 1];
      if (!letter.match(/[a-g]/)) {
        // throw new Error("Invalid pitch token: " + token);
        lineProblems.add("Invalid pitch token: " + token);
      }
      // Next we compare the pitch letter to the previous pitch
      // letter and apply the Lilypond rule of fourths to
      // determine if the pitch will be above or below the
      // previous pitch. The rule of fourths is a way to default
      // to the closest pitch to the previous one. It states that
      // we must choose the pitch which is within a musical 4th of
      // the previous pitch.  Thus, if the previous pitch is 'g'
      // in octave 4 and the current pitch letter is 'f', we
      // should choose the 'f' in octave 4 rather than 'f' in
      // octave 5.  Similarly if the previous pitch is 'g' in
      // octave 4 and the current pitch letter is 'c', we should
      // choose the 'c' in octave 5 rather than 'c' in octave 4
      // because that is the closest.

      // get the pitch letter of the previous pitch
      let prevLetter = prevPitch.letter;
      // get the octave of the previous pitch
      let prevOctave = prevPitch.octave;
      // Make a map of pitch letters:
      let PitchMap = new Map([
        ["c", 0],
        ["d", 1],
        ["e", 2],
        ["f", 3],
        ["g", 4],
        ["a", 5],
        ["b", 6]
      ]);
      // get the pitch letter index of the previous pitch
      let prevLetterIndex = PitchMap.get(prevLetter);
      // get the pitch letter index of the current pitch
      let letterIndex = PitchMap.get(letter);
      // Subtract the indices
      let diff = letterIndex - prevLetterIndex;
      // If the difference is positive and less than 4, the current pitch is
      // above the previous pitch in the same octave. If the difference is positive
      // and greater than 3, the current pitch is below the previous pitch in the next octave down.
      let octave = prevOctave;
      if (this.chordIndex <= 0) {
        if (diff > 0 && diff > 3) {
          // the current pitch is below the previous pitch in the next octave down
          // so decrement the octave (unless we're in a chord)
          octave--;
        } else if (diff < 0 && diff < -3) {
          // the current pitch is above the previous pitch in the previous octave up
          // so increment the octave
          octave++;
        }
      } else {
        // Chords are by default in ascending order. If the diff is non-negative
        // stay in the same octave. Otherwise, increment the octave.
        if (diff <= 0) {
          octave++
        }
      }
      // Now we must account for octave marks, if any.	
      let kind = "";
      let j = 0;
      let done = false;
      while (j < token.length) {

        switch (token[j]) {
          case "^":
            if (kind === "/") {
              // throw new Error("Invalid pitch token: " + token);
              lineProblems.add("Invalid pitch token: " + token);
            }
            octave++;
            kind = "^";
            break;
          case "/":
            if (kind === "^") {
              // throw new Error("Invalid pitch token: " + token);
              lineProblems.add("Invalid pitch token: " + token);
            }
            octave--;
            kind = "/";
            break;
          default:
            done = true;
            break;
        }
        if (done) break;
        j++;
      }
      // Index j now points to the first accidental, if any
      kind = null;
      let count = 0;
      while (j < token.length && token[j].match(/[#&%]/)) {
        if (token[j] === "#") {
          if (kind === "&" || kind === "%") {
            //throw new Error("Invalid pitch token: " + token);
            lineProblems.add("Invalid pitch token: " + token);
          }
          kind = "#";
          count++;
        } else if (token[j] === "&") {
          if (kind === "#" || kind === "%") {
            //throw new Error("Invalid pitch token: " + token);
            lineProblems.add("Invalid pitch token: " + token);
          }
          kind = "&";
          count++;
        } else if (token[j] === "%") {
          if (kind === "#" || kind === "&") {
            //throw new Error("Invalid pitch token: " + token);
            lineProblems.add("Invalid pitch token: " + token);
          }
          kind = "%";
          count++;
        }
        j++
      }
      if (count > 2) {
        //throw new Error("Invalid pitch token: " + token);
        lineProblems.add("Invalid pitch token: " + token);
      }
      // Use kind and count to assign an accidental class, the create a new pitch object
      // and add it to the pitches array and designate it as the new previous pitch.
      let accClass = null;
      switch (kind) {
        case "#":
          if (count === 1) {
            accClass = "♯"; // sharp
          } else {
            accClass = "𝄪"; // double sharp
          }
          break;
        case "&":
          if (count === 1) {
            accClass = "♭"; // flat
          } else {
            accClass = "𝄫"; // double flat
          }
          break;
        case "%":
          accClass = "♮"; // natural
          break;
        default:
          accClass = "?"; // to be determined
      }
      // TODO deal properly with key signatures and persistence of
      // accidentals for remainder of the bar.
      accClass = this.alterations.get(letter, octave, accClass);
      let pitch = new Pitch(letter, octave, accClass);
      if (this.inChord > -1) {
        pitch.isChordPitch = true;
        this.chordIndex++
        // pitch.addClass('chord-pitch');
      }
      this.pitches.push(pitch);
      // console.log(letter, octave, accClass)
      prevPitch.letter = letter;
      prevPitch.octave = octave;
    }
    this.intervals = [];
    this.calculator = new IntervalCalculator();
  }
  calculateIntervals() {
    for (let i = 0; i < this.pitches.length - 1; i++) {
      this.intervals.push(
        this.calculator.calculateInterval(
          this.pitches[i],
          this.pitches[i + 1]
        )
      );
    }
  }
  // render draws the staff, the barlines, and the pitches.
  render = (function (svg, x0, y0, bookParms, lyricLine, showIntervals) {
    // x0 is the x coordinate of the left edge of the line
    // y0 corresponds to the baseline of the center octave (0)
    const fontheight = bookParms.lyricFontHeight;
    const fontwidth = bookParms.lyricFontWidth;
    const attacks = lyricLine.attacks;
    const rests = lyricLine.rests;
    const holds = lyricLine.holds;
    const bars = lyricLine.bars;
    // Draw the lines of the staff
    const ylines = [];
    for (let i = 0; i < this.staffLines; i++) {
      if (i === 0) {
        // ylines.push(y0 + 2 * fontheight);
        ylines.push(y0);
      } else {
        ylines.push(ylines[i - 1] - fontheight);

      }
    }
    const yline0 = ylines[0];
    const xend = x0 + fontwidth * (0.5 + bars[bars.length - 1]); // extend line to last barline
    for (let y of ylines) {
      let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x0);
      line.setAttribute("y1", y);
      line.setAttribute("x2", xend);
      line.setAttribute("y2", y);
      line.setAttribute("stroke", "lightgray");
      line.setAttribute("stroke-width", 0.5);
      svg.appendChild(line);
    };
    // Now draw barlines
    for (let xBar of bars) {
      if (xBar === 0) continue;
      let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      let x = x0 + (xBar + 0.5) * fontwidth;
      line.setAttribute("x1", x);
      line.setAttribute("y1", ylines[ylines.length - 1]);
      line.setAttribute("x2", x);
      line.setAttribute("y2", yline0);
      line.setAttribute("stroke", "lightgray");
      line.setAttribute("stroke-width", 0.5);
      svg.appendChild(line);
    }
    // Loop through the pitches and render them at the corresponding 
    // attack locations. It is not an error if the number of pitches
    // is not equal to the number of attack locations because we may
    // be updating the rendered pitches while the user is editing.
    let i = 0;
    this.fingerPositions = [];
    this.intervalPositions = [];
    for (let pitch of this.pitches) {
      let x = x0;
      let y = y0 - 2 * fontheight;
      if (i < attacks.length) {
        x = x0 + attacks[i] * fontwidth;
        const ypitch = pitch.render(svg, x, y, fontheight);
        // save x,y positions for finger numbers
        this.fingerPositions.push([x, ypitch - fontheight])
        // save x,y positions for interval  numbers
        this.intervalPositions.push([x + fontwidth / 2, ypitch])
      }
      i++;
    }
    const ycenter = (yline0 + ylines[ylines.length - 1]) / 2;
    // Now render the rests
    for (let rest of rests) {
      let x = x0;
      let y = ycenter; // rests are rendered in the middle of the staff
      x = x0 + rest * fontwidth;
      appendSVGTextChild(svg, x, y, ";", ["rest", "yellowish"]);
    };
    // Now render the holds
    for (let hold of holds) {
      let x = x0;
      let y = ycenter; // holds are rendered in the middle of the staff
      x = x0 + hold * fontwidth;
      appendSVGTextChild(svg, x, y, '-', ["hold", "grey"]);
    }// Now render intervals between the pitches
    if (showIntervals) {
      this.calculateIntervals();
      const yadjust = fontheight / 2;
      const xadjust = fontwidth / 2;
      for (let i = 0; i < this.intervals.length; i++) {
        const interval = this.intervals[i];
        const x = this.intervalPositions[i][0];
        const y = this.intervalPositions[i][1];

        // Format interval text: number plus direction arrow
        const intervalText = `${interval.number}`

        // Apply appropriate interval quality class for styling
        const classes = ['interval', `${interval.quality}-interval`];

        appendSVGTextChild(svg, x + xadjust, y + yadjust, intervalText, classes);
      }
    }

  });
}
