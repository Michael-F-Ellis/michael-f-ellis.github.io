import { keyTable } from '../utils/keyTable.js';
// StringRing provide methods to treat the characters in a string as values
// in a ring buffer. It provide methods to advance by n and to compute the
// distance between two values. Its main use in this script is in
// transposing pitches.
export class StringRing {
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

export class Transposer {
  constructor(fromKeySym, toKeySym) {
    this.pitchRing = new StringRing("cdefgab");
    this.fromKeyLetter = Transposer.keyLetters[fromKeySym];
    this.toKeyLetter = Transposer.keyLetters[toKeySym];
    this.distance = this.pitchRing.distance(this.fromKeyLetter, this.toKeyLetter);
    this.fromKeyLUT = keyTable[fromKeySym];
    this.toKeyLUT = keyTable[toKeySym];
  }

  // When transposing, we need to be able to look up the letter for a given key
  // signature.
  static keyLetters = {
    "0": "c", "#1": "g", "#2": "d", "#3": "a", "#4": "e", "#5": "b", "#6": "f#",
    "#7": "c#", "&1": "f", "&2": "b", "&3": "e", "&4": "a", "&5": "d", "&6":
      "g", "&7": "c",
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
