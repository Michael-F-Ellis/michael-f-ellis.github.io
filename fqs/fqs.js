function initYouTubeAPI() {
  let tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  tag.onload = () => {
    console.log('YouTube IFrame API script loaded');
  };
  let firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}
// Minimal player initialization. This implementation avoids third-party cookie issues.
// See https://stackoverflow.com/a/64444601/426853
let player;
function onYouTubeIframeAPIReady() {
  console.log('YouTube IFrame API ready');
  player = new YT.Player('player', {
    height: '0',
    width: '0',
    videoId: '',
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      'playsinline': 1,
      origin: window.location.host
    }
  });
}

const scoreMap = new Map();
let isDirty = false; // global flag that is set when we edit a score and cleared when export the scores
const bookParameters = {
  // bookParameters control the behavior of the score editor and display.
  leftX: 16, // Pixel position of the left edge of the score.
  sideBySide: true, // if true, render scores side-by-side with edit area
  barlineRgx: /:?\|:?/, // regular expression to match barlines
  lyricRgx: /[\p{L}']/u, // regular expression to match lyric alpha characters and apostrophes
  "lyricFontWidth": 7, // includes space between letters
  // Various font size parameters are are added to this object at runtime by 
  // by the updateFontSizes() function in this file. These are needed by the functions
  // that render the scores. If you need to change the font size, you should do so 
  // in the style tag in this file with id "fqs-style".
}


// appendSVGTextChild(svg, x, y, textContent, classList) adds a text element
// to the svg element with the given x, y coordinates and textContent. The
// classList argument is an array of class names to be added to the text
// element. The text element is returned.
function appendSVGTextChild(svg, x, y, textContent, classList) {
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

// The LineProblem class holds error and warning messages generated during
// rendering of a score. It has a render method that will render the messages
// into the SVG element immediately below the line where the problems were
// encountered.
class LineProblem {
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
      y += 1.1 * bookParameters.lineproblemFontHeight;
      appendSVGTextChild(svg, x0, y, "⚠️" + message, ["lineproblem"]);
    }));
    return y
  });
} // end of LineProblem class 
// instantiate a singleton LineProblem to be used by all rendering operations
const lineProblems = new LineProblem();

// The LyricLine class interprets the text of a lyric line and
// and determines the location of beats, attacks and barlines.
// It provides a render() method that will render the lyric line
// into an svg element. The tight and show arguments control the
// spacing of the rendered score. We need both of these to handle
// the distinction music line groups (which never show lyrics)
// pitch plus lyric groups where lyrics are shown and tight is
// ignored.
class LyricLine {
  constructor(text, tight, show) {
    // trim leading or trailing whitespace
    // split the text on whitespace
    // join the text back together with single spaces
    this.words = text.trim().split(/\s+/);
    this.text = this.words.join(" ");
    // Create an array of attack indices. An attack is an alpha character [a-zA-Z]
    // that is preceded by a any of the following:
    //   a space,
    //   a left parenthesis '(',
    //   the beginning of the text,
    //   a dash '-',
    //   a period '.', or
    //   an asteri
    // We need to store the indices of the attacks in the text as well as
    // the indices of the beats and barlines. We use these indices to
    // position pitch symbols and annotations.
    // A beat begins with a space (or the beginning of the text)
    // followed by an alpha character [a-zA-Z], a dash '-', a rest ';' or an asterisk '*'.
    // We also support chords. If the the left parenthesis that begins a chord
    // is preceded by a space (or the beginning of the text), that is also
    // a beat start.
    this.beats = []; // beat positions
    this.bars = [0,]; // barline positions
    this.attacks = [];
    this.rests = []
    this.tight = tight;
    this.showLyric = show;
    // Call this closure to detect a beat and push its position
    const detectAndPushBeat = (i, pos) => {
      if (i == 0 || (this.text[i - 1] == " ")) {
        this.beats.push(pos);
        return;
      }
      if ((this.text[i - 1] == '(') && (i == 1 || (this.text[i - 2] == ' '))) {
        this.beats.push(pos);
      }
    }
    // loop over the lyric text, detecting the positions of attacks, beats,
    // rests and barlines.
    let pos = 0; // position index
    for (let i = 0; i < this.text.length; i++) {
      const c = this.text[i];
      switch (c) {
        case " ":
          // Spaces advance pos only if tight is false or show is true.
          if (!tight || show) {
            pos++
          }
          continue;
        case "(":
          // ignore left parenthesis. Don't advance pos.
          continue;
        case ")":
          // ignore right parenthesis. Don't advance pos.
          continue;
        case "|":
          // barlines are never attacks or beat starts
          this.bars.push(pos);
          pos++
          continue;
        case "-":
          // a dash is never an attack but it may be a beat start.
          detectAndPushBeat(i, pos);
          pos++;
          continue;
        case ";":
          this.rests.push(pos);
          // a rest is never an attack but it may be a beat start.
          detectAndPushBeat(i, pos);
          pos++;
          continue;
        case ".":
          // a period is indicates that the next character is an attack
          // within a beat.  We check for that in the lyric regex case, so
          // we don't need to do anything here except advance pos.
          pos++
          continue;
        case "*":
          // an asterisk is always an attack. It is also a beat start if
          // it is preceded by a space (or the beginning of the text) or
          // a space followed by a left parenthesis, i.e. " ("
          this.attacks.push(pos);
          detectAndPushBeat(i, pos);
          pos++;
          continue;
        default:
          // Handle lyric characters (including pitch characters).
          if (c.match(bookParameters.lyricRgx)) {
            if (!show) {
              // This lyric is synthesized from the a music line. The only chars
              // that match lyricRgx will be /[a-g]/. These chars are always attacks
              // in this situation. 
              this.attacks.push(pos);
              detectAndPushBeat(i, pos);
            } else { // we are showing the lyric
              if (i == 0 || (this.text[i - 1].match(/[\(\s\-.;\*]/))) {
                this.attacks.push(pos);
                detectAndPushBeat(i, pos);
              }
            }
            pos++
          }
      }
    }
    console.log("\ntext: " + this.text)
    console.log("bars: " + this.bars)
    console.log("beats: " + this.beats)
    console.log("attacks: " + this.attacks)
    console.log("rests: " + this.rests)
  }

  extractRhythm = (function () {
    // Extract the rhythm from the text of the lyric line.
    // The rhythm is the sequence of subdivided beat texts
    // The rhythm is returned as an array of strings of beats, e.g. 
    // "foo.bar - ;baz * |n" would return ["**", "-", ";*", "*"]
    let rhythm = [];
    // parse each each element of this.words, substituting '*' for attacks
    // to produce the desired result
    this.words.forEach((function (word) {
      let beat = '';
      // Handle words containing barlines. The simplest case is a single barline
      // surrounded by whitespace.  We simply ignore it and return to the
      // top of the loop.
      // The same also applies to barlines with repeat indicators, ':|', '|:' and ':|:'
      // On the other hand if any of these four barline possibilities had text prepended or appended
      // with no intervening whitespace, we need to remove barline chars and continue to the 
      // bottom of the loop.
      const barlineChars = /[\|:]+/;
      // We have to handle the possibility of barlines embedded in a word, e.g. "foo|bar"
      // We can't simply delete the barline chars with a space, because "foo|bar"
      // is actually 2 beats.  We need to split the word into two words, "foo" and "bar"
      // and then process each word separately.
      const beatWords = word.split(barlineChars)
      beatWords.forEach((function (beatWord) {
        if (beatWord.length == 0) {
          return;
        }
        // Replace each syllable with an asterisk, honoring '.' syllable separators
        // and removing apostrophes.
        // example: "l'en.fer" -> "**"
        beatWord = beatWord.replace(/'/g, '')  // Remove apostrophes
          .replace(/\p{L}+/gu, '*')            // Replace letter sequences with '*'
          .replace(/\./g, '');                 // Remove dots
        rhythm.push(beatWord);
      }));
    }));
    return rhythm
  });


  render = (function render(svg, x0, y0, fontwidth) {
    if (this.tight && !this.showLyric) { return; } // tight mode does not render lyric lines as part of music lines
    // Draw each char in this.text starting at x0, y0 and incrementing
    // x by fontwidth for each char.
    let x = x0;
    for (let i = 0; i < this.text.length; i++) {
      let char = this.text[i];
      let klass = ["lyric"];
      // Emphasize beats, by greying every char that isn't either a barline
      // or the start of beat.
      if ((char == '-' || char == ';' || char == '*') && !this.beats.includes(i)) {
        klass.push("grey")
      }
      appendSVGTextChild(svg, x, y0, char, klass);
      // increment x by the width of the char
      x += fontwidth;
    }
  });

} // end of LyricLine class



// VOffsets is a top-level object used by the Pitch class when rendering
// pitches. The offsets are fractions of the font height.
// where h is the font height.  Note that svg coordinates increase from
// the top of the viewport, hence the reverse ordering for the 12 pitch
// classes. The letter 'f' is empiricaly lowered .6 units to make it
// appear a little lower than 'g', i.e. to compensate for the visual
// effect of 'g's descender.
const vOffsets = {
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

// keyTable maps a key signature to a table of accidentals for each pitch class.
// Key signatures are specified as a string containing a number of sharps or flats,
// e.g. "0" for C major, "#1" for G major, "#2" for D major, etc. For flats, the key sig
// looks like "&1", for F major, "&2" for B-flat major, etc.
const keyTable = {
  "0": { "c": "♮", "d": "♮", "e": "♮", "f": "♮", "g": "♮", "a": "♮", "b": "♮" },
  "#1": { "c": "♮", "d": "♮", "e": "♮", "f": "♯", "g": "♮", "a": "♮", "b": "♮" },
  "#2": { "c": "♯", "d": "♮", "e": "♮", "f": "♯", "g": "♮", "a": "♮", "b": "♮" },
  "#3": { "c": "♯", "d": "♮", "e": "♮", "f": "♯", "g": "♯", "a": "♮", "b": "♮" },
  "#4": { "c": "♯", "d": "♯", "e": "♮", "f": "♯", "g": "♯", "a": "♮", "b": "♮" },
  "#5": { "c": "♯", "d": "♯", "e": "♮", "f": "♯", "g": "♯", "a": "♯", "b": "♮" },
  "#6": { "c": "♯", "d": "♯", "e": "♯", "f": "♯", "g": "♯", "a": "♯", "b": "♮" },
  "#7": { "c": "♯", "d": "♯", "e": "♯", "f": "♯", "g": "♯", "a": "♯", "b": "♯" },
  "&1": { "c": "♮", "d": "♮", "e": "♮", "f": "♮", "g": "♮", "a": "♮", "b": "♭" },
  "&2": { "c": "♮", "d": "♮", "e": "♭", "f": "♮", "g": "♮", "a": "♮", "b": "♭" },
  "&3": { "c": "♮", "d": "♮", "e": "♭", "f": "♮", "g": "♮", "a": "♭", "b": "♭" },
  "&4": { "c": "♮", "d": "♭", "e": "♭", "f": "♮", "g": "♮", "a": "♭", "b": "♭" },
  "&5": { "c": "♮", "d": "♭", "e": "♭", "f": "♮", "g": "♭", "a": "♭", "b": "♭" },
  "&6": { "c": "♭", "d": "♭", "e": "♭", "f": "♮", "g": "♭", "a": "♭", "b": "♭" },
  "&7": { "c": "♭", "d": "♭", "e": "♭", "f": "♭", "g": "♭", "a": "♭", "b": "♭" },
}
// When transposing, we need to be able to look up the letter for a given key signature.
const keyLetters = {
  "0": "c", "#1": "g", "#2": "d", "#3": "a", "#4": "e", "#5": "b", "#6": "f#", "#7": "c#",
  "&1": "f", "&2": "b", "&3": "e", "&4": "a", "&5": "d", "&6": "g", "&7": "c",
}
// StringRing provide methods to treat the characters in a string as values
// in a ring buffer. It provide methods to advance by n and to compute the
// distance between two values. Its main use in this script is in
// transposing pitches.
class StringRing {
  constructor(s) {
    this.r = s.split('');
    this.len = this.r.length;
  }
  distance = (c0, c1) => {
    const i0 = this.r.indexOf(c0);
    if (i0 == -1) {
      throw new Error(`invalid character: ${c0} not in ${this.r}`);
    }
    const i1 = this.r.indexOf(c1);
    if (i1 == -1) {
      throw new Error(`invalid character: ${c1} not in ${this.r}`);
    }
    return (i1 - i0 + this.len) % this.len
  }
  advance = (c, n) => {
    const i = this.r.indexOf(c);
    if (i == -1) {
      throw new Error(`invalid character: ${c} not in ${this.r}`);
    }
    const d = (i + n + this.len) % this.len;
    return this.r[d];
  }
}

class Transposer {
  constructor(fromKeySym, toKeySym) {
    this.pitchRing = new StringRing("cdefgab");
    this.fromKeyLetter = keyLetters[fromKeySym];
    this.toKeyLetter = keyLetters[toKeySym];
    this.distance = this.pitchRing.distance(this.fromKeyLetter, this.toKeyLetter);
    this.fromKeyLUT = keyTable[fromKeySym];
    this.toKeyLUT = keyTable[toKeySym];
  }
  components = (pitchToken) => {
    // A pitch token consists of octave marks + accidentals + pitch letter.
    // We need to extract each of these parts.
    const rgx = /([\^\/]*)([&#%]*)([a-g])/;
    const matches = pitchToken.match(rgx);
    const o = matches[1];
    const a = matches[2];
    const l = matches[3];
    return { "octaveMarks": o, "accidentals": a, "letter": l };
  }
  getEffectiveAlteration = (acc, letter) => {
    // The effective alteration is the number of semitones by which a pitch is
    // altered relative to the key signature value for the given letter.
    const alteration = this.fromKeyLUT[letter];
    switch (acc) {
      case '':
        return 0;
      case '%':
        switch (alteration) {
          case '♮':
            return 0;
          case '♯':
            return -1;
          case '♭':
            return 1;
          default:
            throw new Error(`invalid alteration: ${alteration}`);
        }
      case '&':
        switch (alteration) {
          case '♮':
            return -1;
          case '♯':
            return -2;
          case '♭':
            return 0;
          default:
            throw new Error(`invalid alteration: ${alteration}`);
        }
      case '#':
        switch (alteration) {
          case '♮':
            return 1;
          case '♯':
            return 0
          case '♭':
            return 2;
          default:
            throw new Error(`invalid alteration: ${alteration}`);
        }
      case '&&':
        switch (alteration) {
          case '♮':
            return -2;
          case '♯':
            return -3; // may be pathological
          case '♭':
            return -1;
          default:
            throw new Error(`invalid alteration: ${alteration}`);
        }
      case '##': {
        switch (alteration) {
          case '♮':
            return 2;
          case '♯':
            return 1;
          case '♭':
            return 3; // may be pathological
          default:
            throw new Error(`invalid alteration: ${alteration}`);
        }
      }
      default:
        throw new Error(`invalid accidental: ${acc}`);
    }

  }
  applyEffectiveAlteration(nAlt, letter) {
    // return an accidentals string that applies the effective alteration, nAlt,
    // to pitch letter in the destination key.
    const keyAlt = this.toKeyLUT[letter];
    switch (nAlt) {
      case 0:
        return '';
      case 1:
        switch (keyAlt) {
          case '♮':
            return '#';
          case '♯':
            return '##';
          case '♭':
            return '%';
          default:
            throw new Error(`invalid alteration: ${keyAlt}`);
        }
      case -1:
        switch (keyAlt) {
          case '♮':
            return '&';
          case '♯':
            return '%';
          case '♭':
            return '&&';
          default:
            throw new Error(`invalid alteration: ${keyAlt}`);
        }
      case -2:
        switch (keyAlt) {
          case '♮':
            return '&&';
          case '♯':
            return '&';
          case '♭':
            throw new Error(`can't represent triple flat`)
          default:
            throw new Error(`invalid alteration: ${keyAlt}`);
        }
      case 2:
        switch (keyAlt) {
          case '♮':
            return '##';
          case '♯':
            throw new Error(`can't represent triple sharp`)
          case '♭':
            return '#';
          default:
            throw new Error(`invalid alteration: ${keyAlt}`);
        }
      case 3:
        switch (keyAlt) {
          case '♮':
            throw new Error(`can't represent triple sharp`)
          case '♯':
            throw new Error(`can't represent quadruple sharp`)
          case '♭':
            return '##';
          default:
            throw new Error(`invalid alteration: ${keyAlt}`);
        }
      case -3:
        switch (keyAlt) {
          case '♮':
            throw new Error(`can't represent triple flat`)
          case '♯':
            return '&&';
          case '♭':
            throw new Error(`can't represent quadruple flat`)
          default:
            throw new Error(`invalid alteration: ${keyAlt}`);
        }
      default:
        throw new Error(`invalid effective alteration: ${nAlt}`);
    }
  }
  transposed = (pitchToken) => {
    // split the pitchToken into components
    const c = this.components(pitchToken);
    // transpose the pitch letter
    const newLetter = this.pitchRing.advance(c.letter, this.distance);
    const nalt = this.getEffectiveAlteration(c.accidentals, c.letter);
    const newAccidental = this.applyEffectiveAlteration(nalt, newLetter);
    return c.octaveMarks + newAccidental + newLetter;
  }
}

// The Alterations class is used to manage the alterations for a given key signature
// and to keep track of which pitches have been explicitly altered within a bar.
class Alterations {
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
class Pitch {
  constructor(letter, octave, accidentalClass, fontheight) {
    this.letter = letter;
    this.octave = octave; // octave is an offset relative to a center octave whose value is 0
    this.accidentalClass = accidentalClass; // one of '', '𝄫', '♯', '𝄪' or ''
    this.classes = [accidentalClass, "pitch"];
  }
  // addClass() is used to add a class to the pitch. At present, this is used to add the
  // 'chord-pitch' class to the pitch when it is part of a chord.
  addClass = (className) => {
    this.classes.push(className);
  }
  // render() is a closure that renders the pitch at the specified x, y coordinates.
  render = (function render(svg, x, y, fontheight) {
    // Draw the pitch at the specified x, y coordinates.
    // Adjust the y coordinate by the octave and vertical offset for this pitch
    y -= this.octave * fontheight;
    const gOffset = 7 // causes the pitch to be rendered as though each staff line is on g natural.
    y += (gOffset + vOffsets[this.accidentalClass + this.letter]) * (fontheight / 12);
    appendSVGTextChild(svg, x, y, this.letter, this.classes);
  });
}
// The PitchLine class is used to render a single line of pitches from a
// text string.  This is the most complicated class in the program as it
// must handle octavation, key signatures, accidentals and alterations and
// match each pitch to its corresponding attack location in the Lyric line.
class PitchLine {
  constructor(text) {
    this.centerOctave = 0;
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
    this.alterations = new Alterations("0"); // default key is C major
    for (let i = 0; i < this.tokens.length; i++) {
      // Handle key designator of the form "K(0|[#&]?[1-7])".
      if (this.tokens[i].match(/K/)) {
        this.alterations = new Alterations(this.tokens[i].slice(1));
        continue;
      }
      // If the pitch token begins with a ')', we're ending a chord.
      if (this.tokens[i].match(/\)/)) {
        this.inChord = -1;
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
      if (diff > 0 && diff > 3) {
        // the current pitch is below the previous pitch in the next octave down
        // so decrement the octave
        octave--;
      } else if (diff < 0 && diff < -3) {
        // the current pitch is above the previous pitch in the previous octave up
        // so increment the octave
        octave++;
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
        pitch.addClass('chord-pitch');
      }
      this.pitches.push(pitch);
      // console.log(letter, octave, accClass)
      prevPitch.letter = letter;
      prevPitch.octave = octave;
    }
  }
  // render = (function (svg, x0, y0, attacks, fontwidth, fontheight, bars) {
  render = (function (svg, x0, y0, bookParms, lyricLine) {
    // x0 is the x coordinate of the left edge of the line
    // y0 corresponds to the baseline of the center octave (0)
    const fontheight = bookParms.lyricFontHeight;
    const fontwidth = bookParms.lyricFontWidth;
    const attacks = lyricLine.attacks;
    const rests = lyricLine.rests;
    const bars = lyricLine.bars;
    // Draw the lines of the staff
    const yline0 = y0 + 2 * fontheight;
    const yline1 = yline0 - fontheight
    const yline2 = yline1 - fontheight
    const yline3 = yline2 - fontheight
    const xend = fontwidth * (1 + bars[bars.length - 1]); // extend line to last barline
    for (let y of [yline0, yline1, yline2, yline3]) {
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
    for (let n of bars) {
      if (n === 0) continue;
      let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      let x = x0 + (n + 0.5) * fontwidth;
      line.setAttribute("x1", x);
      line.setAttribute("y1", yline3);
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
    for (let pitch of this.pitches) {
      let x = x0;
      let y = y0;
      if (i < attacks.length) {
        x = x0 + attacks[i] * fontwidth;
        pitch.render(svg, x, y, fontheight);
      }
      i++;
    }
    // Now render the rests
    for (let rest of rests) {
      let x = x0;
      let y = yline1; // rests are rendered in the middle of the staff
      x = x0 + rest * fontwidth;
      appendSVGTextChild(svg, x, y, ";", ["rest", "grey"]);
    };
  });
}

// The Cue class is used render cue text in the style specified in the style sheet.
class Cue {
  constructor(text) {
    this.text = text;
  }
  render = (function (svg, x0, y0) {
    // x0 is the x coordinate of the left edge of the line
    // y0 is the y coordinate of the base line of the cue
    appendSVGTextChild(svg, x0, y0, this.text, ["cue"]);
  });
} // end Cue class

class LineAnnotations {
  constructor(lyricLine, y0, cssClasses) {
    this.lyricLine = lyricLine;
    this.y0 = y0;
    this.cssClasses = cssClasses;
    this.bars = lyricLine.bars;
    this.beats = lyricLine.beats;
    this.attacks = lyricLine.attacks;
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
        console.log(`next bar at ${p}`)
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
        console.log(`next beat at ${p}`)
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
        console.log(`next note at ${p}`)
        return p
      }
    }
    lineProblems.add("Already at or past last note position");
    return pos;
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
          x += pos * bookParameters.lyricFontWidth;
          // Replace underscores with spaces in the rendered text
          appendSVGTextChild(svg, x, this.y0, token.replace(/_/g, ' '), this.cssClasses);
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
      console.log(token, pos);
    });
  }
}

class PerBar {
  constructor(text) {
    this.text = text;
  }
  render(svg, x0, y0, lyricLine) {
    const annotations = new LineAnnotations(lyricLine, y0, ['perbar']);
    annotations.render(svg, x0, this.text, 'bar');
  }
}

class PerBeat {
  constructor(text) {
    this.text = text;
  }
  render(svg, x0, y0, lyricLine) {
    const annotations = new LineAnnotations(lyricLine, y0, ['perbeat']);
    annotations.render(svg, x0, this.text, 'beat');
  }
}

class PerNote {
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
class Finger {
  constructor(text) {
    this.text = text;
  }
  render(svg, x0, y0, lyricLine) {
    const annotations = new LineAnnotations(lyricLine, y0, ['fingering']);
    // Add a fudge to x positions for appearance
    const x = x0 + 0.1 * bookParameters.lyricFontWidth
    annotations.render(svg, x0, this.text, 'note');
  }
}

// The Counter class is similar to the PerBeat class. It provides
// an automated method for rendering beat numbers above the beats.
// The constructor takes 4 arguments, 
//    n, the first beat number (should be 1 unless we're starting with a partial measure)
//    beats, an array of beat x positions,
//    bars, an array of of bar x positions.
// .  rhythm, an array of rhythm markup,  as created by LyricLine.extractRhythm()`
class Counter {
  constructor(n, beats, bars, rhythm, useSubbeats = false) {
    this.n = n;
    this.beats = beats;
    this.bars = bars;
    this.rhythm = rhythm;
    // We need to generate a list of beat numbers that resets to 1
    // each time the beat position exceeds the next bar position.
    // The counting will begin with n unless n is <= 0, in which
    // case we will start with 1 for the first beat after the first bar.
    let count = (n > 0) ? n : 1;
    this.counts = [];
    let i = 0; // index into bars
    let j = 0; // index into beats
    for (let beat of this.beats) {
      if (i < this.bars.length) {
        if (beat > this.bars[i]) { // we've crossed the next bar
          count = 1;
          i++;
        }
      }
      j++;
      if (!useSubbeats) {
        this.counts.push(count);
      }
      count++;
    }
    if (!useSubbeats) return;
    // We need to add the subbeat numbers if we reach this point.
    // We need to add the subbeat numbers.
    // We will use the rhythm markup to determine the subbeat numbers.
    // The rhythm markup is a string of characters that indicate the
    // number of beats in each subbeat. For example, "16" means
    // that there are 16 subbeats in each beat. The rhythm markup
    // is a string of characters that indicate the number of beats
    // in each subbeat. For example, "16" means that there are 16
    // subbeats in each beat. The rhythm markup is a string of
    // characters that indicate the number of beats in each subbeat.
    // For example, "16" means that there are 16 subbeats in each
    // beat. The rhythm markup is a string of characters that
    // indicate the number of beats in each subbeat. For example,
    // "16" means that there are 16 subbeats in each beat. The
    // rhythm markup is a string of characters that indicate the
    // number of beats in each subbeat. For example, "16" means
    // Now we need to add the subbeat numbers.
    // We will use the rhythm markup to determine the subbeat numbers.
    // The rhythm markup is a string of characters that indicate the
    // number of beats in each subbeat. For example, "16" means
    // that there are 16 subbeats in each beat. The rhythm markup
    // is a string of characters that indicate the number of beats
    // in each subbeat. For example, "16" means that there are 16
    // subbeats in each beat. The rhythm markup is a string of
    // characters that indicate the number of beats in each subbeat.
    // For example, "16" means that there are 16 subbeats in each
    // beat. The rhythm markup is a string of characters that
    // indicate the number of beats in each subbeat. For example,
    // "16" means that there are 16 subbeats in each beat. The
    // rhythm markup is a string of
    // append rhythm to count ( minus the first char of the rhythm)
    const subbeats = this.rhythm[j].slice(1, this.rhythm[j].length)
    //console.log(beat, this.bars[i], count, subbeats);
    // if the first char of rhythm is a minus sign, we need to
    // use a hyphen instead of a number
    const c = this.rhythm[j][0] === '-' ? '-' : String(count);
    this.counts.push(c + subbeats);
    // bump the count and beat index
    count++
    j++;
  }

  render = (function (svg, x0, y0, fontwidth) {
    // x0 is the x coordinate of the left edge of the line y0 is the
    // y coordinate of the baseline of the line. 
    // fontwidth is the width of the lyric font
    // in pixels.  (the counter font will typically be
    // smaller than the lyric font) We will render the counts by
    // looping through the beats and rendering the count number
    // above each beat. 
    let i = 0;
    for (let count of this.counts) {
      let x = x0 + this.beats[i] * fontwidth;
      appendSVGTextChild(svg, x, y0, count + '', ["counter"]);
      i++;
    }
  });
}

// The Chord class is used to render chords symbols above beats.
class Chord {
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
// splitFirst splits a string on the supplied separator and returns
// a two-element array of strings containing the part that preceded the
// separator and the remainder of the string, e.g.
//   splitFirst('foo: bar: blah, blah', ': ') --> ['foo', 'bar: blah, blah']
// If the separator is not present, splitFirst returns an empty string
// for the first element and the entire string as the remainder, e.g.
//   splitFirst('no colons here', ': ') --> ['', 'no colons here']
function splitFirst(str, separator) {
  const separatorIndex = str.indexOf(separator);
  if (separatorIndex === -1) {
    return ["", str];
  }
  return [str.slice(0, separatorIndex), str.slice(separatorIndex + separator.length)];
}

// musicToPitchLyric takes a music line (a string) and returns a pitch line  and a
// lyric line as an object. For example, if the music line is `K#2 c; d -e f |` the
// lyric line will be `*; * -* * |` and the pitch line will be 
// `K#2 c d e f |`. 
//
// The lyric line is constructed by identifying all key signature
// and pitch tokens in the music and removing the key signatures and
// replacing the pitch tokens with asterisks.
//
// The pitch line is constructed by removing all the hold or rest
// characters, '-' and ';'the from music line. 
function musicToPitchLyric(musicLine) {
  let lyricLine = musicLine;
  let pitchLine = musicLine;

  // Remove key signatures and replace pitch tokens with asterisks in the lyric line
  lyricLine = lyricLine.replace(/K[#&]?\d/g, "").replace(/\^*\/*[#&%]*[a-g]/g, "*");

  // Remove hold and rest characters from the pitch line
  pitchLine = pitchLine.replace(/[-;]/g, "");

  return {
    lyric: lyricLine.trim(),
    pitch: pitchLine.trim()
  };
}

// stripComments removes all lines that start with a ':' character.
function stripComments(text) {
  return text.replace(/^\s*:.*\n/g, "\n");
}

// The preprocessScore function is used to parse the score input
// text and convert it into a data object with members for the title,
// preface, lyrics, expressions, cues, pitches, chords, perbars and
// postscript. The data object is returned.
// It's important to understand the distinction between line groups
// and singleton lines. A line group is a group of lines that represent
// a line of music.  Singletons are things like title, preface, etc.
// that appear once within a score. Within the score text, blank lines
// i.e. /\n\s*\n/ are delimeters between singletons and line groups.
function preprocessScore(text) {
  text = stripComments(text);
  const blocks = text.split(/\n\s*\n/);
  //console.log(blocks);
  const data = { text: text, lines: [] };

  // We must deal with three kinds of block.
  // 
  // The first kind is text block that begins with preface: or postscript:
  // or text: and may have one or more lines. Subsequent lines are
  // treated as text lines. 

  // The second kind of block is a single line that begins with
  //   title:, or zoom: It is an error if either of these keywords
  // are followed by anything other than the remainder of the line.
  //
  // The the third kind of block is one or more lines, each of which begins
  // with one of the following keywords: 
  //   cue:, perbar:,  pernote:, perbeat:, 
  //   chord:, music:, lyric:
  data.tight = false; // don't squeeze beats together.
  // loop through the blocks in reverse order.
  for (let i = blocks.length - 1; i >= 0; i--) {
    let block = blocks[i].trim();
    if (block.startsWith("youtube:")) {
      // youtube video id with optional default play rate
      // e.g. youtube:12345678 0.75
      parts = block.slice(8).trim().split(" ");
      data.youtubeId = parts[0];
      if (parts.length > 1) {
        data.playRate = parseFloat(parts[1]);
      } else {
        data.playRate = 1.0;
      }
      blocks.splice(i, 1);
      continue;
    }
    if (block.startsWith("zoom:")) {
      data.zoom = block.slice(5).trim();
      blocks.splice(i, 1);
      continue;
    }
    if (block.startsWith("preface:")) {
      data.preface = block.slice(8);
      blocks.splice(i, 1);
      continue;
    }
    if (block.startsWith("postscript:")) {
      data.postscript = block.slice(11).trim();
      blocks.splice(i, 1);
      continue;
    }
    if (block.startsWith("tight:")) {
      data.tight = true;
      blocks.splice(i, 1);
      continue;
    }
    if (block.startsWith("title:")) {
      data.title = block.slice(6).trim();
      blocks.splice(i, 1);
      continue;
    }
    if (block.startsWith("zoom:")) {
      data.zoom = block.slice(5).trim();
      blocks.splice(i, 1);
      continue;
    }
  }

  // at this point only the third kind of blocks are left
  let kvlines = blocks.map(line => {
    const obj = {}; // what we will return
    if (line.startsWith("text:")) {
      obj.text = line.slice(5).trim();
      return obj;
    }
    // If we get to here, it's a music linegroup
    const parts = line.split(/\n/);
    parts.forEach(part => {
      part.trim()
      const [key, value] = splitFirst(part, ': ');
      const k = key.trim();
      // Special handling for play:
      switch (k) {
        case "play":
          const parts = value.trim().split(/\s+/);
          const [min, sec] = parts[0].split(':');
          obj[k] = parseInt(min) * 60 + parseInt(sec);
          if (parts[1]) {
            obj.playRate = parseFloat(parts[1]);
          } else {
            obj.playRate = data.playRate;
          }
          break;
        default:
          if (k !== "" && value !== undefined) {
            obj[k] = value.trim();
          }
      }

    });
    return obj;
  });
  kvlines = kvlines.filter(obj => Object.keys(obj).length > 0);
  //console.log(kvlines);

  // push the remaining lines. 
  for (let kv of kvlines) {
    data.lines.push(kv);
    continue;
  }
  return data;
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

function renderMultiline(svg, x, y, text, fontHeight, className) {
  const lines = text.split('\n');

  lines.forEach(line => {
    // We support a single '.' as a blank line indicator
    if (line.trimEnd() === '.') {
      y += fontHeight;
      return
    }
    dx = countLeadingSpaces(line) * fontHeight * 0.5 // assume fontwidth is half of font height
    // get the fontSize of the textElement
    appendSVGTextChild(svg, x + dx, y, line.trimEnd(), [className]);
    y += fontHeight
  });

  return y;
}
function playYouTubeAt(videoId, timeSeconds, rate = 1.0) {
  if (player.getPlayerState() === YT.PlayerState.PLAYING) {
    player.pauseVideo();
    return;
  }
  if (player.getVideoData().video_id !== videoId) {
    player.loadVideoById(videoId, timeSeconds);
  } else {
    player.seekTo(timeSeconds);
  }
  try {
    player.setPlaybackRate(rate);
  } catch (e) {
    alert("Can't play this video at that rate. Check the  video to see what rates are supported.");
    console.log(e);
    return;
  }
  console.log("Playing " + videoId + " from " + timeSeconds + " seconds at " + rate + "x");
  player.playVideo()
}
function reconstructSectionText(line) {
  let text = '';
  // Build section text from line properties
  if (line.cue) text += `cue: ${line.cue}\n`;
  if (line.music) {
    text += `music: ${line.music}\n`;
  } else if (line.pitch) {
    text = `pitch: ${line.pitch}\n`;
  }
  if (line.lyric) text += `lyric: ${line.lyric}\n`;
  if (line.counter) text += `counter: ${line.counter}\n`;
  if (line.chord) text += `chord: ${line.chord}\n`;
  if (line.text) text += `text: ${line.text}\n`;
  if (line.play) {
    const minutes = Math.floor(line.play / 60);
    const seconds = line.play - (minutes * 60);
    text += `play: ${minutes}:${seconds < 10 ? '0' + seconds : seconds}\n`
  }
  if (line.finger) text += `finger: ${line.finger}\n`;
  if (line.perbeat) text += `perbeat: ${line.perbeat}\n`;
  if (line.pernote) text += `pernote: ${line.pernote}\n`;
  if (line.perbar) text += `perbar: ${line.perbar}\n`;
  // ... add other line properties
  return text;
}

// The renderScore function is used to render the score using the
// members of the data object created by preprocessScore.
//  - wrapper is a div element that will hold svg's we create
//  - data is an object containing the score
function renderScore(wrapper, data) {
  // The addEditor function is a closure that adds editing capabilities to a
  // section of the score. The svg argument is the svg element that will
  // be edited.  
  addEditor = (svg) => {
    // Create a div that will hold the editor and the reload button.
    const editorDiv = document.createElement('div');
    editorDiv.setAttribute('class', 'section-editor-div');
    editorDiv.style.display = 'none';
    editorDiv.style.alignItems = 'flex-start';
    // Create the reload button
    const reloadButton = document.createElement('button');
    reloadButton.textContent = '↻';
    reloadButton.setAttribute('class', 'reload-icon');
    // Create the editor element
    const editor = document.createElement('pre');
    editor.classList.add('section-editor');
    editor.setAttribute('contenteditable', 'plaintext-only');
    editor.style.display = 'block';
    // Wrap the button and editor in the editor div.
    editorDiv.appendChild(reloadButton);
    editorDiv.appendChild(editor);
    wrapper.appendChild(editorDiv);

    // Create a pencil icon  that shows and hides the editor.
    const pencil = appendSVGTextChild(svg, 0, 16, "✎", ['pencil-icon']);
    pencil.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      e.stopImmediatePropagation();
      editorDiv.style.display = editorDiv.style.display === 'none' ? 'flex' : 'none';
      return false;
    }, true);
    // Each input event on the editor will update the main source
    editor.addEventListener('input', () => {
      const sectionEditors = wrapper.querySelectorAll('.section-editor');
      // Update main source and render
      const fullText = Array.from(sectionEditors)
        .map(ed => ed.textContent.trim())
        .filter(text => text.length > 0)
        .join('\n\n');

      const scoreDiv = wrapper.closest('div.score');
      const mainEditor = scoreDiv.querySelector('pre.source');
      mainEditor.textContent = fullText;
    });
    // The reload button will reload the edited score.
    reloadButton.addEventListener('click', () => {
      // Save editor state
      const activeEditor = editor;
      // Get index of active editor among siblings
      const allEditors = wrapper.querySelectorAll('.section-editor');
      const activeIndex = Array.from(allEditors).indexOf(activeEditor);

      const scoreDiv = wrapper.closest('div.score');
      score = scoreMap.get(scoreDiv.id);
      score.render();

      // Find and restore state of new editor at same index
      const newEditorDivs = wrapper.querySelectorAll('.section-editor-div');
      const newActiveEditor = newEditorDivs[activeIndex];
      newActiveEditor.style.display = 'flex';
      newActiveEditor.focus();
    });
    return editor; // so caller can add initial text content
  }
  // clear any existing content of the SVG element
  wrapper.innerHTML = "";
  // create an svg element
  let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  let y = 0; // y coordinate of the top of the rendered score
  wrapper.appendChild(svg)
  addEditor(svg)

  // Render any line problems that were encountered in
  // preliminary processing
  y = lineProblems.render(svg, bookParameters.leftX, y);
  lineProblems.clear();

  // Render the title at the top of the SVG element
  y += 2 * bookParameters.titleFontHeight
  appendSVGTextChild(svg, bookParameters.leftX, y, data.title, ['title']);

  // Special handling for first SVG's section editor (title block)
  const titleEditor = wrapper.querySelector('.section-editor');
  if (titleEditor) {
    let titleText = `title: ${data.title}`;

    if (data.zoom) {
      titleText += `\n\nzoom: ${data.zoom}`;
    }

    if (data.youtubeId) {
      titleText += `\n\nyoutube: ${data.youtubeId}`;
      if (data.playRate && data.playRate !== 1.0) {
        titleText += ` ${data.playRate}`;
      }
    }

    if (data.tight) {
      titleText += `\n\ntight:`;
    }

    titleEditor.textContent = titleText;
  }

  // Render the score
  data.lines.forEach((line, index) => {
    // create an svg element
    let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    let y = 0; // y coordinate of the top of the rendered score
    wrapper.appendChild(svg)
    let sectionEditor = addEditor(svg);
    // Populate editor with this section's source
    sectionEditor.textContent = reconstructSectionText(line);

    // If it's a text block, render it.
    if (line.text) {
      y += 2 * bookParameters.lyricFontHeight + bookParameters.textFontHeight;
      y = renderMultiline(svg, bookParameters.leftX, y,
        line.text, bookParameters.textFontHeight, 'text');
      y += bookParameters.textFontHeight
      return;
    }
    // Handle the music lines. If present, a music line replaces the
    // lyric and pitch lines.
    line.showLyric = true;
    if (line.music) {
      const { lyric, pitch } = musicToPitchLyric(line.music);
      line.lyric = lyric;
      line.pitch = pitch;
      line.showLyric = false;
    }
    let lyricline = undefined
    if (line.lyric) {
      lyricline = new LyricLine(
        line.lyric, data.tight, line.showLyric);
    }
    y += bookParameters.lyricFontHeight

    // Render the cue, if any
    if (line.cue) {
      if (!line.lyric) {
        y += bookParameters.lyricFontHeight;
      } else {
        y += bookParameters.lyricFontHeight;
      }
      const cue = new Cue(line.cue);
      cue.render(svg, bookParameters.leftX, y);
    }
    // Render the chords, if any
    if (line.chord && line.lyric) {
      y += bookParameters.chordFontHeight
      const chord = new Chord(line.chord);
      chord.render(svg, bookParameters.leftX, y, lyricline.beats, bookParameters.lyricFontWidth);
      // y += bookParameters.chordFontHeight / 3;
    }
    // Render per-beat items, if any
    if (line.perbeat && line.lyric) {
      y += bookParameters.perbeatFontHeight * 1.5
      const perbeat = new PerBeat(line.perbeat)
      perbeat.render(svg, bookParameters.leftX, y, lyricline)
    }
    // Render the fingerings, if any
    if (line.finger && line.lyric) {
      y += bookParameters.fingerFontHeight * 1.5
      const finger = new Finger(line.finger)
      finger.render(svg, bookParameters.leftX, y, lyricline)
    }
    // Render the pitches, if any
    if (line.pitch && line.lyric) {
      y += 1.5 * bookParameters.lyricFontHeight;
      try {
        const pitchLine = new PitchLine(line.pitch);
        pitchLine.render(svg, bookParameters.leftX, y, bookParameters, lyricline);
        y += 2 * bookParameters.lyricFontHeight;
      } catch (e) {
        lineProblems.add("Pitch line error: " + e.message);
        //console.log(e);
      }
    }
    if (line.perbar && line.lyric) {
      y += bookParameters.perbarFontHeight;
      const perbar = new PerBar(line.perbar);
      perbar.render(svg, bookParameters.leftX, y, lyricline);

    }
    // Render the lyric
    if (line.showLyric) {
      y += 1.1 * bookParameters.lyricFontHeight;
      if (line.lyric) {
        lyricline.render(svg, bookParameters.leftX, y, bookParameters.lyricFontWidth);
      }
    }

    // Render the per note expression marks, if any.
    if (line.pernote && line.lyric) {
      y += bookParameters.pernoteFontHeight * 1.5; // 2 px extra space between exprs and lyric to clear descenders
      const expr = new PerNote(line.pernote);
      // expr.render(svg, bookParameters.leftX, y, lyricline.attacks, bookParameters.lyricFontWidth);
      expr.render(svg, bookParameters.leftX, y, lyricline);
    }
    // Render the counter, if any
    if (line.counter && line.lyric) {
      y += bookParameters.counterFontHeight * 1.5
      // line counter may be an empty string or a string that should be convertible to an integer
      let npartial = 0;
      if (line.counter.length > 0) {
        try {
          npartial = parseInt(line.counter);
        } catch (e) {
          lineProblems.add(`Invalid counter value: ${line.counter}`);
        }
      }
      let bars = lyricline.bars;
      if (bars[0] == 0) {
        bars = bars.slice(1); // ignore the pseudo barline at 0
      }
      const counter = new Counter(npartial, lyricline.beats, bars, lyricline.extractRhythm());
      counter.render(svg, bookParameters.leftX, y, bookParameters.lyricFontWidth)
      // y += bookParameters.counterFontHeight / 3;
    }
    // Render any line problems that were encountered
    y = lineProblems.render(svg, bookParameters.leftX, y);
    lineProblems.clear();

    // Add click handler for play click handlers
    if (data.youtubeId && line.play !== undefined) {
      svg.style.cursor = 'pointer';
      svg.addEventListener('click', (event) => {
        if (event.detail === 1) { // Single click
          setTimeout(() => {
            if (!event.target.clickProcessed) {
              playYouTubeAt(data.youtubeId, line.play, line.playRate || 1.0);
            }
          }, 200); // Delay to allow for double click detection
        }
        event.target.clickProcessed = (event.detail === 2);
      });
    }
  });
}

// Score represents a score div and its associated editable source text.  It
// has a render method that renders the source text as FQS musical notation.
class Score {
  constructor(text) {
    this.text = text;
    this.editMode = false;
    this.outer = document.createElement('div');
    this.outer.classList.add('score');
    this.id = `score-${Math.random().toString(36).substring(2, 15)}`;
    this.outer.setAttribute('id', this.id);
    scoreMap.set(this.id, this);
    // the delete button goes at the top of the score
    this.deleteBtn = document.createElement('button')
    this.deleteBtn.textContent = 'Delete this score';
    this.deleteBtn.classList.add('delete-btn');
    this.outer.appendChild(this.deleteBtn)
    // next comes a wrapper div that will contain the rendered
    // and the editable source text.
    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('score-wrapper');
    this.outer.appendChild(this.wrapper)
    // the inner wrapper div is where the svg's that comprise each
    // line of the rendered score will go
    this.inner = document.createElement('div');
    this.inner.classList.add('inner-wrapper');
    this.wrapper.appendChild(this.inner);
    // the source div will contain the editable <pre> element that 
    // holds the source text
    this.sourcediv = document.createElement('div');
    this.sourcediv.classList.add('source-div');
    this.wrapper.appendChild(this.sourcediv)
    // the editable pre element.
    this.source = document.createElement('pre');
    this.source.classList.add('source');
    this.source.setAttribute('contenteditable', 'plaintext-only');
    this.source.textContent = this.text;
    this.sourcediv.appendChild(this.source);
    // const tocId = "score-toc";
    this.tocLink = document.createElement('a');
    this.tocLink.setAttribute('href', `#score-toc`);
    this.tocLink.setAttribute('class', 'link-to-toc');
    this.tocLink.textContent = 'Table of Scores';
    this.outer.appendChild(this.tocLink);

    // Add event listeners
    this.deleteBtn.addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete this score?`)) {
        deleteScore(this.id);
      }
    });
    this.source.addEventListener('input', () => {
      this.render();
    });
  }

  // showSourceEditor() makes the source editor visible.
  // by changing the the display style and width of the source div
  // and the width of the inner div.
  showSourceEditor() {
    this.sourcediv.style.display = 'block';
    this.sourcediv.style.width = '50%';
    this.inner.style.width = '50%';
  }
  // hideSourceEditor() makes the source editor invisible.
  // by changing the the display style and width of the source div
  // and the width of the inner div.
  hideSourceEditor() {
    this.sourcediv.style.display = 'none';
    this.inner.style.width = '100%';
  }
  toggleEdit() {
    this.editMode = !this.editMode;
    this.forceEditMode(this.editMode);
  }

  forceEditMode(state) {
    if (state) {
      this.showSourceEditor();
    } else {
      this.hideSourceEditor();
    }
  }
  // render() renders the score into the inner div.
  render() {
    // get the source text from the source pre element
    this.text = this.source.textContent;
    const data = preprocessScore(this.text);
    renderScore(this.inner, data);
    const svgElements = this.inner.querySelectorAll('svg');
    for (const svg of svgElements) {
      // calculate rendered height and adjust the svg height and viewbox
      let height = svg.getBBox().height + 30; // empirical
      // svg.setAttribute('height', height);
      let zoom = 100;
      if (data.zoom) {
        // if data.zoom can't be parsed, use 100% and add a message to the
        // lineProblems object so that the error can be displayed in the
        // SVG.
        zoom = parseInt(data.zoom, 10);
        if (isNaN(zoom)) {
          lineProblems.add("Invalid zoom value: " + data.zoom);
          zoom = 100;
        }
        // allow user to specify a zoom factor between 50 and 500%
        zoom = Math.max(50, Math.min(500, parseInt(zoom,
          10)));

        const xpix = 720 * 100. / zoom;
        svg.setAttribute('viewBox', `0 0 ${xpix} ${height}`);
      }
    }
    scoreToc(); // update the table of contents
    isDirty = true // signal that the score has been edited
  }
}

// updateFontSizes() updates the font sizes of the various elements of
// scores that will be rendered as SVG objects. The font default sizes are
// specified in the style element with id 'fqs-style', but we support
// overriding them via the bookParameters object. If the font sizes are not
// specified in the bookParameters object, we use the default font sizes and
// update corresponding vars in bookParameters.
function updateFontSizes() {
  // Update the font sizes if user has specified them.
  // First, get a reference to the stylesheet,
  const stylesheet = document.getElementById('fqs-style').sheet;
  const rules = stylesheet.cssRules || stylesheet.rules;
  // define a closure that will update the font size of a rule
  // whose index is i if the font height, fh is specified in 
  // or if not specified, assign a numeric value
  // to the value in fh.
  update = (i, fh) => {
    if (bookParameters[fh]) {
      const v = bookParameters[fh];
      rules[i].style.fontSize = v + 'px';
    } else {
      bookParameters[fh] = +rules[i].style.fontSize.slice(0, -2);
    }
  }
  // loop over the rules to update font sizes.
  for (let i = 0; i < rules.length; i++) {
    switch (rules[i].selectorText) {
      case '.title':
        update(i, "titleFontHeight")
        break;
      case '.text':
        update(i, 'textFontHeight');
        break;
      case '.preface':
        update(i, 'prefaceFontHeight');
        break;
      case '.postscript':
        update(i, 'postscriptFontHeight');
        break;
      case '.chord':
        update(i, 'chordFontHeight');
        break;
      case '.pernote':
        update(i, 'pernoteFontHeight');
        break;
      case '.fingering':
        update(i, 'fingerFontHeight');
        break;
      case '.lyric':
        update(i, 'lyricFontHeight');
        break;
      case '.pitch':
        update(i, 'pitchFontHeight');
        break;
      case '.cue':
        update(i, 'cueFontHeight');
        break;
      case '.perbar':
        update(i, 'perbarFontHeight');
        break;
      case '.perbeat':
        update(i, 'perbeatFontHeight');
        break;
      case '.counter':
        update(i, 'counterFontHeight');
        break;
      case '.rest':
        update(i, 'restFontHeight');
        break;
      case '.perline':
        update(i, 'perlineFontHeight');
        break;
      case '.lineproblem':
        update(i, 'lineproblemFontHeight');
        break;
    }
  }
}
export { Score, initYouTubeAPI } 