import { defaultParameters } from "../utils/parameters.js";
import { appendSVGTextChild } from "../utils/svg.js";
import { lineProblems } from "../classes/LineProblem.js";
// The LyricLine class interprets the text of a lyric line and
// and determines the location of beats, attacks and barlines.
// It provides a render() method that will render the lyric line
// into an svg element. The show argument controls the
// spacing of the rendered score. We need it to handle
// the distinction music line groups (which never show lyrics)
// and pitch plus lyric groups where lyrics are shown.
export class LyricLine {
  constructor(text, show) {
    // trim leading or trailing whitespace
    // split the text on whitespace
    // join the text back together with single spaces
    this.tuplets = text.trim().split(/\s+/).map(word => {
      const tupletMatch = word.match(/^([2-9])(.+)$/);
      return tupletMatch ? { text: tupletMatch[2], tupletSize: parseInt(tupletMatch[1]) } : { text: word, tupletSize: 1 };
    });
    // Underscores, (one or more) may appear only at the end of tuplet text. Add
    // a LineProblem message if an underscore is found elsewhere in the text,
    // i.e. 'foo_' and 'foo__' are valid but '_foo' and 'foo_bar' are not.
    this.tuplets.forEach(tuplet => {
      const underscoreMatch = tuplet.text.match(/^[^_]*_+$/)
      if (tuplet.text.includes('_') && !underscoreMatch) {
        lineProblems.add(`Invalid underscore position in "${tuplet.text}"`)
      }
    })

    // put the texts of the  tuplets into an array
    this.words = this.tuplets.map(tuplet => {
      return tuplet.text;
    });
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
    this.rests = [];
    this.holds = [];
    this.subBeats = [];
    this.showLyric = show;
    let inChord = false;
    let chordIndex = 0;
    // Call this closure to detect a beat and push its position
    const detectAndPushBeat = (i, pos) => {
      // Skip beat detection for underscore positions
      if (this.text[i] === '_') {
        return false;
      }
      if (i == 0 || (this.text[i - 1] == " ")) {
        this.beats.push(pos);
        this.subBeats.push(pos);
        return true;
      }
      if ((this.text[i - 1] == '(') && (i == 1 || (this.text[i - 2] == ' '))) {
        this.beats.push(pos);
        this.subBeats.push(pos);
        return true;
      }
      // It's  not a beat start, but it may be a sub-beat.
      if ((chordIndex == 0 && this.text[i] == "*") || this.text[i] == ";") {
        this.subBeats.push(pos);
      }
      return false;
    }
    // loop over the lyric text, detecting the positions of attacks, beats,
    // rests and barlines.
    let pos = 0; // position index
    for (let i = 0; i < this.text.length; i++) {
      const c = this.text[i];
      switch (c) {
        case "_":
          // Underscore advances position but is not an attack
          // pos++;
          continue;
        case " ":
          // Spaces advance pos only if show is true.
          if (true || show) {
            pos++
          }
          continue;
        case "(":
          // ignore left parenthesis. Don't advance pos.
          inChord = true;
          chordIndex = 0
          continue;
        case ")":
          // ignore right parenthesis. Don't advance pos.
          inChord = false;
          continue;
        case "|":
          // barlines are never attacks or beat starts
          this.bars.push(pos);
          pos++
          continue;
        case "-":
          // a dash is never an attack but it may be a beat start.
          if (detectAndPushBeat(i, pos)) {
            this.holds.push(pos);
            pos++;
          } else if (show) {
            pos++;
          }
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
          // an asterisk is usually an attack. It is also a beat start if
          // it is preceded by a space (or the beginning of the text) or
          // a space followed by a left parenthesis, i.e. " ("
          detectAndPushBeat(i, pos);
          this.attacks.push(pos);
          pos++;
        default:
          // Handle lyric characters (including pitch characters).
          if (c.match(defaultParameters.lyricRgx)) {
            if (!show) {
              // This lyric is synthesized from the a music line. The only chars
              // that match lyricRgx will be /[a-g]/. These chars are always attacks
              // in this situation. 
              this.attacks.push(pos);
              detectAndPushBeat(i, pos);
            } else { // we are showing the lyric (i.e. the lyric is text, not pitches)
              // The char is an attack if it is the first char of the measure or
              // or if it is preceeded by anything other than another lyric char.
              if (i == 0) { // first char is always an attack
                this.attacks.push(pos);
                detectAndPushBeat(i, pos);
              } else {
                const ci = this.text[i];
                const prev = this.text[i - 1];
                const isAttack = prev.match(/[\s;\-.*]/) ? true : false;
                console.log(`i:${i} pos:${pos} prev:${prev} c:${ci} isAttack:${isAttack}`)
                if (isAttack) {
                  this.attacks.push(pos);
                  detectAndPushBeat(i, pos);
                }
              }
            }
            pos++
          }
      }
    }
    // Finallly, we  want to remove barlines from this.tuplets so that
    // we can index tuplets the same as beats.
    this.tuplets = this.tuplets.filter(tuplet => {
      return !tuplet.text.includes("|");
    });
    //console.log("\ntext: " + this.text)
    //console.log("bars: " + this.bars)
    console.log("tuplets: " + this.tuplets)
    console.log("beats: " + this.beats)
    console.log("subBeats: " + this.subBeats)
    //console.log("attacks: " + this.attacks)
    //console.log("rests: " + this.rests)
  }

  extractRhythm = (function () {
    // Extract the rhythm from the text of the lyric line.
    // The rhythm is the sequence of subdivided beat texts
    // The rhythm is returned as an array of strings of beats, e.g. 
    // "foo.bar - ;baz * |\n" would return ["**", "-", ";*", "*"]
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
    console.log("rhythm: " + rhythm)
    return rhythm
  });

  syllableSpans() {
    if (!this.showLyric) {
      return [];
    }
    const spans = [];
    let inSyllable = false;
    let inBeat = false;
    let syllableLength = 0;
    // loop over the text.
    const lengths = [];
    const pushSyllable = () => {
      if (inSyllable) {
        spans.push(syllableLength);
      }
      inSyllable = false;
      syllableLength = 0;
    }
    for (let i = 0; i < this.text.length; i++) {
      const c = this.text[i];
      switch (c) {
        case " ":
          // a space terminates any current syllable and beat
          pushSyllable();
          inBeat = false;
          break;
        case "|":
          // ignore barlines
          inBeat = false;
          inSyllable = false;
          syllableLength = 0;
          break;
        case "-":
        case "*":
        case ";":
          // a dash, asterisk or rest terminates any current syllable and
          // creates a new syllable of length 1.
          pushSyllable();
          inSyllable = true;
          syllableLength = 1
          pushSyllable();
          break;
        case ".":
          // a dot is a syllable separator. It terminates the current syllable.
          // but does not start a new syllable.
          syllableLength++;
          pushSyllable();
        default:
          // A group of alphanumeric characters is a syllable.
          if (inSyllable) {
            syllableLength++;
          } else {
            inSyllable = true;
            syllableLength = 1;
          }
      }
    }
    return spans;
  }

  render = (function render(svg, x0, y0, fontwidth) {
    if (!this.showLyric) { return; } // Do not render lyric lines as part of music lines

    // Draw each char in this.text starting at x0, y0 and incrementing
    // x by fontwidth for each char.
    let x = x0;
    for (let i = 0; i < this.text.length; i++) {
      let char = this.text[i];
      // omit underscores
      if (char == '_') {
        continue;
      }
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
