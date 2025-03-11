class PracticeVisualization {
	constructor() {
		this.svg = document.getElementById('practice-chart');
		this.notesContainer = document.getElementById('session-notes');
		this.periodButtons = document.querySelectorAll('.period-btn');
		this.currentPeriod = 'week';

		this.setupEventListeners();
	}

	setupEventListeners() {
		this.periodButtons.forEach(button => {
			button.addEventListener('click', () => {
				this.currentPeriod = button.dataset.period;

				// Update active button
				this.periodButtons.forEach(btn => {
					btn.classList.remove('active');
				});
				button.classList.add('active');

				this.updateChart();
			});
		});

		// Initial chart render
		window.addEventListener('load', () => this.updateChart());
	}

	updateChart() {
		// Clear previous chart
		while (this.svg.firstChild) {
			this.svg.removeChild(this.svg.firstChild);
		}

		// Clear notes
		this.notesContainer.innerHTML = '';

		// Get date range based on current period
		const dateRange = this.getDateRange(this.currentPeriod);
		const sessions = storage.getSessionsByDay(dateRange.start, dateRange.end);

		// Determine if we should use bar chart or time series
		const dayCount = (dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24);

		if (dayCount <= 31) {
			this.renderBarChart(sessions, dateRange);
		} else {
			this.renderTimeSeriesChart(sessions, dateRange);
		}
	}

	getDateRange(period) {
		const end = new Date();
		end.setHours(23, 59, 59, 999);

		let start = new Date();

		switch (period) {
			case 'week':
				start.setDate(start.getDate() - 6);
				break;
			case 'month':
				start.setMonth(start.getMonth() - 1);
				break;
			case 'year':
				start.setFullYear(start.getFullYear() - 1);
				break;
			case 'all':
				// Use a far past date to include all data
				start = new Date(2000, 0, 1);
				break;
		}

		start.setHours(0, 0, 0, 0);

		return { start, end };
	}

	renderBarChart(sessionsData, dateRange) {
		const svgWidth = this.svg.clientWidth;
		const svgHeight = parseInt(this.svg.getAttribute('height'));
		const margin = { top: 20, right: 20, bottom: 30, left: 40 };
		const width = svgWidth - margin.left - margin.right;
		const height = svgHeight - margin.top - margin.bottom;

		// Generate dates between start and end
		const dates = [];
		const currentDate = new Date(dateRange.start);

		while (currentDate <= dateRange.end) {
			dates.push(new Date(currentDate));
			currentDate.setDate(currentDate.getDate() + 1);
		}

		// Find max total minutes in a day for scaling
		let maxMinutes = 0;
		dates.forEach(date => {
			const dateStr = date.toISOString().split('T')[0];
			const dayTotal = sessionsData[dateStr] ?
				sessionsData[dateStr].reduce((total, session) => total + session.duration, 0) / 60 : 0;
			maxMinutes = Math.max(maxMinutes, dayTotal);
		});

		// Add 10% buffer to max
		maxMinutes = Math.ceil(maxMinutes * 1.1);

		// Bar width based on available space
		const barWidth = Math.min(width / dates.length - 5, 60);

		// Create main group
		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute('transform', `translate(${margin.left},${margin.top})`);
		this.svg.appendChild(g);

		// Create Y-axis
		const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		yAxis.classList.add('y-axis');
		g.appendChild(yAxis);

		// Y-axis line
		const yAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		yAxisLine.setAttribute('x1', 0);
		yAxisLine.setAttribute('y1', 0);
		yAxisLine.setAttribute('x2', 0);
		yAxisLine.setAttribute('y2', height);
		yAxisLine.setAttribute('stroke', '#ccc');
		yAxis.appendChild(yAxisLine);

		// Y-axis labels (every 30 minutes)
		const yTickStep = 30;
		for (let i = 0; i <= maxMinutes; i += yTickStep) {
			if (i > maxMinutes) break;

			const y = height - (i / maxMinutes) * height;

			const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			tick.setAttribute('x1', -5);
			tick.setAttribute('y1', y);
			tick.setAttribute('x2', 0);
			tick.setAttribute('y2', y);
			tick.setAttribute('stroke', '#ccc');
			yAxis.appendChild(tick);

			const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			label.setAttribute('x', -10);
			label.setAttribute('y', y);
			label.setAttribute('text-anchor', 'end');
			label.setAttribute('alignment-baseline', 'middle');
			label.setAttribute('class', 'chart-label');
			label.textContent = i;
			yAxis.appendChild(label);
		}

		// Create and render each day's bar
		dates.forEach((date, index) => {
			const dateStr = date.toISOString().split('T')[0];
			const dayLabel = date.getDate(); // Day of month

			const daySessions = sessionsData[dateStr] || [];
			const x = (width - (dates.length * barWidth)) / 2 + index * barWidth;

			// Create a group for this day
			const dayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			dayGroup.setAttribute('transform', `translate(${x},0)`);
			g.appendChild(dayGroup);

			// X-axis label (day)
			const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			label.setAttribute('x', barWidth / 2);
			label.setAttribute('y', height + 20);
			label.setAttribute('text-anchor', 'middle');
			label.setAttribute('class', 'chart-label');
			label.textContent = dayLabel;
			dayGroup.appendChild(label);

			// If no sessions, just add an empty bar placeholder
			if (daySessions.length === 0) {
				const emptyBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
				emptyBar.setAttribute('x', 0);
				emptyBar.setAttribute('y', height);
				emptyBar.setAttribute('width', barWidth - 2);
				emptyBar.setAttribute('height', 0);
				emptyBar.setAttribute('fill', '#ddd');
				emptyBar.setAttribute('opacity', '0.3');
				dayGroup.appendChild(emptyBar);
				return;
			}

			// Create a stacked bar for the day's sessions
			let cumulativeHeight = 0;

			daySessions.forEach((session, sessionIdx) => {
				const sessionMinutes = session.duration / 60;
				const sessionHeight = (sessionMinutes / maxMinutes) * height;

				const sessionBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
				sessionBar.setAttribute('x', 0);
				sessionBar.setAttribute('y', height - cumulativeHeight - sessionHeight);
				sessionBar.setAttribute('width', barWidth - 2);
				sessionBar.setAttribute('height', sessionHeight);
				sessionBar.setAttribute('class', 'practice-block');
				sessionBar.setAttribute('data-date', dateStr);
				sessionBar.setAttribute('data-session-id', session.id);

				// Add click handler
				sessionBar.addEventListener('click', () => {
					this.showDayNotes(dateStr, sessionsData[dateStr]);
				});

				dayGroup.appendChild(sessionBar);

				// Add dividing line except for the first session
				if (sessionIdx > 0) {
					const divider = document.createElementNS('http://www.w3.org/2000/svg', 'line');
					divider.setAttribute('x1', 0);
					divider.setAttribute('y1', height - cumulativeHeight);
					divider.setAttribute('x2', barWidth - 2);
					divider.setAttribute('y2', height - cumulativeHeight);
					divider.setAttribute('class', 'divider');
					dayGroup.appendChild(divider);
				}

				cumulativeHeight += sessionHeight;
			});
		});
	}

	renderTimeSeriesChart(sessionsData, dateRange) {
		const svgWidth = this.svg.clientWidth;
		const svgHeight = parseInt(this.svg.getAttribute('height'));
		const margin = { top: 20, right: 20, bottom: 30, left: 40 };
		const width = svgWidth - margin.left - margin.right;
		const height = svgHeight - margin.top - margin.bottom;

		// Aggregate data by day
		const dailyTotals = [];
		const days = [];

		const currentDate = new Date(dateRange.start);
		while (currentDate <= dateRange.end) {
			const dateStr = currentDate.toISOString().split('T')[0]
			const daySessions = sessionsData[dateStr] || []
			const totalMinutes = daySessions.reduce((total, session) => total + session.duration / 60, 0)

			days.push(new Date(currentDate))
			dailyTotals.push({
				date: new Date(currentDate),
				minutes: totalMinutes
			})

			currentDate.setDate(currentDate.getDate() + 1)
		}

		// Find max minutes for scaling
		const maxMinutes = Math.max(
			Math.ceil(Math.max(...dailyTotals.map(d => d.minutes)) * 1.1),
			10 // Minimum scale
		)

		// Create main group
		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
		g.setAttribute('transform', `translate(${margin.left},${margin.top})`)
		this.svg.appendChild(g)

		// Create axes
		this.createTimeSeriesAxes(g, days, maxMinutes, width, height)

		// Plot points
		const pointRadius = 4
		dailyTotals.forEach(day => {
			if (day.minutes === 0) return

			// Calculate position
			const dayIndex = Math.floor((day.date - dateRange.start) / (1000 * 60 * 60 * 24))
			const x = (dayIndex / (days.length - 1)) * width
			const y = height - (day.minutes / maxMinutes) * height

			// Create point
			const point = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
			point.setAttribute('cx', x)
			point.setAttribute('cy', y)
			point.setAttribute('r', pointRadius)
			point.setAttribute('fill', 'var(--primary-color)')
			point.setAttribute('data-date', day.date.toISOString().split('T')[0])

			// Add click handler
			point.addEventListener('click', () => {
				const dateStr = day.date.toISOString().split('T')[0]
				this.showDayNotes(dateStr, sessionsData[dateStr])
			})

			g.appendChild(point)
		})
	}

	createTimeSeriesAxes(g, days, maxMinutes, width, height) {
		// Y-axis
		const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'g')
		yAxis.classList.add('y-axis')
		g.appendChild(yAxis)

		// Y-axis line
		const yAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
		yAxisLine.setAttribute('x1', 0)
		yAxisLine.setAttribute('y1', 0)
		yAxisLine.setAttribute('x2', 0)
		yAxisLine.setAttribute('y2', height)
		yAxisLine.setAttribute('stroke', '#ccc')
		yAxis.appendChild(yAxisLine)

		// Y-axis labels (every 30 minutes)
		const yTickStep = 30
		for (let i = 0; i <= maxMinutes; i += yTickStep) {
			if (i > maxMinutes) break

			const y = height - (i / maxMinutes) * height

			const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line')
			tick.setAttribute('x1', -5)
			tick.setAttribute('y1', y)
			tick.setAttribute('x2', 0)
			tick.setAttribute('y2', y)
			tick.setAttribute('stroke', '#ccc')
			yAxis.appendChild(tick)

			const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
			label.setAttribute('x', -10)
			label.setAttribute('y', y)
			label.setAttribute('text-anchor', 'end')
			label.setAttribute('alignment-baseline', 'middle')
			label.setAttribute('class', 'chart-label')
			label.textContent = i
			yAxis.appendChild(label)
		}

		// X-axis
		const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'g')
		xAxis.classList.add('x-axis')
		xAxis.setAttribute('transform', `translate(0,${height})`)
		g.appendChild(xAxis)

		// X-axis line
		const xAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
		xAxisLine.setAttribute('x1', 0)
		xAxisLine.setAttribute('y1', 0)
		xAxisLine.setAttribute('x2', width)
		xAxisLine.setAttribute('y2', 0)
		xAxisLine.setAttribute('stroke', '#ccc')
		xAxis.appendChild(xAxisLine)

		// X-axis labels
		// For long periods, we'll only show a subset of dates
		const interval = Math.ceil(days.length / 10); // Show at most 10 labels

		days.forEach((day, i) => {
			if (i % interval !== 0 && i !== days.length - 1) return

			const x = (i / (days.length - 1)) * width

			const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line')
			tick.setAttribute('x1', x)
			tick.setAttribute('y1', 0)
			tick.setAttribute('x2', x)
			tick.setAttribute('y2', 5)
			tick.setAttribute('stroke', '#ccc')
			xAxis.appendChild(tick);

			const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			label.setAttribute('x', x);
			label.setAttribute('y', 20);
			label.setAttribute('text-anchor', 'middle');
			label.setAttribute('class', 'chart-label');
			label.textContent = `${day.getMonth() + 1}/${day.getDate()}`;

			// For yearly view, add year to first and last label
			if (days.length > 180 && (i === 0 || i === days.length - 1)) {
				label.textContent += `/${day.getFullYear().toString().substr(2)}`;
			}

			xAxis.appendChild(label);
		});
	}

	showDayNotes(dateStr, sessions) {
		if (!sessions || !sessions.length) {
			this.notesContainer.innerHTML = '<p>No practice sessions on this day.</p>';
			return;
		}

		// Format date
		const date = new Date(dateStr);
		const formattedDate = date.toLocaleDateString(undefined, {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});

		// Calculate total practice time
		const totalSeconds = sessions.reduce((total, session) => total + session.duration, 0);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);

		let totalTime = '';
		if (hours > 0) totalTime += `${hours} hour${hours !== 1 ? 's' : ''} `;
		totalTime += `${minutes} minute${minutes !== 1 ? 's' : ''}`;

		// Create HTML for notes
		let html = `
									<h3>${formattedDate}</h3>
									<p>Total practice time: ${totalTime}</p>
									<div class="day-sessions">
						`;

		sessions.forEach((session, index) => {
			const sessionTime = new Date(session.startTime).toLocaleTimeString(undefined, {
				hour: 'numeric',
				minute: '2-digit'
			});

			const sessionDuration = this.formatDuration(session.duration);

			html += `
												<div class="session">
															<h4>Session ${index + 1} - ${sessionTime} (${sessionDuration})</h4>
															<p>${session.notes || 'No notes recorded for this session.'}</p>
												</div>
									`;
		});

		html += '</div>';

		this.notesContainer.innerHTML = html;
	}

	formatDuration(seconds) {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const remainingSeconds = seconds % 60;

		let result = '';
		if (hours > 0) result += `${hours}h `;
		if (minutes > 0 || hours > 0) result += `${minutes}m `;
		result += `${remainingSeconds}s`;

		return result;
	}
}				