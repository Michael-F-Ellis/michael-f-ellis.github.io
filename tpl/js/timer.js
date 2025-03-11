class PracticeTimer {
	constructor() {
		this.timerElement = document.getElementById('timer');
		this.startBtn = document.getElementById('start-btn');
		this.pauseBtn = document.getElementById('pause-btn');
		this.endBtn = document.getElementById('end-btn');

		this.startTime = null;
		this.pausedTime = 0;
		this.pauseStartTime = null;
		this.timerInterval = null;
		this.isRunning = false;

		this.setupEventListeners();
	}

	setupEventListeners() {
		this.startBtn.addEventListener('click', () => this.startTimer());
		this.pauseBtn.addEventListener('click', () => this.pauseTimer());
		this.endBtn.addEventListener('click', () => this.endTimer());
	}

	startTimer() {
		if (this.isRunning) return;

		if (this.startTime === null) {
			// Starting a new session
			this.startTime = new Date();
		} else if (this.pauseStartTime !== null) {
			// Resuming from pause
			this.pausedTime += (new Date() - this.pauseStartTime);
			this.pauseStartTime = null;
		}

		this.isRunning = true;
		this.timerInterval = setInterval(() => this.updateTimerDisplay(), 1000);

		// Update button states
		this.startBtn.disabled = true;
		this.pauseBtn.disabled = false;
		this.endBtn.disabled = false;
	}

	pauseTimer() {
		if (!this.isRunning) return;

		clearInterval(this.timerInterval);
		this.pauseStartTime = new Date();
		this.isRunning = false;

		// Update button states
		this.startBtn.disabled = false;
		this.pauseBtn.disabled = true;
		this.endBtn.disabled = false;
	}

	endTimer() {
		if (this.startTime === null) return;

		clearInterval(this.timerInterval);

		// Calculate total session duration (excluding paused time)
		const endTime = new Date();
		let totalPausedTime = this.pausedTime;

		if (this.pauseStartTime !== null) {
			totalPausedTime += (endTime - this.pauseStartTime);
		}

		const sessionDuration = endTime - this.startTime - totalPausedTime;
		const sessionData = {
			id: this.startTime.toISOString(),
			startTime: this.startTime.toISOString(),
			duration: Math.round(sessionDuration / 1000), // in seconds
			notes: ''
		};

		// Show notes modal
		this.showNotesModal(sessionData);

		// Reset timer
		this.resetTimer();
	}

	resetTimer() {
		clearInterval(this.timerInterval);
		this.startTime = null;
		this.pausedTime = 0;
		this.pauseStartTime = null;
		this.isRunning = false;
		this.timerElement.textContent = '00:00:00';

		// Update button states
		this.startBtn.disabled = false;
		this.pauseBtn.disabled = true;
		this.endBtn.disabled = true;
	}

	updateTimerDisplay() {
		const currentTime = new Date();
		let elapsedTime = currentTime - this.startTime - this.pausedTime;

		if (this.pauseStartTime !== null) {
			elapsedTime -= (currentTime - this.pauseStartTime);
		}

		// Format time as HH:MM:SS
		const hours = Math.floor(elapsedTime / 3600000);
		const minutes = Math.floor((elapsedTime % 3600000) / 60000);
		const seconds = Math.floor((elapsedTime % 60000) / 1000);

		const formattedTime =
			`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

		this.timerElement.textContent = formattedTime
	}

	showNotesModal(sessionData) {
		const modal = document.getElementById('notes-modal')
		const sessionDurationElement = document.getElementById('session-duration')
		const sessionNotesInput = document.getElementById('session-notes-input')
		const saveSessionBtn = document.getElementById('save-session-btn')

		// Format duration for display
		const hours = Math.floor(sessionData.duration / 3600)
		const minutes = Math.floor((sessionData.duration % 3600) / 60)
		const seconds = sessionData.duration % 60

		let durationText = ''
		if (hours > 0) durationText += `${hours} hour${hours !== 1 ? 's' : ''} `
		if (minutes > 0 || hours > 0) durationText += `${minutes} minute${minutes !== 1 ? 's' : ''} `
		durationText += `${seconds} second${seconds !== 1 ? 's' : ''}`

		sessionDurationElement.textContent = durationText
		sessionNotesInput.value = ''

		// Display modal
		modal.style.display = 'flex'

		// Focus the notes input
		setTimeout(() => sessionNotesInput.focus(), 100)

		// Save session when button is clicked
		const saveHandler = () => {
			sessionData.notes = sessionNotesInput.value.trim()
			storage.saveSession(sessionData)
			visualization.updateChart()
			modal.style.display = 'none'
			saveSessionBtn.removeEventListener('click', saveHandler)
		}

		saveSessionBtn.addEventListener('click', saveHandler)
	}
}