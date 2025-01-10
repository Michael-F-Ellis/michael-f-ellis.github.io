class ABCPitch {
	constructor(abcNote) {
		const match = abcNote.match(/([_^=]*)([A-Ga-g])([,']*)(\d*)/);
		if (!match) throw new Error(`Invalid ABC pitch: ${abcNote}`);
		this.accidentals = match[1];  // Preserve for key processing
		this.letter = match[2];       // Keep case for octave calc
		this.octaveMarks = match[3];  // Keep for interval calc
		this.units = parseInt(match[4]) || 1; // duration in unit notes
		this.reducedUnits = this.units;  // Possibly altered by group processing
	}

	toString() {
		return this.accidentals + this.letter + this.reducedUnits + this.octaveMarks;
	}
	fqsAccidentals() {
		// replace ^ with #, = with % and b with &
		return this.accidentals.replace(/[\^]/g, '#')
			.replace(/=/g, '%')
			.replace(/_/g, '&');
	}
}
class Converter {
	constructor() {
		// Store state during conversion
		this.currentKey = 'C';
		this.currentMeter = '4/4';
		this.currentUnitLength = '1/8';
		this.title = '';
		this.composer = '';
		this.lyrics = [];
		// Add keyTable as class property
		this.keyTable = {
			// Major keys (number indicates # of sharps(+) or flats(-))
			'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
			'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7,

			// Minor keys (relative minors)
			'Am': 0, 'Em': 1, 'Bm': 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6,
			'Dm': -1, 'Gm': -2, 'Cm': -3, 'Fm': -4, 'Bbm': -5, 'Ebm': -6, 'Abm': -7,

			// Special cases
			'HP': 'highland', // Highland pipes - F# C# and G natural
			'none': 'none'    // No key signature
		};
	}

	convert(abcString) {
		// Split into lines and process each line
		const lines = abcString.split('\n');
		let output = [];
		let inTuneBody = false;

		for (let line of lines) {
			line = line.trim();

			// Skip empty lines and comments
			if (!line || line.startsWith('%')) continue;

			// Process header fields
			if (line.match(/^[A-Z]:/)) {
				this.processHeaderField(line);
				continue;
			}

			// Process tune body
			if (this.isMusic(line)) {
				inTuneBody = true;
				output.push(this.convertMusicLine(line));
			}

			// Process lyrics
			if (line.startsWith('w:')) {
				this.lyrics.push(this.processLyrics(line));
			}
		}

		// Build FQS output
		return this.buildFQSOutput(output);
	}

	processHeaderField(line) {
		const [field, value] = line.split(':').map(s => s.trim());
		switch (field) {
			case 'T': this.title = value; break;
			case 'C': this.composer = value; break;
			case 'M': this.currentMeter = value; break;
			case 'L': this.currentUnitLength = value; break;
			case 'K': this.currentKey = value; break;
		}
	}

	convertMusicLine(line) {
		// Reset prevPitch at start of each line
		this.prevPitch = null;
		// Convert a line ABC music notation to FQS format.
		let output = [`music:`];

		// Parse key signature
		const kp = new KeyParser(this.currentKey);
		const fqsKey = kp.parse();
		if (fqsKey === null) {
			output.push(`error: ${kp.error}`);
			return output.join('\n');
		}
		output.push(fqsKey);

		// Get notes per beat based on meter and unit length
		const unitNotesPerBeat = this.getUnitNotesPerBeat();

		// Remove unsupported constructs from line
		const cleanedLine = this.removeUnsupported(line);

		// Split the line into bars on the '|' character
		const bars = cleanedLine.split('|');

		// Process each bar
		for (const bar of bars) {
			const barText = bar.trim();
			if (!barText) continue;
			// Split into beamed groups using spaces as separators
			const groups = barText.replace(/`/g, '').split(/\s+/);

			for (const group of groups) {
				if (!group) continue;

				let currentABCGroup = [];

				// Process each note in the group
				const notes = group.match(/[\^=_]*[A-Ga-g][,']*[0-9]*/g);
				if (!notes) continue;

				// The length, in beats, of a note group is the sum of the durations
				// of the notes in the group divided by unitNotesPerBeat.  The
				// duration of a note is 1 * the duration multiplier (if any ) that
				// follows the note.  A duration multiplier of 1 is implied when
				// none is present. So the first order of business is to loop through
				// the notes, recording the pitch letter and duration multiplier of each.
				let groupUnitNotes = 0;
				// Update note processing in Converter class
				for (const note of notes) {
					const pitch = new ABCPitch(note);
					groupUnitNotes += pitch.units;
					currentABCGroup.push(pitch);
				}
				const groupBeats = groupUnitNotes / unitNotesPerBeat;
				// It's an error if the group duration is not an integer number of beats
				if (groupBeats % 1 !== 0) {
					throw new Error(`Invalid ABC note group: ${group}`);
				}
				// Now we can reduce each notes unit count by the GCD of the unit counts
				// of the notes in the group, i.e. A4B2 --> A2B1
				const gcd = this.getGCD(currentABCGroup.map(note => note.units));
				// Update the note durations to the reduced values
				for (const note of currentABCGroup) {
					note.reducedUnits = note.units / gcd;
				}
				let currentFQSGroupString = '' + groupBeats < 2 ? '' : groupBeats // omit beat count if it's 1
				for (const note of currentABCGroup) {
					// Get octave marks for this note
					const octaveMarks = FQSOctaveMarks(this.prevPitch, note);

					// Build note string with octave marks and duration
					currentFQSGroupString += octaveMarks
						+ note.fqsAccidentals()
						+ note.letter.toLowerCase()
						+ '-'.repeat(note.reducedUnits - 1);

					// Update prevPitch for next note
					this.prevPitch = note
				}
				output.push(currentFQSGroupString);
			}
			output.push('|');
		}
		return output.join(' ');
	}
	getGCD(numbers) {
		// Find the greatest common divisor of an array of numbers
		const gcd = (a, b) => {
			if (!b) return a;
			return gcd(b, a % b);
		};
		return numbers.reduce((a, b) => gcd(a, b));
	}

	getUnitNotesPerBeat() {
		// In ABC, the unit note is the duration assigned to a note with no multiplier
		// or other rythmic alteration. FQS groups by beat, so we need to determine
		// how many unit notes are in a beat. For example,
		//   In 4/4 time with 1/8 unit length, each beat contains 2 unit notes.
		//   In 2/4 time and 1/16 unit length, each beat contains 4 unit notes.
		// But we also have to recognize compound time signatures like 6/8 where the
		// the beat duration 3 times meter denominator.
		const [meterNum, meterDenom] = (this.currentMeter || '4/4').split('/').map(Number);
		const [unitNum, unitDenom] = (this.currentUnitLength || '1/8').split('/').map(Number);

		// return (meterDenom * unitNum) / (unitDenom * meterNum);
		return unitDenom / (meterDenom * unitNum)
	}



	convertNote(note, keyInfo) {
		// Handle accidentals in the note
		const accidental = note.match(/[=^_]/) ? note[0] : '';
		const pitch = accidental ? note.slice(1) : note;

		// Convert to lowercase for FQS
		let fqsNote = pitch.toLowerCase();

		// Apply key signature accidentals if needed
		if (!accidental && typeof keyInfo === 'number') {
			fqsNote = this.applyKeySignature(fqsNote, keyInfo);
		} else if (!accidental && keyInfo.type === 'explicit') {
			fqsNote = this.applyExplicitAccidentals(fqsNote, keyInfo.accidentals);
		}

		return fqsNote;
	}

	getNotesPerGroup() {
		// Calculate notes per group based on meter and unit length
		const [numerator, denominator] = this.currentMeter.split('/').map(Number);
		const unitLength = this.currentUnitLength.split('/').map(Number);
		return (numerator * unitLength[1]) / (denominator * unitLength[0]);
	}

	processLyrics(line) {
		// Convert ABC lyrics to FQS syllable line format
		return line.substring(2).trim();
	}

	/**
  * Combines all the components of the FQS output into a single string.
  * @param {string[]} musicLines - An array of music lines in FQS format.
  * @returns {string} The complete FQS output, including the title, composer, music lines, and lyrics (if any).
  */
	buildFQSOutput(musicLines) {
		// Combine all components into FQS format
		let output = [];
		if (this.title) output.push(`title: ${this.title}`);
		if (this.composer) output.push(`## ${this.composer}`);
		output.push(...musicLines);
		if (this.lyrics.length) {
			output.push('');
			output.push(...this.lyrics);
		}
		return output.join('\n\n');
	}

	isMusic(line) {
		// Check if line contains ABC music notation
		return line.match(/[A-Ga-g]/) && !line.match(/^[A-Za-z]:/);
	}
	removeUnsupported(line) {
		// Remove unsupported constructs from line
		// 1. grace notes (or anything else) in {}'s
		let graceNotes = line.match(/\{[^}]*\}/g);
		if (graceNotes) {
			graceNotes.forEach(graceNote => {
				line = line.replace(graceNote, '');
			});
		}
		return line;

	}
	/**
  * Applies the key signature to a given note.
  * @param {string} note - The note to apply the key signature to.
  * @param {number} keyNumber - The key number, where positive values represent sharps and negative values represent flats.
  * @returns {string} The note with the key signature applied.
  */
	applyKeySignature(note, keyNumber) {
		// Standard order of sharps: F C G D A E B
		const sharps = ['f', 'c', 'g', 'd', 'a', 'e', 'b'];
		// Standard order of flats: B E A D G C F
		const flats = ['b', 'e', 'a', 'd', 'g', 'c', 'f'];

		const basePitch = note.charAt(0);
		const octaveMarkers = note.substring(1);

		if (keyNumber > 0) {
			// Apply sharps
			if (sharps.slice(0, keyNumber).includes(basePitch)) {
				return '^' + basePitch + octaveMarkers;
			}
		} else if (keyNumber < 0) {
			// Apply flats
			if (flats.slice(0, -keyNumber).includes(basePitch)) {
				return '_' + basePitch + octaveMarkers;
			}
		}

		return note;
	}

	/**
  * Applies any explicit accidentals to the given note.
  * @param {string} note - The note to apply the accidentals to.
  * @param {Object[]} accidentals - An array of accidental objects, each with a `note` and `type` property.
  * @returns {string} The note with any explicit accidentals applied.
  */
	applyExplicitAccidentals(note, accidentals) {
		const basePitch = note.charAt(0);
		const octaveMarkers = note.substring(1);

		// Find if this note has an explicit accidental
		const accidental = accidentals.find(acc =>
			acc.note.toLowerCase() === basePitch
		);

		if (accidental) {
			const symbol = accidental.type === 'sharp' ? '^' : '_';
			return symbol + basePitch + octaveMarkers;
		}

		return note;
	}
}
class KeyParser {
	constructor(abcKey) {
		this.abcKey = abcKey;
		this.error = '';
		// Extended keyMap to include all modes
		this.keyMap = {
			// Major/Ionian
			'C': '0', 'G': '#1', 'D': '#2', 'A': '#3', 'E': '#4', 'B': '#5', 'F#': '#6', 'C#': '#7',
			'F': '&1', 'Bb': '&2', 'Eb': '&3', 'Ab': '&4', 'Db': '&5', 'Gb': '&6', 'Cb': '&7',

			// Minor/Aeolian
			'Am': '0', 'Em': '#1', 'Bm': '#2', 'F#m': '#3', 'C#m': '#4', 'G#m': '#5', 'D#m': '#6',
			'Dm': '&1', 'Gm': '&2', 'Cm': '&3', 'Fm': '&4', 'Bbm': '&5', 'Ebm': '&6', 'Abm': '&7',

			// Mixolydian
			'GMix': '0', 'DMix': '#1', 'AMix': '#2', 'EMix': '#3', 'BMix': '#4', 'F#Mix': '#5', 'C#Mix': '#6',
			'CMix': '&1', 'FMix': '&2', 'BbMix': '&3', 'EbMix': '&4', 'AbMix': '&5', 'DbMix': '&6', 'GbMix': '&7',

			// Dorian
			'DDor': '0', 'ADor': '#1', 'EDor': '#2', 'BDor': '#3', 'F#Dor': '#4', 'C#Dor': '#5', 'G#Dor': '#6',
			'GDor': '&1', 'CDor': '&2', 'FDor': '&3', 'BbDor': '&4', 'EbDor': '&5', 'AbDor': '&6', 'DbDor': '&7',

			// Phrygian
			'EPhr': '0', 'BPhr': '#1', 'F#Phr': '#2', 'C#Phr': '#3', 'G#Phr': '#4', 'D#Phr': '#5', 'A#Phr': '#6',
			'APhr': '&1', 'DPhr': '&2', 'GPhr': '&3', 'CPhr': '&4', 'FPhr': '&5', 'BbPhr': '&6', 'EbPhr': '&7',

			// Lydian
			'FLyd': '0', 'CLyd': '#1', 'GLyd': '#2', 'DLyd': '#3', 'ALyd': '#4', 'ELyd': '#5', 'BLyd': '#6',
			'BbLyd': '&1', 'EbLyd': '&2', 'AbLyd': '&3', 'DbLyd': '&4', 'GbLyd': '&5', 'CbLyd': '&6', 'FbLyd': '&7',

			// Locrian
			'BLoc': '0', 'F#Loc': '#1', 'C#Loc': '#2', 'G#Loc': '#3', 'D#Loc': '#4', 'A#Loc': '#5', 'E#Loc': '#6',
			'ELoc': '&1', 'ALoc': '&2', 'DLoc': '&3', 'GLoc': '&4', 'CLoc': '&5', 'FLoc': '&6', 'BbLoc': '&7'
		};
	}

	parse() {
		this.error = '';
		const abcKey = this.abcKey;
		if (!abcKey || abcKey.toLowerCase() === 'none') {
			return '0';
		}

		const parts = abcKey.match(/^([A-G][b#]?)(.*)$/i).slice(1);
		const key = parts[0].trim();
		let mode = parts[1]?.toLowerCase().trim();

		// Handle explicit key signatures or modifiers
		if (mode === 'exp' || parts.some(p => p.match(/[_^=]/))) {
			this.error = 'Custom key signatures not supported';
			return null;
		}

		if (key === 'HP' || key === 'Hp') {
			this.error = 'Highland pipe notation not supported';
			return null;
		}

		// Convert mode names to canonical form
		if (mode) {
			if (mode === 'm' || mode.startsWith('min')) {
				mode = 'm';
			} else {
				// Take first 3 letters and capitalize first letter
				mode = mode.slice(0, 3);
				mode = mode.charAt(0).toUpperCase() + mode.slice(1);
			}
		}

		// Build lookup key
		const lookupKey = mode ? key + (mode === 'm' ? 'm' : mode) : key;

		const fqsKey = this.keyMap[lookupKey];
		if (fqsKey === undefined) {
			this.error = `Invalid or unsupported key signature: ${abcKey}`;
			return null;
		}

		return `K${fqsKey}`;
	}
}
class Fraction {
	constructor(numerator, denominator = 1) {
		if (typeof numerator === 'string') {
			// Handle "3/2" format
			const [num, den] = numerator.split('/').map(Number);
			this.numerator = num;
			this.denominator = den || 1;
		} else if (Array.isArray(numerator)) {
			// Handle [3,2] format
			this.numerator = numerator[0];
			this.denominator = numerator[1];
		} else {
			// Handle (3,2) format
			this.numerator = numerator;
			this.denominator = denominator;
		}
	}

	add(other) {
		const fraction2 = other instanceof Fraction ? other : new Fraction(other);
		const newNumerator = this.numerator * fraction2.denominator +
			fraction2.numerator * this.denominator;
		const newDenominator = this.denominator * fraction2.denominator;
		return new Fraction(this.reduce(newNumerator, newDenominator));
	}

	multiply(other) {
		const fraction2 = other instanceof Fraction ? other : new Fraction(other);
		const newNumerator = this.numerator * fraction2.numerator;
		const newDenominator = this.denominator * fraction2.denominator;
		return new Fraction(this.reduce(newNumerator, newDenominator));
	}

	reduce(numerator, denominator) {
		const gcd = this.getGCD(Math.abs(numerator), Math.abs(denominator));
		return [numerator / gcd, denominator / gcd];
	}

	getGCD(a, b) {
		return b === 0 ? a : this.getGCD(b, a % b);
	}

	toString() {
		return `${this.numerator}/${this.denominator}`;
	}
}

function ABCInterval(prior, successor) {
	const PITCH_VALUES = {
		'A': 5, 'B': 6, 'C': 0, 'D': 1, 'E': 2, 'F': 3, 'G': 4
	};

	// Get base letters, preserving case
	const priorLetter = prior.letter;
	const succLetter = successor.letter;

	// Get base interval from letter positions
	const priorVal = PITCH_VALUES[priorLetter.toUpperCase()];
	const succVal = PITCH_VALUES[succLetter.toUpperCase()];

	// Calculate base interval, handling ascending/descending properly
	let interval = succVal >= priorVal ?
		((succVal - priorVal + 7) % 7) :
		((succVal - priorVal - 7) % 7);

	// Add octave shifts from letter case
	if (succLetter === succLetter.toLowerCase()) interval += 7;
	if (priorLetter === priorLetter.toLowerCase()) interval -= 7;

	// Add octave shifts from comma marks (down)
	interval -= 7 * (successor.octaveMarks.match(/,/g) || []).length;
	interval += 7 * (prior.octaveMarks.match(/,/g) || []).length;

	// Add octave shifts from apostrophe marks (up)
	interval += 7 * (successor.octaveMarks.match(/'/g) || []).length;
	interval -= 7 * (prior.octaveMarks.match(/'/g) || []).length;

	return interval;
}
function FQSOctaveMarks(prior, successor) {
	// Handle first note of line
	if (!prior) prior = new ABCPitch('C');

	const interval = ABCInterval(prior, successor);

	// For intervals > 3, force note up with '^'
	if (interval > 3) {
		const numMarks = Math.floor((interval + 3) / 7);
		return '^'.repeat(numMarks);
	}

	// For intervals < -3, force note down with '/'
	if (interval < -3) {
		const numMarks = Math.floor((-interval + 3) / 7);
		return '/'.repeat(numMarks);
	}

	// For intervals -3 to 3, no marks needed
	return '';
}