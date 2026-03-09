// DOM Elements
const El = {
	editor: document.getElementById('editor'),
	chartTitle: document.getElementById('chart-title'),
	leftFontSize: document.getElementById('left-font-size'),
	rightFontSize: document.getElementById('right-font-size'),
	columnWidth: document.getElementById('column-width'),
	btnNew: document.getElementById('btn-new'),
	btnExport: document.getElementById('btn-export'),
	btnImport: document.getElementById('btn-import'),
	importFile: document.getElementById('import-file')
};

// Initial State
let chartRows = Array.from({ length: 15 }, () => ({ chords: '', lyrics: '' }));

// Initialize App
function init() {
	render();
	setupEventListeners();
	updateStyles();
}

// Render the editor rows
function render() {
	El.editor.innerHTML = '';
	chartRows.forEach((row, index) => {
		const rowEl = document.createElement('div');
		rowEl.className = 'chart-row';
		rowEl.dataset.index = index;

		const chordsInput = document.createElement('textarea');
		chordsInput.className = 'cell-chords';
		chordsInput.value = row.chords;
		chordsInput.rows = 1;
		chordsInput.addEventListener('input', (e) => {
			chartRows[index].chords = e.target.value;
			autoResize(e.target);
			if (index === chartRows.length - 1 && e.target.value !== '') {
				addRow();
			}
		});

		const lyricsInput = document.createElement('textarea');
		lyricsInput.className = 'cell-lyrics';
		lyricsInput.value = row.lyrics;
		lyricsInput.rows = 1;
		lyricsInput.addEventListener('input', (e) => {
			chartRows[index].lyrics = e.target.value;
			autoResize(e.target);
			if (index === chartRows.length - 1 && e.target.value !== '') {
				addRow();
			}
		});

		rowEl.appendChild(chordsInput);
		rowEl.appendChild(lyricsInput);
		El.editor.appendChild(rowEl);

		// Initial resize
		autoResize(chordsInput);
		autoResize(lyricsInput);
	});
}

function autoResize(textarea) {
	textarea.style.height = 'auto';
	textarea.style.height = textarea.scrollHeight + 'px';
}

function addRow() {
	chartRows.push({ chords: '', lyrics: '' });
	render();
}

// Update CSS variables based on header settings
function updateStyles() {
	El.editor.style.setProperty('--chords-font-size', `${El.leftFontSize.value}px`);
	El.editor.style.setProperty('--lyrics-font-size', `${El.rightFontSize.value}px`);
	El.editor.style.setProperty('--chords-width', `${El.columnWidth.value}%`);
}

function exportChart() {
	const data = {
		title: El.chartTitle.value,
		leftFontSize: El.leftFontSize.value,
		rightFontSize: El.rightFontSize.value,
		columnWidth: El.columnWidth.value,
		rows: chartRows.filter(r => r.chords !== '' || r.lyrics !== '')
	};

	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${El.chartTitle.value.toLowerCase().replace(/\s+/g, '-')}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

function importChart(e) {
	const file = e.target.files[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = (event) => {
		try {
			const data = JSON.parse(event.target.result);
			El.chartTitle.value = data.title || 'Untitled';
			El.leftFontSize.value = data.leftFontSize || 16;
			El.rightFontSize.value = data.rightFontSize || 16;
			El.columnWidth.value = data.columnWidth || 30;

			chartRows = data.rows || [];
			// Ensure some empty rows at the end
			while (chartRows.length < 15) {
				chartRows.push({ chords: '', lyrics: '' });
			}

			render();
			updateStyles();
		} catch (err) {
			alert('Error parsing JSON file');
		}
	};
	reader.readAsText(file);
	// Reset file input
	e.target.value = '';
}

function setupEventListeners() {
	[El.leftFontSize, El.rightFontSize, El.columnWidth].forEach(input => {
		input.addEventListener('input', updateStyles);
	});

	El.btnNew.addEventListener('click', () => {
		if (confirm('Start a new chart? Current changes will be lost.')) {
			El.chartTitle.value = 'New Chart';
			chartRows = Array.from({ length: 15 }, () => ({ chords: '', lyrics: '' }));
			render();
			updateStyles();
		}
	});

	El.btnExport.addEventListener('click', exportChart);
	El.btnImport.addEventListener('click', () => El.importFile.click());
	El.importFile.addEventListener('change', importChart);
}

init();
