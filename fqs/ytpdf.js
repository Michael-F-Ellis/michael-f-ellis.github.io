// Get reference to the PDF.js library 
const pdfjsLib = window['pdfjs-dist/build/pdf'];

// Configure the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
class YTPDFViewer {
	constructor() {
		this.pdfDoc = null;
		this.pageNum = 1;
		this.videoIds = new Map(); // Store video IDs by page number
		this.pageLabels = new Map(); // Store labels by page number
		this.canvas = document.getElementById('pdf-render');
		this.ctx = this.canvas.getContext('2d');

		// Save/Load controls
		this.addSaveLoadControls();

		// Add page navigation controls
		this.addNavigationControls();

		// Set up file input handler
		document.getElementById('file-input')
			.addEventListener('change', this.handleFileSelect.bind(this));

		// Add YouTube player initialization
		this.initYouTubeAPI();
		this.player = null;

		// Add video ID button to toolbar
		this.addVideoControls();

		// Add time display
		this.addTimeDisplay();
		this.startTimeUpdates();

		// Add to existing constructor
		this.markers = new Map(); // pageNum -> array of {x, y, time, rate}
		this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));

		// Add property to store original file handle
		this.pdfFileHandle = null;
	}

	addSaveLoadControls() {
		const saveButton = document.createElement('button');
		saveButton.textContent = 'Save Annotations';
		saveButton.onclick = () => this.saveAnnotations();

		const loadInput = document.createElement('input');
		loadInput.type = 'file';
		loadInput.accept = '.json';
		loadInput.style.display = 'none';
		loadInput.onchange = (e) => this.loadAnnotations(e.target.files[0]);

		const loadButton = document.createElement('button');
		loadButton.textContent = 'Load Annotations';
		loadButton.onclick = () => loadInput.click();

		document.getElementById('toolbar').appendChild(loadButton);
		document.getElementById('toolbar').appendChild(saveButton);
		document.getElementById('toolbar').appendChild(loadInput);
	}
	addNavigationControls() {
		const controls = document.createElement('div');
		controls.innerHTML = `
				<button id="prev">Previous</button>
				<span id="page-info">Page <span id="page-num">1</span> of <span id="page-count">-</span></span>
				<button id="next">Next</button>
			`;
		document.getElementById('toolbar').appendChild(controls);

		// Add event listeners
		document.getElementById('prev').onclick = () => this.prevPage();
		document.getElementById('next').onclick = () => this.nextPage();

		const gotoButton = document.createElement('button');
		gotoButton.textContent = 'Go To...';
		gotoButton.onclick = () => this.showTOC();

		const tocDiv = document.createElement('div');
		tocDiv.id = 'toc';
		tocDiv.style.display = 'none';

		document.getElementById('toolbar').appendChild(gotoButton);
		document.getElementById('toolbar').appendChild(tocDiv);
	}

	addVideoControls() {
		const videoButton = document.createElement('button');
		videoButton.id = 'set-video';
		videoButton.textContent = 'Set YouTube Video';
		videoButton.onclick = () => this.promptForVideoId();

		const videoInfo = document.createElement('span');
		videoInfo.id = 'video-info';

		const controls = document.createElement('div');
		controls.appendChild(videoButton);
		controls.appendChild(videoInfo);

		document.getElementById('toolbar').appendChild(controls);
	}

	addTimeDisplay() {
		const timeDisplay = document.createElement('span');
		timeDisplay.id = 'time-display';
		timeDisplay.style.marginLeft = '10px';
		document.getElementById('toolbar').appendChild(timeDisplay);
	}

	startTimeUpdates() {
		// Update time display every 100ms when playing
		setInterval(() => {
			if (this.player && this.player.getPlayerState() === YT.PlayerState.PLAYING) {
				const time = this.player.getCurrentTime();
				document.getElementById('time-display').textContent =
					`Time: ${time.toFixed(1)}s`;
			}
		}, 100);
	}

	async saveAnnotations() {
		const data = {
			videoIds: Array.from(this.videoIds.entries()),
			markers: Array.from(this.markers.entries()),
			pages: Array.from(this.pageLabels.entries())

		};

		// Construct default filename from PDF name
		const baseName = this.originalFileName.replace('.pdf', '');
		const suggestedName = `${baseName}-annotations.json`;

		try {
			// Show native file save dialog
			const handle = await window.showSaveFilePicker({
				suggestedName: suggestedName,
				types: [{
					description: 'JSON Files',
					accept: { 'application/json': ['.json'] },
				}],
				// Start in same directory as PDF if we have it
				startIn: this.pdfFileHandle?.directory
			});

			// Write the file
			const writable = await handle.createWritable();
			await writable.write(JSON.stringify(data));
			await writable.close();
		} catch (err) {
			if (err.name !== 'AbortError') {
				console.error('Failed to save:', err);
			}
		}
	}

	promptForVideoId() {
		const defaultLabel = `Page ${this.pageNum}`;
		const currentLabel = this.pageLabels.get(this.pageNum) || defaultLabel;
		const currentId = this.videoIds.get(this.pageNum) ||
			(this.pageNum > 1 ? this.videoIds.get(this.pageNum - 1) : '');

		// Create custom dialog
		const dialog = document.createElement('div');
		dialog.className = 'modal-dialog';
		dialog.innerHTML = `
        <div class="dialog">
            <label>Page Label:<br>
                <input type="text" id="page-label" value="${currentLabel}">
            </label><br>
            <label>Video ID:<br>
                <input type="text" id="video-id" value="${currentId}">
            </label><br>
            <button id="save">Save</button>
            <button id="cancel">Cancel</button>
        </div>
    `;

		// Style the modal overlay
		dialog.style.position = 'fixed';
		dialog.style.top = '0';
		dialog.style.left = '0';
		dialog.style.width = '100%';
		dialog.style.height = '100%';
		dialog.style.backgroundColor = 'rgba(0,0,0,0.5)';
		dialog.style.display = 'flex';
		dialog.style.alignItems = 'center';
		dialog.style.justifyContent = 'center';

		// Style the dialog box
		const dialogBox = dialog.querySelector('.dialog');
		dialogBox.style.backgroundColor = 'white';
		dialogBox.style.padding = '20px';
		dialogBox.style.borderRadius = '5px';

		const cleanup = () => {
			if (dialog.parentNode) {
				document.body.removeChild(dialog);
			}
		};

		// Handle dialog actions
		dialog.querySelector('#save').onclick = () => {
			const label = dialog.querySelector('#page-label').value;
			const videoId = dialog.querySelector('#video-id').value;

			if (videoId) {
				this.videoIds.set(this.pageNum, videoId);
				this.pageLabels.set(this.pageNum, label);
				this.updateVideoInfo();
			}
			cleanup();
		};

		dialog.querySelector('#cancel').onclick = cleanup;

		// Add dialog to DOM
		document.body.appendChild(dialog);
	}

	updateVideoInfo() {
		const videoInfo = document.getElementById('video-info');
		const videoId = this.videoIds.get(this.pageNum);
		videoInfo.textContent = videoId ? ` (Video: ${videoId})` : '';
	}

	async handleFileSelect(event) {
		const file = event.target.files[0];
		this.originalFileName = file.name;
		if (file.type !== 'application/pdf') {
			console.error('Not a PDF file');
			return;
		}

		// Load the PDF file
		const fileReader = new FileReader();
		fileReader.onload = async (event) => {
			const typedarray = new Uint8Array(event.target.result);
			await this.loadPDF(typedarray);
		};
		fileReader.readAsArrayBuffer(file);
	}
	async loadPDF(pdfData) {
		try {
			this.pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
			// Update page count display
			document.getElementById('page-count').textContent = this.pdfDoc.numPages;
			this.renderPage(this.pageNum);
		} catch (error) {
			console.error('Error loading PDF:', error);
		}
	}

	async renderPage(num) {
		const page = await this.pdfDoc.getPage(num);
		const viewport = page.getViewport({ scale: 1.0 });
		this.canvas.height = viewport.height;
		this.canvas.width = viewport.width;

		const renderContext = {
			canvasContext: this.ctx,
			viewport: viewport
		};
		await page.render(renderContext);

		// Update page number display
		document.getElementById('page-num').textContent = num;

		// Clear existing SVG overlay
		if (this.svg) {
			this.svg.innerHTML = '';
		}

		// Load the correct video for this page if needed
		/*
		const videoId = this.videoIds.get(this.pageNum);
		if (videoId && this.player &&
			this.player.getVideoData().video_id !== videoId) {
			this.player.loadVideoById(videoId);
		}
			*/

		// Redraw markers for current page
		const pageMarkers = this.markers.get(this.pageNum) || [];
		pageMarkers.forEach(marker => {
			this.drawMarker(marker.x, marker.y);
		});
	}

	prevPage() {
		if (this.pageNum <= 1) return;
		this.pageNum--;
		this.renderPage(this.pageNum);
	}

	nextPage() {
		if (this.pageNum >= this.pdfDoc.numPages) return;
		this.pageNum++;
		this.renderPage(this.pageNum);
	}

	initYouTubeAPI() {
		// Load YouTube IFrame API
		const tag = document.createElement('script');
		tag.src = "https://www.youtube.com/iframe_api";
		const firstScriptTag = document.getElementsByTagName('script')[0];
		firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

		// Add hidden player div
		const playerDiv = document.createElement('div');
		playerDiv.id = 'player';
		playerDiv.style.display = 'none';
		document.body.appendChild(playerDiv);
	}

	initPlayer() {
		// Called by YouTube API when ready
		this.player = new YT.Player('player', {
			height: '0',
			width: '0',
			host: 'https://www.youtube-nocookie.com',
			playerVars: {
				'playsinline': 1,
				origin: window.location.host
			}
		});
	}

	playYouTubeAt(videoId, timeSeconds, rate = 1.0) {
		if (!this.player || !this.player.playVideo) {
			setTimeout(() => this.playYouTubeAt(videoId, timeSeconds, rate), 100);
			return;
		}
		// Add error handling
		const onError = (event) => {
			const errors = {
				2: 'Invalid video ID or embedding disabled',
				5: 'HTML5 player error',
				100: 'Video not found',
				101: 'Embedding not allowed',
				150: 'Embedding not allowed'
			};
			const message = errors[event.data] || 'Unknown playback error';
			alert(`Cannot play video: ${message}`);
		};

		this.player.addEventListener('onError', onError);
		if (this.player.getPlayerState() === YT.PlayerState.PLAYING) {
			this.player.pauseVideo();
			return;
		}

		if (this.player.getVideoData().video_id !== videoId) {
			this.player.loadVideoById(videoId, timeSeconds);
		} else {
			this.player.seekTo(timeSeconds);
		}

		try {
			this.player.setPlaybackRate(rate);
			this.player.playVideo();
			// Update time display immediately on play
			document.getElementById('time-display').textContent =
				`Time: ${timeSeconds.toFixed(1)}s`;
		} catch (e) {
			console.error("Playback error:", e);
		}
	}

	handleCanvasClick(event) {
		const videoId = this.videoIds.get(this.pageNum);
		if (!videoId) {
			alert('Please set a YouTube video ID for this page first');
			return;
		}

		// Get click coordinates relative to canvas
		const rect = this.canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		// Prompt for timestamp and rate
		const time = prompt('Enter start time in seconds:', '0');
		if (!time) return;

		const rate = prompt('Enter playback rate (0.25-2):', '1.0');
		if (!rate) return;

		// Store marker
		if (!this.markers.has(this.pageNum)) {
			this.markers.set(this.pageNum, []);
		}
		this.markers.get(this.pageNum).push({
			x, y,
			time: parseFloat(time),
			rate: parseFloat(rate)
		});

		// Draw marker
		this.drawMarker(x, y);
	}

	drawMarker(x, y) {
		// Create SVG overlay if it doesn't exist
		if (!this.svg) {
			this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			this.svg.style.position = 'absolute';
			this.svg.style.left = this.canvas.offsetLeft + 'px';
			this.svg.style.top = this.canvas.offsetTop + 'px';
			this.svg.style.width = this.canvas.width + 'px';
			this.svg.style.height = this.canvas.height + 'px';
			// Make SVG transparent to pointer events except for its children
			this.svg.style.pointerEvents = 'none';
			this.canvas.parentNode.appendChild(this.svg);
		}

		const speaker = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		speaker.setAttribute('x', x);
		speaker.setAttribute('y', y);
		speaker.textContent = '🔊';
		speaker.style.cursor = 'pointer';
		// Enable pointer events just for the speaker icon
		speaker.style.pointerEvents = 'auto';

		speaker.onclick = () => {
			const marker = this.markers.get(this.pageNum).find(m => m.x === x && m.y === y);
			this.playYouTubeAt(this.videoIds.get(this.pageNum), marker.time, marker.rate);
		};

		this.svg.appendChild(speaker);
	}

	loadAnnotations(file) {
		const reader = new FileReader();
		reader.onload = (e) => {
			const data = JSON.parse(e.target.result);
			this.videoIds = new Map(data.videoIds);
			this.markers = new Map(data.markers);
			this.pageLabels = new Map(data.pages || []);
			// Refresh current page display
			this.renderPage(this.pageNum);
		};
		reader.readAsText(file);
	}
	showTOC() {
		const tocDiv = document.getElementById('toc');
		if (tocDiv.style.display === 'none') {
			const toc = document.createElement('ul');

			// Create sorted entries from pageLabels
			Array.from(this.pageLabels.entries())
				.sort((a, b) => a[0] - b[0])
				.forEach(([pageNum, label]) => {
					const li = document.createElement('li');
					const link = document.createElement('a');
					link.href = '#';
					link.textContent = label;
					link.onclick = (e) => {
						e.preventDefault();
						this.renderPage(pageNum);
						tocDiv.style.display = 'none';
					};
					li.appendChild(link);
					toc.appendChild(li);
				});

			tocDiv.innerHTML = '';
			tocDiv.appendChild(toc);
			tocDiv.style.display = 'block';
		} else {
			tocDiv.style.display = 'none';
		}
	}
}

// Add global callback for YouTube API
window.onYouTubeIframeAPIReady = () => {
	window.ytPdfViewer?.initPlayer();
};

// Initialize viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	window.ytPdfViewer = new YTPDFViewer();
});

