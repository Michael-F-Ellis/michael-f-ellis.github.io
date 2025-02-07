import { normalizeBarlines } from "./textrender.js";
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

// musicToPitchLyric takes a music line (a string) and returns a pitch line  and
// a lyric line as an object of the  form {lyric: string, pitch: string }
//
// The lyric line is constructed by identifying all key signature and pitch
// tokens in the music and replacing the pitch tokens with asterisks.
//
// The pitch line is constructed by removing all the hold or rest
// characters, '-' and ';'the from music line.
//
// For example, if the music line is `K#2 c; d -e f |` the lyric line
// will be `*; * -* * |` and the pitch line will be `K#2 c d e f |`. 
export function musicToPitchLyric(musicLine) {
  let lyricLine = musicLine;
  let pitchLine = musicLine;

  // Remove key signatures and replace pitch tokens with asterisks to create the
  // lyric line.
  lyricLine = lyricLine.replace(/K[#&]?\d/g, "")
    .replace(/\^*\/*[#&%]*[a-g]/g, "*");

  // Remove hold, rest and underscore characters from the pitch line
  pitchLine = pitchLine.replace(/[-=;_]/g, "");

  // Now remove any numeric prefixes from tokens in the pitch line
  pitchLine = pitchLine.replace(/\s[0-9]*/g, " ");

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
export function preprocessScore(text) {
  text = stripComments(text);
  const blocks = text.split(/\n\s*\n/);
  //console.log(blocks);
  const data = { text: text, lines: [], showIntervals: false };

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
  // loop through the blocks in reverse order.
  for (let i = blocks.length - 1; i >= 0; i--) {
    let block = blocks[i].trim();
    if (block.startsWith("youtube:")) {
      // youtube video id with optional default play rate
      // e.g. youtube:12345678 0.75
      const parts = block.slice(8).trim().split(" ");
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
    if (block.startsWith("staff:")) {
      data.staff = block.slice(6).trim();
      blocks.splice(i, 1);
      continue;
    }
    if (block.startsWith("title:")) {
      data.title = block.slice(6).trim();
      blocks.splice(i, 1);
      continue;
    }
    if (block.startsWith("intervals:")) {
      data.showIntervals = true;
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
      const [key, value] = splitFirst(part, ':');
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
        case "nomarkers":
          obj.nomarkers = true;
          break;
        default:
          if (k !== "" && value !== undefined) {
            // if it's a lyric line, substiute '--' for '='
            if (k === "lyric" || k === "music") {
              const q = normalizeBarlines(value);
              const v = q.replace(/=/g, '--');
              obj[k] = v.trim();
            } else {
              obj[k] = value.trim();
            }
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
