import { lineProblems } from './LineProblem.js';
import { appendSVGTextChild } from '../utils/svg.js';
// The ImageLine  class supports the 'image:' keyword.
export class ImageLine {
  // This WeakMap holds window-level listeners for image resize events.  It's
  // purpose is to ensure that listeners are garbage collected when the image
  // popup is destroyed.
  static imageResizeListeners = new WeakMap();

  constructor(text) {
    this.text = text.trim();
    this.wellFormed = false;
    this.fetched = false;

    // Parse URL and optional scale factor
    const parts = this.text.split(/\s+/);
    // validate the URL
    this.url = new URL(parts[0]);
    // check that the URL is a valid image URL
    if (!this.url.href.match(/\.(jpg|jpeg|png|gif|svg)$/i)) {
      lineProblems.add(`invalid image URL: ${parts[0]}`);
      return
    }

    // Set scale
    this.scale = parts[1] ? parseFloat(parts[1]) : 0.9;
    if (isNaN(this.scale) || this.scale <= 0) {
      lineProblems.add("image scale must be a positive number");
      return;
    }
    this.wellFormed = true;

  }
  render(svg, x0, y0) {
    if (!this.wellFormed) return;

    // Create score icon using treble clef
    const icon = appendSVGTextChild(svg, 0, 72, "🎼", ["score-icon"]);

    // Create popup div
    const popup = document.createElement('div');
    popup.className = 'image-popup';
    popup.style.display = 'none';
    popup.style.position = 'fixed';
    popup.style.zIndex = '1000';
    popup.style.backgroundColor = 'white';
    popup.style.border = '1px solid black';
    popup.style.padding = '20px';
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.right = '5px';
    closeButton.style.top = '5px';
    closeButton.style.border = 'none';
    closeButton.style.background = 'none';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    popup.appendChild(closeButton);

    // Create img element
    const img = document.createElement('img');
    img.src = this.url;
    const rescaleImage = () => {
      this.fetched = true;
      const viewportWidth = window.innerWidth;
      img.style.width = `${viewportWidth * this.scale}px`;
      img.style.height = 'auto';
    };

    img.onload = rescaleImage;
    window.addEventListener('resize', rescaleImage);

    // Store the listener with the popup as key.  When popup is removed, its
    // entry in WeakMap is automatically cleared
    ImageLine.imageResizeListeners.set(popup, rescaleImage);

    popup.appendChild(img);
    document.body.appendChild(popup);

    // Add click handlers
    icon.addEventListener('click', () => {
      if (!this.fetched) {
        alert(`image: Failed to load\n${this.url}\nPlease check the URL and try again.`);
        return;
      }
      popup.style.display = 'block';
    });

    closeButton.addEventListener('click', () => {
      popup.style.display = 'none';
    });
  }
}
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  /*
  // Usage:
  fetchWithTimeout('https://example.com/api/data', { method: 'POST' }, 10000)
    .then(response => response.json())
    .then(data => console.log(data))
    .catch(error => console.error(error));
    */
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId); // Clear the timeout if the request succeeds
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error; // Re-throw other errors
  }
}
