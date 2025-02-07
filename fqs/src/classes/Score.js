import { lineProblems } from "./LineProblem.js";
import { defaultParameters } from "../utils/parameters.js";
import { preprocessScore } from "../utils/preprocess.js";
import { LyricLine } from "./LyricLine.js";
import { PitchLine } from "./Pitch.js";
import { renderMultiline } from "../utils/textrender.js";
import { appendSVGTextChild } from "../utils/svg.js";
import { playYouTubeAt } from "../utils/youtube.js";
import { musicToPitchLyric } from "../utils/preprocess.js";
import { ImageLine } from "./ImageLine.js";
import { Cue } from "./Cue.js";
import { PerBar, PerNote, PerBeat, Finger } from "./LineAnnotations.js";
import { Chord } from "./Chord.js";
import { Counter } from "./Counter.js";
import { RhythmMarkers } from "./RhythmMarkers.js";

// Score represents a score div and its associated editable source text.  It
// has a render method that renders the source text as FQS musical notation.
// The nested html structure of the rendered score is:
//
// container: (div supplied by the caller, may contain multiple scores)
//     outer: (class score)
//         controls: (optionally inserted by caller)
//         wrapper: (class score-wrapper)
//             inner: (class inner-wrapper)
// .               svg: (portion of rendered score)
//                 editor: (editable pre for portion of rendered score)
// .               ... (multiple svg+editor elements)
//             sourcediv:
//                 source: (editable pre for entire score text)
//
//     ... (multiple score elements)
export const scoreMap = new Map();
export class Score {
  constructor(text, container) {
    this.dirty = false; //  true if the score has been modified
    this.editMode = false;
    this.outer = document.createElement('div');
    this.outer.classList.add('score');
    this.id = `score-${Math.random().toString(36).substring(2, 15)}`;
    this.outer.setAttribute('id', this.id);
    scoreMap.set(this.id, this);
    // next comes a wrapper div that will contain the rendered
    // and the editable source text.
    this.wrapper = document.createElement('div');
    this.wrapper.classList.add('score-wrapper');
    this.wrapper.style.display = 'flex';
    this.wrapper.style.width = '100%';
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
    this.source.textContent = text;
    this.sourcediv.appendChild(this.source);
    // a post-render callback, if needed, to update TOC, etc.
    this.postRenderCallback = null;
    // Add the score to the container
    container.appendChild(this.outer);

    this.source.addEventListener('input', () => {
      this.render();
    });
  }

  getText() {
    return this.source.textContent;
  }

  getTitle() {
    const text = this.getText();
    // look for the first line that starts with a 'title:'
    const titleLine = text.split('\n').find(line => line.startsWith('title:'));
    if (titleLine) {
      return titleLine.split(':')[1].trim();
    }
    throw new Error('No title found in score');
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
    const data = preprocessScore(this.source.textContent);
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
    this.dirty = true // signal that the score has been edited
    this.forceEditMode(this.editMode);
    // if there is a postRenderCallback, call it
    if (this.postRenderCallback) {
      this.postRenderCallback();
    }
  }
}
/**************************************************************
  Helper functions
***************************************************************/
function reconstructSectionText(line) {
  let text = '';
  // Build section text from line properties
  if (line.cue) text += `cue: ${line.cue}\n`;
  if (line.chord) text += `chord: ${line.chord}\n`;
  if (line.perbeat) text += `perbeat: ${line.perbeat}\n`;
  if (line.finger) text += `finger: ${line.finger}\n`;
  if (line.music) {
    text += `music: ${line.music}\n`;
  } else if (line.pitch) {
    text += `pitch: ${line.pitch}\n`;
  }
  if (line.perbar) text += `perbar: ${line.perbar}\n`;
  if (line.lyric) text += `lyric: ${line.lyric}\n`;
  if (line.pernote) text += `pernote: ${line.pernote}\n`;
  if (line.counter) text += `counter: ${line.counter}\n`;
  if (line.rhythm) text += `rhythm:\n`;
  if (line.text) text += `text: ${line.text}\n`;
  if (line.play) {
    const minutes = Math.floor(line.play / 60);
    const seconds = line.play - (minutes * 60);
    text += `play: ${minutes}:${seconds < 10 ? '0' + seconds : seconds}`
    if (line.playRate) {
      text += ` ${line.playRate}`;
    }
    text += '\n';
  }
  if (line.image) {
    text += `image: ${line.image}\n`;
  }
  if (line.nomarkers) {
    text += `nomarkers:\n`;
  }
  // ... add other line properties
  return text;
}

// The renderScore function is used to render the score using the
// members of the data object created by preprocessScore.
//  - wrapper is a div element that will hold svg's we create
//  - data is an object containing the preprocessed score
function renderScore(wrapper, data) {
  // The addEditor function is a closure that adds editing capabilities to a
  // section of the score. The svg argument is the svg element that will
  // be edited.  
  const addEditor = (svg) => {
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
      const score = scoreMap.get(scoreDiv.id);
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
  y = lineProblems.render(svg, defaultParameters.leftX, y);
  lineProblems.clear();

  // Render the title at the top of the SVG element
  y += 2 * defaultParameters.titleFontHeight
  appendSVGTextChild(svg, defaultParameters.leftX, y, data.title, ['title']);

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
    if (data.staff) {
      titleText += `\n\nstaff: ${data.staff}`;
    } else {
      data.staff = 4;
    }
    if (data.intervals) {
      titleText += `\n\nintervals: ${data.intervals}`;
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
      y += 2 * defaultParameters.lyricFontHeight + defaultParameters.textFontHeight;
      y = renderMultiline(svg, defaultParameters.leftX, y,
        line.text, defaultParameters.textFontHeight, 'text');
      y += defaultParameters.textFontHeight
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
        line.lyric, line.showLyric);
    }
    y += defaultParameters.lyricFontHeight
    // Render the image, if any. 
    if (line.image) {
      const image = new ImageLine(line.image);
      if (image.wellFormed) {
        image.render(svg, defaultParameters.leftX, y);
      }
    }
    // Render the cue, if any
    if (line.cue) {
      if (!line.lyric) {
        y += defaultParameters.lyricFontHeight;
      } else {
        y += defaultParameters.lyricFontHeight;
      }
      const cue = new Cue(line.cue);
      cue.render(svg, defaultParameters.leftX, y);
    }
    // Render the chords, if any
    if (line.chord && line.lyric) {
      y += defaultParameters.chordFontHeight
      const chord = new Chord(line.chord);
      chord.render(svg, defaultParameters.leftX, y, lyricline.beats, defaultParameters.lyricFontWidth);
      // y += bookParameters.chordFontHeight / 3;
    }
    // Render per-beat items, if any
    if (line.perbeat && line.lyric) {
      y += defaultParameters.perbeatFontHeight * 1.5
      const perbeat = new PerBeat(line.perbeat)
      perbeat.render(svg, defaultParameters.leftX, y, lyricline)
    }
    // Generate rhythm markers. They're needed by Counter.
    let rhythm = undefined;
    if (lyricline) {
      rhythm = new RhythmMarkers(lyricline);
    }
    // Render the rhythm markers unless nomarkers has been set.
    if (line.lyric && !line.nomarkers) {
      // check that there is a least one non-empty rhythm marker before
      // rendering them. This saves vertical space when possible.
      if (rhythm.beatFractions.map(r => r.length > 0).reduce((a, b) => a || b, true)) {
        y += defaultParameters.lyricFontHeight * 1.1
        rhythm.render(svg, defaultParameters.leftX, y, lyricline.beats, defaultParameters.lyricFontWidth);
      }
    }
    // Render the pitches, if any
    let pitchLine = undefined;
    // console.log(`${y} y before pitch line decision`)
    if (line.pitch && line.lyric) {
      y += data.staff * defaultParameters.lyricFontHeight;
      // console.log(`${y} y before pitch line render`)
      try {
        pitchLine = new PitchLine(line.pitch, data.staff);
        pitchLine.render(svg, defaultParameters.leftX, y,
          defaultParameters, lyricline, data.showIntervals);
        // y += data.staff * defaultParameters.lyricFontHeight;
        // console.log(`${y} y after pitch line render`)
      } catch (e) {
        lineProblems.add("Pitch line error: " + e.message);
        //console.log(e);
      }
    }
    // Render the fingerings, if any
    if (line.finger && line.lyric) {
      const finger = new Finger(lyricline, pitchLine)
      finger.render(svg, line.finger)
    }
    if (line.perbar && line.lyric) {
      y += defaultParameters.perbarFontHeight;
      const perbar = new PerBar(line.perbar);
      perbar.render(svg, defaultParameters.leftX, y, lyricline);
    }
    // Render the lyric
    if (line.showLyric) {
      y += 1.1 * defaultParameters.lyricFontHeight;
      if (line.lyric) {
        lyricline.render(svg, defaultParameters.leftX, y, defaultParameters.lyricFontWidth);
      }
    }

    // Render the per note expression marks, if any.
    if (line.pernote && line.lyric) {
      y += defaultParameters.pernoteFontHeight * 1.5; // 2 px extra space between exprs and lyric to clear descenders
      const expr = new PerNote(line.pernote);
      // expr.render(svg, bookParameters.leftX, y, lyricline.attacks, bookParameters.lyricFontWidth);
      expr.render(svg, defaultParameters.leftX, y, lyricline);
    }
    // Render the counter, if any
    if (line.counter && line.lyric) {
      y += defaultParameters.counterFontHeight * 1.5
      // line counter may be an empty string or a string that should be convertible to an integer
      let npartial = 0;
      if (line.counter.length > 0) {
        try {
          npartial = parseInt(line.counter);
        } catch (e) {
          lineProblems.add(`Invalid counter value: ${line.counter}`);
        }
      }
      const counter = new Counter(npartial, lyricline, rhythm);;
      counter.render(svg, defaultParameters.leftX, y, defaultParameters.lyricFontWidth)
      // y += bookParameters.counterFontHeight / 3;
    }
    // Render any line problems that were encountered
    y = lineProblems.render(svg, defaultParameters.leftX, y);
    lineProblems.clear();

    // Add click handler for play click handlers
    if (data.youtubeId && line.play !== undefined) {
      svg.style.cursor = 'pointer';
      const speaker = appendSVGTextChild(svg, 0, 48, "🔊", ["speaker-icon"]);

      // Add timestamp data attribute used by onPlayerStateChange()
      speaker.dataset.timestamp = String(line.play);

      speaker.addEventListener('click', (event) => {
        if (event.detail === 1) { // Single click
          setTimeout(() => {
            if (!event.target.clickProcessed) {
              // Remove active class from all icons first
              document.querySelectorAll('.speaker-icon').forEach(icon => {
                icon.classList.remove('speaker-icon-active');
              });
              playYouTubeAt(data.youtubeId, line.play, line.playRate || 1.0);
            }
          }, 200); // Delay to allow for double click detection
        }
        event.target.clickProcessed = (event.detail === 2);
      });
    }
  });
}
