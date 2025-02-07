import { appendSVGTextChild } from "../utils/svg.js";
// The Counter class is similar to the PerBeat class. It provides
// an automated method for rendering beat numbers above the beats.
// The constructor takes 2 arguments:
//    n, the first beat number (should be 1 unless we're starting with a partial measure)
//    lyricLine, an object containing beats and bars arrays for positioning
//    markers, an array of RhythmMarkers used to compute the locations of tuplet beats
export class Counter {
  constructor(n, lyricLine, markers) {
    this.n = n;
    this.beats = lyricLine.beats;
    this.subBeats = lyricLine.subBeats;
    this.bars = lyricLine.bars;
    if (this.bars[0] == 0) {
      this.bars.shift(); // drop the pseudo barline at 0
    }
    this.markers = markers;
    this.tuplets = lyricLine.tuplets;
    this.interpolateTuplets();

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
      this.counts.push(count);
      count++;
    }
  }
  reverseInterpolate(deltaPairs, targetY) {
    // Convert delta pairs to cumulative coordinates
    let points = [[0, 0]];
    let sumX = 0, sumY = 0;

    for (const [dx, dy] of deltaPairs) {
      sumX += dx;
      sumY += dy;
      points.push([sumX, sumY]);
    }

    // Find interval containing targetY
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];

      if (targetY >= y0 && targetY <= y1) {
        // Linear interpolation within interval
        const fraction = (targetY - y0) / (y1 - y0);
        return x0 + fraction * (x1 - x0);
      }
    }

    return null; // Target Y is outside the function's range
  }

  getNEqualDivisions(deltaPairs, N) {
    // Calculate total Y accumulation
    const totalY = deltaPairs.reduce((sum, [_, dy]) => sum + dy, 0);

    // Calculate Y increment for N divisions
    const increment = totalY / N;

    // Generate array of target Y values
    const divisions = [];
    for (let i = 1; i < N; i++) {
      const targetY = i * increment;
      const x = this.reverseInterpolate(deltaPairs, targetY);
      divisions.push(x);
    }

    return divisions;
  }

  interpolateTuplets() {
    const interpolatedBeats = [];

    for (const [i, beat] of this.beats.entries()) {
      interpolatedBeats.push(beat);

      const fractions = this.markers.beatFractions[i];
      // if (!fractions || fractions.length <= 1) continue;
      if (!fractions) continue;

      // Convert fractions to delta pairs
      const deltaPairs = fractions.map(f => [f.span, f.val]);

      // Calculate actual beat span from the sum of spans
      const beatSpan = deltaPairs.reduce((sum, [dx, _]) => sum + dx, 0);

      // Get N-1 interpolated positions for N-tuplet
      const divisions = this.getNEqualDivisions(deltaPairs, this.tuplets[i].tupletSize);

      // Map the normalized positions to actual beat positions
      const positions = divisions.map(x => beat + x);
      interpolatedBeats.push(...positions);
    }

    this.beats = interpolatedBeats;
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
