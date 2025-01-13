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
		this.modes = {
			PERFORMANCE: 'performance',
			GROUP_REHEARSAL: 'group_rehearsal',
			INDIVIDUAL_REHEARSAL: 'individual_rehearsal',
			EDITING: 'editing',
			MARKING: 'marking'
		};
		this.currentMode = this.modes.PERFORMANCE; // Default mode
		this.markTypes = {
			MARKER: 'marker', // Speaker icon
			NOTE: 'note'	  // Warning icon
		};
		this.currentMarkType = this.markTypes.MARKER;

		this.LONG_PRESS_DURATION = 500; // ms 

		// Add mode toolbar
		this.addModeControls();

		// Save/Load controls
		this.addSaveLoadControls();

		// Add page navigation controls
		this.addNavigationControls();

		// Support keyboard and swipe navigation
		document.addEventListener('keydown', this.handleKeyPress.bind(this));
		// Add mode-aware touch handling
		this.touchStartX = null;
		this.touchStartY = null;
		this.touchStartTime = null;
		this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
		this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));


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

		// Add marker storage.  Markers refers to the speaker icons. 
		this.markers = new Map(); // pageNum -> array of {x, y, time, rate}

		// Add note storage.  Notes refer to the text boxes added by the user.
		this.notes = new Map(); // pageNum -> array of {x, y, text}

		// Master dispatcher for all canvas click events
		this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));

		// Add property to store original file handle
		this.pdfFileHandle = null;
	}
	addModeControls() {
		const modeBar = document.createElement('div');
		modeBar.id = 'mode-toolbar';

		// Create mode buttons with icons
		const modeButtons = [
			{ mode: this.modes.PERFORMANCE, icon: '🎭' },
			{ mode: this.modes.GROUP_REHEARSAL, icon: '👥' },
			{ mode: this.modes.INDIVIDUAL_REHEARSAL, icon: '🎧' },
			{ mode: this.modes.EDITING, icon: '✏️' },
			{ mode: this.modes.MARKING, icon: '➕' }
		];

		modeButtons.forEach(({ mode, icon }) => {
			const button = document.createElement('button');
			button.innerHTML = icon;
			button.dataset.mode = mode; // Add data attribute for mode
			button.onclick = () => this.setMode(mode);
			modeBar.appendChild(button);
		});

		document.getElementById('toolbar').appendChild(modeBar);

		// Initialize button states
		this.setMode(this.currentMode);
	}

	setMode(mode) {
		this.currentMode = mode;
		// Update button appearances
		const modeButtons = document.querySelectorAll('#mode-toolbar button');
		modeButtons.forEach(button => {
			// Dim all buttons by default
			button.style.opacity = '0.5';
			button.style.filter = 'grayscale(1)';
		});

		// Highlight the active mode button
		const activeButton = document.querySelector(`#mode-toolbar button[data-mode="${mode}"]`);
		if (activeButton) {
			activeButton.style.opacity = '1.0';
			activeButton.style.filter = 'none';
		}
		this.updateUIForMode();
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
	updateUIForMode() {
		switch (this.currentMode) {
			case this.modes.PERFORMANCE:
				this.hideYouTubeIcons();
				this.disableAudio();
				this.disableEditing();
				this.setCursor('default');
				break;

			case this.modes.GROUP_REHEARSAL:
				this.hideYouTubeIcons();
				this.disableAudio();
				this.enableEditing();
				this.setCursor('default');
				break;

			case this.modes.INDIVIDUAL_REHEARSAL:
				this.showYouTubeIcons();
				this.enableAudio();
				this.disableEditing();
				this.setCursor('default');
				break;

			case this.modes.EDITING:
				this.showYouTubeIcons();
				this.enableAudio();
				this.enableEditing();
				this.setCursor('url(pencil.cur), auto');
				break;

			case this.modes.MARKING:
				this.showYouTubeIcons();
				this.enableAudio();
				this.disableEditing();
				this.setCursor('crosshair');
				this.promptForMarkType();
				break;
		}
	}
	hideYouTubeIcons() {
		const speakerIcons = document.querySelectorAll('text.speaker-icon');
		speakerIcons.forEach(icon => {
			icon.style.display = 'none';
			icon.style.pointerEvents = 'none';  // Disable interaction when hidden
		});
	}

	showYouTubeIcons() {
		const speakerIcons = document.querySelectorAll('text.speaker-icon');
		speakerIcons.forEach(icon => {
			icon.style.display = ''; // Restore default display value
			icon.style.pointerEvents = 'auto';  // Enable interaction
			icon.style.cursor = 'pointer';      // Restore pointer cursor
		});
	}
	disableAudio() {
		// Stop any currently playing audio
		if (this.player && this.player.getPlayerState() === YT.PlayerState.PLAYING) {
			this.player.pauseVideo();
		}
		// Set flag to prevent new playback
		this.audioEnabled = false;
	}

	enableAudio() {
		// Enable audio playback
		this.audioEnabled = true;
	}

	enableEditing() {
		this.editingEnabled = true;
		if (!this.svg) return;

		// Add single function to handle all dragging
		const makeDraggable = (evt) => {
			let selectedElement = null;
			let offset = null;
			let transform = null;

			const getMousePosition = (evt) => {
				const CTM = this.svg.getScreenCTM();
				if (evt.touches) evt = evt.touches[0];
				return {
					x: (evt.clientX - CTM.e) / CTM.a,
					y: (evt.clientY - CTM.f) / CTM.d
				};
			};

			const startDrag = (evt) => {
				if (evt.target.classList.contains('speaker-icon') ||
					evt.target.classList.contains('note-icon')) {
					selectedElement = evt.target;
					offset = getMousePosition(evt);

					// Get initial transform
					const transforms = selectedElement.transform.baseVal;
					if (transforms.length === 0) {
						const translate = this.svg.createSVGTransform();
						translate.setTranslate(0, 0);
						selectedElement.transform.baseVal.insertItemBefore(translate, 0);
					}
					transform = transforms.getItem(0);
					offset.x -= transform.matrix.e;
					offset.y -= transform.matrix.f;
				}
			};

			const drag = (evt) => {
				if (selectedElement) {
					evt.preventDefault();
					const coord = getMousePosition(evt);
					transform.setTranslate(coord.x - offset.x, coord.y - offset.y);
				}
			};

			const endDrag = () => {
				if (selectedElement) {
					// Update data structures with new position
					const matrix = selectedElement.getCTM();
					const newX = matrix.e;
					const newY = matrix.f;

					if (selectedElement.classList.contains('speaker-icon')) {
						const id = selectedElement.getAttribute('data-marker-id');
						this.updateMarkerPosition(newX, newY);
					} else if (selectedElement.classList.contains('note-icon')) {
						this.updateNotePosition(newX, newY);
					}
					selectedElement = null;
				}
			};

			// Add all event listeners
			this.svg.addEventListener('mousedown', startDrag);
			this.svg.addEventListener('mousemove', drag);
			this.svg.addEventListener('mouseup', endDrag);
			this.svg.addEventListener('mouseleave', endDrag);
			this.svg.addEventListener('touchstart', startDrag);
			this.svg.addEventListener('touchmove', drag);
			this.svg.addEventListener('touchend', endDrag);
			this.svg.addEventListener('touchleave', endDrag);
			this.svg.addEventListener('touchcancel', endDrag);
		};

		// Initialize dragging
		makeDraggable();
	}
	disableEditing() {
		this.editingEnabled = false;
		if (!this.svg) return;

		// Remove all drag-related event listeners
		const events = ['mousedown', 'mousemove', 'mouseup', 'mouseleave',
			'touchstart', 'touchmove', 'touchend', 'touchleave', 'touchcancel'];
		events.forEach(event => {
			this.svg.removeEventListener(event, () => { });
		});
	}
	setCursor(cursorStyle) {
		// Use text cursor for editing mode instead of custom pencil
		const cursor = cursorStyle === 'url(pencil.cur), auto' ? 'text' : cursorStyle;
		this.canvas.style.cursor = cursor;
		document.getElementById('pdf-container').style.cursor = cursor;
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
		// Wait until this.player.getPlayerState() is defined
		if (!this.player || !this.player.getPlayerState) {
			setTimeout(() => this.startTimeUpdates(), 100);
			return;
		}
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
			pages: Array.from(this.pageLabels.entries()),
			notes: Array.from(this.notes.entries())
		};

		// Construct default filename from PDF name
		const baseName = this.originalFileName.replace('.pdf', '');
		const suggestedName = `${baseName}-annotations.json`;

		try {
			// Try native file picker first
			if (window.showSaveFilePicker) {
				const handle = await window.showSaveFilePicker({
					suggestedName: suggestedName,
					types: [{
						description: 'JSON Files',
						accept: { 'application/json': ['.json'] },
					}],
					startIn: this.pdfFileHandle?.directory
				});
				const writable = await handle.createWritable();
				await writable.write(JSON.stringify(data));
				await writable.close();
			} else {
				// Fallback for mobile/unsupported browsers
				const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = suggestedName;
				document.body.appendChild(a);
				a.click();
				URL.revokeObjectURL(url);
				document.body.removeChild(a);
			}
		} catch (err) {
			if (err.name !== 'AbortError') {
				console.error('Failed to save:', err);
			}
		}
	}
	promptForMarkType() {
		// Create custom dialog
		const dialog = document.createElement('div');
		dialog.className = 'modal-dialog';
		dialog.innerHTML = `
    <div class="dialog">
      <h3>Add Mark Type</h3>
      <button id="add-youtube">🔊 YouTube Timestamp</button>
      <button id="add-note">⚠️ Text Annotation</button>
      <button id="cancel">Cancel</button>
    </div>
  `;
		//Apply styles to the dialog
		this.styleDialog(dialog);

		const cleanup = () => {
			if (dialog.parentNode) {
				document.body.removeChild(dialog);
			}
		};

		// Handle dialog actions
		dialog.querySelector('#add-youtube').onclick = () => {
			cleanup();
			this.currentMarkType = this.markTypes.MARKER
		};

		dialog.querySelector('#add-note').onclick = () => {
			cleanup();
			this.currentMarkType = this.markTypes.NOTE
		};

		dialog.querySelector('#cancel').onclick = cleanup;

		// Add dialog to DOM
		document.body.appendChild(dialog);
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

		//Apply styles to the dialog
		this.styleDialog(dialog);

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
		this.pageNum = num;
		const page = await this.pdfDoc.getPage(num);
		const viewport = page.getViewport({ scale: 1.0 });
		this.canvas.height = viewport.height;
		this.canvas.width = viewport.width;

		// Remove old SVG entirely and create fresh one
		if (this.svg) {
			this.svg.remove();
			this.svg = null;
		}

		const renderContext = {
			canvasContext: this.ctx,
			viewport: viewport
		};
		await page.render(renderContext);

		// Update page number display
		document.getElementById('page-num').textContent = num;

		// Redraw markers for current page
		const pageMarkers = this.markers.get(this.pageNum) || [];
		pageMarkers.forEach(marker => {
			this.drawMarker(marker);
		});

		// Redraw the notes for the current page
		const pageNotes = this.notes.get(this.pageNum) || [];
		pageNotes.forEach(note => {
			this.drawNote(note);
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
		// Check if audio is enabled before attempting playback
		if (!this.audioEnabled) {
			return;
		}

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

	handleKeyPress(event) {
		switch (event.key) {
			case 'ArrowRight':
			case 'PageDown':
				this.nextPage();
				break;
			case 'ArrowLeft':
			case 'PageUp':
				this.prevPage();
				break;
			case 'Home':
				this.renderPage(1);
				break;
			case 'End':
				this.renderPage(this.pdfDoc.numPages);
				break;
		}
	}
	// Touch handlers for navigation on  mobile devices
	handleTouchStart(event) {
		// Skip touch handling if in editing mode
		if (this.currentMode === this.modes.EDITING) {
			return;
		}

		this.touchStartX = event.touches[0].clientX;
		this.touchStartY = event.touches[0].clientY;
		this.touchStartTime = Date.now();
	}
	handleTouchEnd(event) {
		// Skip touch handling if in editing mode
		if (this.currentMode === this.modes.EDITING || !this.touchStartX) {
			return;
		}

		const touchEndX = event.changedTouches[0].clientX;
		const touchEndY = event.changedTouches[0].clientY;
		const touchEndTime = Date.now();

		// Calculate swipe metrics
		const swipeDistance = touchEndX - this.touchStartX;
		const verticalDistance = Math.abs(touchEndY - this.touchStartY);
		const swipeTime = touchEndTime - this.touchStartTime;

		// Validate swipe:
		// 1. Must be primarily horizontal (vertical movement < 50px)
		// 2. Must be longer than 50px horizontally
		// 3. Must complete within 300ms
		if (verticalDistance < 50 && Math.abs(swipeDistance) > 50 && swipeTime < 300) {
			if (swipeDistance > 0) {
				this.prevPage();
			} else {
				this.nextPage();
			}
		}

		// Reset touch tracking
		this.touchStartX = null;
		this.touchStartY = null;
		this.touchStartTime = null;
	}
	// Dispatch click events to appropriate handlers
	handleCanvasClick(event) {
		// Check mode before handling click
		switch (this.currentMode) {
			case this.modes.PERFORMANCE:
			case this.modes.GROUP_REHEARSAL:
				return; // No action in these modes

			case this.modes.INDIVIDUAL_REHEARSAL:
				return; // playback is already bound to speaker-icon

			case this.modes.EDITING:
				this.handleEdit(event);
				break;

			case this.modes.MARKING:
				if (this.currentMarkType === this.markTypes.MARKER) {
					this.handleNewMarker(event);
				} else if (this.currentMarkType === this.markTypes.NOTE) {
					this.handleNewNote(event);
				}
				break;
		}
	}

	handleEdit(event) {
		// Get click coordinates relative to canvas
		const rect = this.canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		// Check for clicked YouTube marker
		const markers = this.markers.get(this.pageNum) || [];
		const marker = markers.find(m =>
			Math.abs(m.x - x) < 10 && Math.abs(m.y - y) < 10
		);

		if (marker) {
			this.showMarkerDialog(marker);
			return;
		}

		// Check for clicked note
		const notes = this.notes.get(this.pageNum) || [];
		const note = notes.find(n =>
			Math.abs(n.x - x) < 10 && Math.abs(n.y - y) < 10
		);

		if (note) {
			this.showNoteDialog(note);
			return;
		}

		// No marker found near click
		alert('Please click an existing marker or note to edit it');
	}

	handleNewMarker(event) {
		const videoId = this.videoIds.get(this.pageNum);
		if (!videoId) {
			alert('Please set a YouTube video ID for this page first');
			return;
		}

		const rect = this.canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		// Add unique ID when creating marker
		const markerId = Math.floor(Math.random() * 1000000);

		// Create marker object, but don't add to markers list yet.
		// We need to wait for user to confirm.
		const marker = { id: markerId, x, y, time: 0, rate: 1.0 };

		// Show dialog
		this.showMarkerDialog(marker);
	}
	showMarkerDialog(marker) {
		// Check if marker already exists
		const existingMarker = this.markers.get(this.pageNum)?.find(m => m.id === marker.id);

		const dialog = document.createElement('div');
		dialog.className = 'modal-dialog';
		dialog.innerHTML = `
    <div class="dialog">
      <h3>${existingMarker ? 'Edit' : 'Add'} YouTube Timestamp</h3>
      <label>Start Time (seconds):<br>
        <input type="number" id="time-input" value="${existingMarker?.time || 0}" step="0.1">
      </label><br>
      <label>Playback Rate (0.25-2):<br>
        <input type="number" id="rate-input" value="${existingMarker?.rate || 1.0}" min="0.25" max="2" step="0.25">
      </label><br>
      <div class="button-row">
        <button id="save">Save</button>
        ${existingMarker ? '<button id="delete">Delete</button>' : ''}
        <button id="cancel">Cancel</button>
      </div>
    </div>
  `;

		this.styleDialog(dialog);

		const cleanup = () => {
			if (dialog.parentNode) {
				document.body.removeChild(dialog);
			}
		};

		// Handle dialog actions
		dialog.querySelector('#save').onclick = () => {
			const time = parseFloat(dialog.querySelector('#time-input').value);
			const rate = parseFloat(dialog.querySelector('#rate-input').value);

			if (existingMarker) {
				// Update existing marker
				existingMarker.time = marker.time;
				existingMarker.rate = marker.rate;
			} else {
				marker.time = time;
				marker.rate = rate;
				// Store new marker
				if (!this.markers.has(this.pageNum)) {
					this.markers.set(this.pageNum, []);
				}
				this.markers.get(this.pageNum).push(marker);
				// Draw new marker
				this.drawMarker(marker);
			}
			cleanup();
		};

		if (existingMarker) {
			dialog.querySelector('#delete').onclick = () => {
				const markers = this.markers.get(this.pageNum);
				const index = markers.indexOf(existingMarker);
				if (index > -1) {
					markers.splice(index, 1);
					this.renderPage(this.pageNum); // Refresh display
				}
				cleanup();
			};
		}

		dialog.querySelector('#cancel').onclick = cleanup;

		// Add dialog to DOM
		document.body.appendChild(dialog);
	}

	drawMarker(marker) {
		// Create SVG overlay if it doesn't exist
		this.ensureSVG();

		const speaker = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		speaker.setAttribute('x', marker.x);
		speaker.setAttribute('y', marker.y);
		speaker.setAttribute('data-marker-id', marker.id);
		speaker.setAttribute('class', 'speaker-icon');
		speaker.textContent = '🔊';
		speaker.style.cursor = 'pointer';
		// Enable pointer events just for the speaker icon
		speaker.style.pointerEvents = 'auto';

		speaker.onclick = () => {
			if (this.currentMode === this.modes.EDITING) {
				this.showMarkerDialog(marker);
			} else {
				this.playYouTubeAt(this.videoIds.get(this.pageNum), marker.time, marker.rate);
			}
		};

		this.svg.appendChild(speaker);
	}

	handleNewNote(event) {
		// Get click coordinates relative to canvas
		const rect = this.canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		// Initialize notes map for this page if needed
		if (!this.notes.has(this.pageNum)) {
			this.notes.set(this.pageNum, []);
		}

		const id = Math.floor(Math.random() * 1000000)
		// Create note object
		const note = { id: id, x, y, text: '' };

		// Show dialog to edit note text
		this.showNoteDialog(note);
	}

	showNoteDialog(note) {
		// Check if note already exists
		const existingNote = this.notes.get(this.pageNum)?.find(n => n.id === note.id);
		const dialog = document.createElement('div');
		dialog.className = 'modal-dialog';
		dialog.innerHTML = `
    <div class="dialog">
      <h3>${existingNote ? 'Edit' : 'Add'} Note</h3>
      <textarea id="note-text" rows="4" cols="40">${existingNote?.text || ''}</textarea>
      <div class="button-row">
        <button id="save">Save</button>
        <button id="delete">Delete</button>
        <button id="cancel">Cancel</button>
      </div>
    </div>
  `;
		// Apply our styling to the dialog
		this.styleDialog(dialog);

		const cleanup = () => {
			if (dialog.parentNode) {
				document.body.removeChild(dialog);
			}
		};

		// Handle dialog actions
		dialog.querySelector('#save').onclick = () => {
			const text = dialog.querySelector('#note-text').value;
			if (existingNote) {
				// Update existing note
				existingNote.text = text;
			} else {
				note.text = text;
				// Store new note
				this.notes.get(this.pageNum).push(note);
				// Draw new note
				this.drawNote(note);
			}
			cleanup();
		};

		if (existingNote) {
			dialog.querySelector('#delete').onclick = () => {
				const notes = this.notes.get(this.pageNum);
				const index = notes.findIndex(n => n === note);
				if (index > -1) {
					notes.splice(index, 1);
				}
				cleanup();
				this.renderPage(this.pageNum); // Refresh display
			};
		}
		dialog.querySelector('#cancel').onclick = cleanup;

		// Add dialog to DOM
		document.body.appendChild(dialog);

		// Focus the textarea
		dialog.querySelector('#note-text').focus();
	}

	drawNote(note) {
		// Create SVG overlay if it doesn't exist
		this.ensureSVG();

		const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		icon.setAttribute('x', note.x);
		icon.setAttribute('y', note.y);
		icon.setAttribute('data-note-id', note.id);
		icon.setAttribute('class', 'note-icon');
		icon.textContent = '⚠️';  // Unicode caution/warning symbol
		icon.style.cursor = 'pointer';
		// Enable pointer events just for the note icon
		icon.style.pointerEvents = 'auto';

		icon.onclick = () => {
			this.showNoteDialog(note);
		};

		this.svg.appendChild(icon);
	}
	ensureSVG() {
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
	}


	updateMarkerPosition(id, newX, newY) {
		const markers = this.markers.get(this.pageNum);

		const markerIndex = markers.findIndex(m => m.id === id);

		if (markerIndex !== -1) {
			// Update marker position while preserving other properties
			const marker = markers[markerIndex];
			markers[markerIndex] = {
				...marker,
				x: newX,
				y: newY
			};
		}
	}
	updateNotePosition(id, newX, newY) {
		const notes = this.notes.get(this.pageNum);
		// Find the note using the id
		const noteIndex = notes.findIndex(n => n.id === id);

		if (noteIndex !== -1) {
			// Update the note's stored coordinates
			notes[noteIndex].x = newX;
			notes[noteIndex].y = newY;
		}
	}
	loadAnnotations(file) {
		const reader = new FileReader();
		reader.onload = (e) => {
			const data = JSON.parse(e.target.result);
			this.videoIds = new Map(data.videoIds);
			this.markers = new Map(data.markers);
			this.notes = new Map(data.notes);
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
	styleDialog(dialog) {
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

		return dialogBox;
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

