import { updateFontSizes } from './src/utils/parameters.js';
import { initYouTubeAPI, } from './src/utils/youtube.js';
import { Score } from './src/classes/Score.js';
/*********************************************************************
  Module globals
*********************************************************************   
*/

// Initialize on page load
window.addEventListener('load', () => {
  updateFontSizes();
  initYouTubeAPI();
});
/*
********************************************************************
   Classes 
*********************************************************************
*/

class Book {
  // A Book is a collection of Scores.
  constructor(containerid) {
    this.container = document.getElementById(containerid);
    this.scores = new Map(); // Will hold scores keyed by score.id
    this.delimiter = "\nEndOfScore\n" // delimiter between scores in exportable .fqs format
    this.controlsVisible = true;
  }
  // enforceControlsVisibility() hides or shows the book-actions div of each score according to the
  // controlsVisible flag.
  enforceControlsVisibility() {
    const actiondivs = document.querySelectorAll('div.book-actions');
    for (const actiondiv of actiondivs) {
      actiondiv.style.display = this.controlsVisible ? 'block' : 'none';
    }
  }

  // pageBreak returns a div that will force a page break.
  // Credit: https://stackoverflow.com/a/58245474/426853
  pageBreak() {
    const pageBreakDiv = document.createElement('div');
    pageBreakDiv.style.breakAfter = 'page';
    return pageBreakDiv;
  }

  // addScore() adds a score to the book. If nextSibling is specified, the score
  // will be inserted after the specified sibling. Otherwise, it will be
  // appended to the end. A set of control buttons is prepended to the score.
  addScore(scoreText, nextSibling) {
    const score = new Score(scoreText, this.container);
    if (!score) {
      return;
    }

    // Create book-actions div with control buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('book-actions');

    // Insert new score button
    const insertButton = document.createElement('button');
    insertButton.textContent = 'Insert new score';
    insertButton.onclick = () => {
      const newScore = this.addScore("title: New Score", score.outer);
      //const newScore = this.addScore("title: New Score", score.outer.nextSibling);
      newScore.showSourceEditor();
    };
    actionsDiv.appendChild(insertButton);

    // Delete score button  
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete score';
    deleteButton.onclick = () => {
      if (confirm('Delete this score?')) {
        this.deleteScore(score.id);
      }
    };
    actionsDiv.appendChild(deleteButton);

    // Edit mode toggle button
    const editButton = document.createElement('button');
    editButton.textContent = 'Toggle edit mode';
    editButton.onclick = () => score.toggleEdit();
    actionsDiv.appendChild(editButton);

    // Jump to TOC button
    const tocButton = document.createElement('button');
    tocButton.textContent = 'Contents';
    tocButton.onclick = () => {
      document.getElementById('score-toc').scrollIntoView();
    };
    actionsDiv.appendChild(tocButton);

    // Add actions div at top of score
    score.outer.prepend(actionsDiv);
    score.outer.append(this.pageBreak());

    // Add updateToc as a post-render callback
    score.postRenderCallback = () => this.updateToc();
    // Insert the score 
    if (nextSibling) {
      this.container.insertBefore(score.outer, nextSibling);
    } else {
      this.container.appendChild(score.outer);
    }

    // Add score to map and render
    this.scores.set(score.id, score);
    score.render();
    this.updateToc();
    return score;
  }
  // deleteScore(id) deletes the score with the given id.
  deleteScore(id) {
    const scorediv = document.getElementById(id);
    scorediv.remove();
    this.scores.delete(id);
    this.updateToc();
  }
  // importFromText(text) imports scores from a string containing the scores in the
  // format produced by exportToText().
  importFromText(text) {
    const scoreTexts = text.split(this.delimiter);
    for (const scoreText of scoreTexts) {
      if (scoreText.trim() === '') {
        continue;
      }
      this.addScore(scoreText, null); // null means append to end of container
    }
  }
  // exportToText() returns a string containing all the scores in the book with
  // the delimiter expected by importFromText().
  exportToText() {
    let text = '';
    const scores = this.getScores();
    scores.forEach(score => {
      text += score.getText() + this.delimiter;
    });
    return text;
  }
  // getScores() returns an array of scores in the order they appear in the container.
  getScores() {
    const scoredivs = document.querySelectorAll('div.score');
    const scores = [];
    for (const scorediv of scoredivs) {
      const score = this.scores.get(scorediv.id);
      if (score) {
        scores.push(score);
      }
    }
    return scores;
  }

  // render() renders all the scores in the book into the container.  before
  // rendering it scans the container to determine the order of the scores.  The
  // scores are rendered in the order they appear in the container.
  render() {
    // get the scores in order
    const scores = this.getScores()
    if (scores.length === 0) {
      return;
    }
    const texts = scores.map(score => score.getText());

    // clear the container
    this.container.innerHTML = '';

    // recreate and render the  scores in order
    for (const text of texts) {
      const score = new Score(text, this.container);
      if (score) {
        this.addScore(text, null); // null means append to end of container
      }
    }
  }
  // updateToc() updates the table of contents (TOC) at the top of the page.
  updateToc() {
    // get the toc div
    const toc = document.getElementById('score-toc');
    if (!toc) {
      return;
    }
    // clear the toc
    toc.innerHTML = '';

    // get the scores in order
    const scores = this.getScores()
    // add the toc entries
    toc.appendChild(document.createTextNode('Contents\n'));
    const ul = toc.appendChild(document.createElement('ul'));
    scores.forEach(score => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.setAttribute('href', `#${score.id}`);
      link.setAttribute('class', 'link-to-score');
      link.textContent = score.getTitle();
      li.appendChild(link);
      ul.appendChild(li);
    });
    toc.appendChild(this.pageBreak());
  }
}
export {
  Book
}
