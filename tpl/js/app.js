// Initialize components when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
	// Global instances that will be used across components
	window.storage = new PracticeStorage();
	window.visualization = new PracticeVisualization();
	window.timer = new PracticeTimer();

	// Load initial data
	storage.updateTotalHours();
});

// Add iOS specific handling
if (navigator.standalone) {
	document.documentElement.classList.add('ios-standalone');
}

// Better touch handling for iOS
document.querySelectorAll('.btn, .period-btn').forEach(button => {
	// Use this approach to prevent double-firing of events and avoid scrolling
	button.addEventListener('touchend', (e) => {
		e.preventDefault();
		// Manually trigger the click after preventing default
		button.click();
	});
});

// Handle modal interactions
const notesModal = document.getElementById('notes-modal');

// Close modal when clicking outside
notesModal.addEventListener('click', (e) => {
	if (e.target === notesModal) {
		notesModal.style.display = 'none';
	}
});

// Prevent keyboard from pushing up content in iOS
const sessionNotesInput = document.getElementById('session-notes-input');
sessionNotesInput.addEventListener('focus', () => {
	// Add padding to bottom if needed
	document.body.classList.add('keyboard-open');
});

sessionNotesInput.addEventListener('blur', () => {
	document.body.classList.remove('keyboard-open');
});

// Add some CSS for keyboard handling
const style = document.createElement('style');
style.textContent = `
    body.keyboard-open {
        padding-bottom: 40vh;
    }
`;
document.head.appendChild(style);

// Manual entry functionality
const oopsBtn = document.getElementById('oops-btn');
const oopsModal = document.getElementById('oops-modal');
const manualDateInput = document.getElementById('manual-date');
const manualTimeInput = document.getElementById('manual-time');
const manualDurationInput = document.getElementById('manual-duration');
const manualNotesInput = document.getElementById('manual-notes');
const saveManualBtn = document.getElementById('save-manual-btn');
const cancelManualBtn = document.getElementById('cancel-manual-btn');

// Set default date and time values
function setDefaultManualValues() {
	const now = new Date();

	// Set default date to today
	const dateStr = now.toISOString().split('T')[0];
	manualDateInput.value = dateStr;

	// Set default time to current time
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	manualTimeInput.value = `${hours}:${minutes}`;

	// Default duration to 30 minutes
	manualDurationInput.value = "30";

	// Clear notes
	manualNotesInput.value = "";
}

// Show manual entry modal
oopsBtn.addEventListener('click', () => {
	setDefaultManualValues();
	oopsModal.style.display = 'flex';
	setTimeout(() => manualDurationInput.focus(), 100);
});

// Cancel button
cancelManualBtn.addEventListener('click', () => {
	oopsModal.style.display = 'none';
});

// Close modal when clicking outside
oopsModal.addEventListener('click', (e) => {
	if (e.target === oopsModal) {
		oopsModal.style.display = 'none';
	}
});

// Save manual entry
saveManualBtn.addEventListener('click', () => {
	// Validate inputs
	if (!manualDateInput.value || !manualTimeInput.value || !manualDurationInput.value) {
		alert('Please fill in all required fields.');
		return;
	}

	// Create timestamp from date and time inputs
	const dateTimeStr = `${manualDateInput.value}T${manualTimeInput.value}`;
	const startTime = new Date(dateTimeStr);

	// Convert duration from minutes to seconds
	const durationSeconds = parseInt(manualDurationInput.value) * 60;

	// Create session data
	const sessionData = {
		id: startTime.toISOString(),
		startTime: startTime.toISOString(),
		duration: durationSeconds,
		notes: manualNotesInput.value.trim(),
		isManualEntry: true // Optional flag to distinguish manual entries
	};

	// Save the session
	storage.saveSession(sessionData);

	// Update the chart
	visualization.updateChart();

	// Close the modal
	oopsModal.style.display = 'none';
});
