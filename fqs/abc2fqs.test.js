// Simple test framework
const runTests = (tests) => {
	let passed = 0;
	let failed = 0;

	tests.forEach(({ name, input, expected, dbg = false }) => {
		const converter = new Converter();
		if (dbg) {
			debugger;
		}

		const result = converter.convert(input);
		if (result === expected) {
			passed++;
			console.log(`✓ ${name}`);
		} else {
			failed++;
			console.log(`✗ ${name}`);
			console.log('Expected:', expected);
			console.log('Got:', result);
		}
	});

	console.log(`\nPassed: ${passed}, Failed: ${failed}`);
};

// Test cases starting with simplest possible conversions
const tests = [
	{
		name: 'Empty ABC file returns empty string',
		input: '',
		expected: ''
	},
	{
		name: 'Basic title conversion',
		input: 'T:Test Tune',
		expected: 'title: Test Tune'
	},
	{
		// 4/4 time signature and 1/8 unit length are ABC defaults
		// when M: and L: are omitted. Hence, the groups of 4 notes
		// will be 2 beats long and, therefore, represented in FQS as
		// 2-tuples.
		name: 'Octave C major scale (default meter and unit length)',
		input: `
X:1
T:C Major Scale
K:C
CDEF GABc`,
		expected: `title: C Major Scale
music: K0 2cdef 2gabc |`
	},
	{
		// Because the beat is a 1/4 note and the unit length is 1/16,
		// each group of 4 notes is a single beat.
		name: 'Octave C major scale (2/4 meter and 1/16 unit length)',
		input: `
X:1
T:C Major Scale
M:2/4
L:1/16
K:C
CDEF GABc`,
		expected: `title: C Major Scale
music: K0 cdef gabc |`
	},
	{
		// Testing recognition of ABC minor key syntax
		name: 'Octave C minor scale (default meter and unit length)',
		input: `
X:1
T:C Minor Scale
K:Cmin
CDEF GABc`,
		expected: `title: C Minor Scale
music: K&3 2cdef 2gabc |`
	},
	{
		// Testing recognition of ABC modal key syntax
		name: 'Octave C Mixolydian scale (default meter and unit length)',
		input: `
X:1
T:C Mixolydian Scale
K:C Mixolydian
CDEF GABc`,
		expected: `title: C Mixolydian Scale
music: K&1 2cdef 2gabc |`
	},
	{
		// Testing multiple bars and octave reset
		name: 'Two bars of octave C major scale (default meter and unit length)',
		input: `
X:1
T:C Major Scale
K:C
CDEF GABc|CDEF GABc`,
		expected: `title: C Major Scale
music: K0 2cdef 2gabc | 2/cdef 2gabc |`
	},
	{
		// Testing accidental recognition
		name: 'Two bars with accidentals',
		input: `
X:1
T:C Major Scale
K:C
CDE^F G=ABc|_CDEF __GABc`,
		expected: `title: C Major Scale
music: K0 2cde#f 2g%abc | 2/&cdef 2&&gabc |`
	},
	{
		// Testing real world example
		// dbg: true,
		name: `First line of Cooley's Reel`,
		input: `
X:1
T:Cooley's
M: 4/4
L: 1/8
R: reel
K:Emin
|:D2|EB{c}BA B2 EB|~B2 AB dBAG|FDAD BDAD|FDAD dAFD|`,
		expected: `title: Cooley's
music: K#1 d | 2e^bba b /e^b | b ab 2dbag | 2fd^a/d 2^b/d^a/d | 2fd^a/d 2^dafd |`
	},
];

runTests(tests);
