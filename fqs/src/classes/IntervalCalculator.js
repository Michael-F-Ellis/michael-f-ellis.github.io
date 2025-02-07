export class IntervalCalculator {
  constructor() {
    // Map each letter to its white key position from C
    this.whiteKeyPosition = new Map([
      ['c', 0], ['d', 1], ['e', 2], ['f', 3],
      ['g', 4], ['a', 5], ['b', 6]
    ]);

    // Perfect intervals are those with simple numbers 1,4,5,8
    this.perfectIntervals = new Set([1, 4, 5, 8]);
  }

  calculateInterval(pitch1, pitch2) {
    // Get base positions on white keys
    const pos1 = this.whiteKeyPosition.get(pitch1.letter) + (pitch1.octave * 7);
    const pos2 = this.whiteKeyPosition.get(pitch2.letter) + (pitch2.octave * 7);

    // Full interval number from position difference
    const number = Math.abs(pos2 - pos1) + 1;

    // Simple number for quality determination
    const simpleNumber = ((number - 1) % 7) + 1;

    // Direction from position comparison
    const ascending = pos2 > pos1;

    // Quality based on accidental modifications
    const quality = this.determineQuality(pitch1, pitch2, simpleNumber, ascending);

    return { number, quality, ascending };
  }

  determineQuality(pitch1, pitch2, simpleNumber, ascending) {
    // modTable accounts for the minor, diminished, and augmented intervals
    // in the natural note (C major) scale. 
    // Usage: mod = modTable[lowerPitch.letter][pperPitch.letter];
    const modTable = {
      'c': {}, // no modifications since all intervals from C are perfect or major
      'd': { 'f': -1, 'c:': -1 }, // m3, m7
      'e': { 'f': -1, 'g': -1, 'c': -1, 'd': -1 },
      'f': { 'b': 1 }, // A4
      'g': { 'f': -1 },
      'a': { 'c': -1, 'f': -1, 'g': -1, },
      'b': { 'c': -1, 'd': -1, 'f': -1, 'g': -1, 'a': -1 } // m2, m3, d5, m6, m7
    }

    const p1 = pitch1.letter;
    const p2 = pitch2.letter;
    const acc1 = this.getAccidentalValue(pitch1.accidentalClass);
    const acc2 = this.getAccidentalValue(pitch2.accidentalClass);
    let modification = 0;
    if (ascending) {
      modification += modTable[p1][p2] || 0;
      modification -= acc1;
      modification += acc2;
    } else {
      modification += modTable[p2][p1] || 0;
      modification -= acc2
      modification += acc1
    }

    return this.mapDifferenceToQuality(simpleNumber, modification);
  }

  getAccidentalValue(acc) {
    const values = {
      '♯': 1, '♭': -1, '𝄪': 2, '𝄫': -2, '♮': 0
    };
    return values[acc] || 0;
  }

  mapDifferenceToQuality(number, difference) {
    if (this.perfectIntervals.has(number)) {
      switch (difference) {
        case -2: return 'double-diminished';
        case -1: return 'diminished';
        case 0: return 'perfect';
        case 1: return 'augmented';
        case 2: return 'double-augmented';
      }
    } else {
      switch (difference) {
        case -2: return 'double-diminished';
        case -1: return 'minor';
        case 0: return 'major';
        case 1: return 'augmented';
        case 2: return 'double-augmented';
      }
    }
  }
}
