class PracticeStorage {
	constructor() {
		this.storageKey = 'tpl_practice_sessions';
		this.exportBtn = document.getElementById('export-btn');

		this.setupEventListeners();
	}

	setupEventListeners() {
		this.exportBtn.addEventListener('click', () => this.exportData());
	}

	// Get all sessions from localStorage
	getAllSessions() {
		const sessions = localStorage.getItem(this.storageKey);
		return sessions ? JSON.parse(sessions) : [];
	}

	// Save a new session
	saveSession(sessionData) {
		const sessions = this.getAllSessions();
		sessions.push(sessionData);
		localStorage.setItem(this.storageKey, JSON.stringify(sessions));
		this.updateTotalHours();
	}

	// Update total practice hours display
	updateTotalHours() {
		const totalHoursElement = document.getElementById('total-hours');
		const totalSeconds = this.getAllSessions().reduce((total, session) => total + session.duration, 0);
		const totalHours = (totalSeconds / 3600).toFixed(1);
		totalHoursElement.textContent = totalHours;
	}

	// Get sessions for specific date range
	getSessionsByDateRange(startDate, endDate) {
		const sessions = this.getAllSessions();
		return sessions.filter(session => {
			const sessionDate = new Date(session.startTime);
			return sessionDate >= startDate && sessionDate <= endDate;
		});
	}

	// Get sessions grouped by day
	getSessionsByDay(startDate, endDate) {
		const sessions = this.getSessionsByDateRange(startDate, endDate);
		const groupedSessions = {};

		sessions.forEach(session => {
			// Use date part only for grouping
			const dateStr = new Date(session.startTime).toISOString().split('T')[0];
			if (!groupedSessions[dateStr]) {
				groupedSessions[dateStr] = [];
			}
			groupedSessions[dateStr].push(session);
		});

		return groupedSessions;
	}

	// Export all data as JSON file
	exportData() {
		const sessions = this.getAllSessions();
		const dataStr = JSON.stringify(sessions, null, 2);
		const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

		const exportFileName = `tpl_practice_data_${new Date().toISOString().split('T')[0]}.json`;

		const linkElement = document.createElement('a');
		linkElement.setAttribute('href', dataUri);
		linkElement.setAttribute('download', exportFileName);
		linkElement.style.display = 'none';

		document.body.appendChild(linkElement);
		linkElement.click();
		document.body.removeChild(linkElement);
	}
}
