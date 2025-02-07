// Export the defaultParameters object and updateFontSizes function
export const defaultParameters = {
	leftX: 16,
	sideBySide: true,
	barlineRgx: /:?\|:?/,
	lyricRgx: /[\p{L}']/u,
	lyricFontWidth: 7,
};

export function updateFontSizes() {
	// updateFontSizes() updates the font sizes of the various elements of scores
	// that will be rendered as SVG objects. The font default sizes are specified
	// in fqs.css, but we support overriding them via the parameters object. If
	// the font sizes are not specified in the parameters object, we use the
	// default font sizes and update corresponding vars in defaultParameters.
	// Update the font sizes if user has specified them.
	// First, get a reference to the stylesheet,
	const stylesheet = Array.from(document.styleSheets)
		.find(sheet => sheet.href && sheet.href.includes('fqs.css'));

	// console.log("Stylesheets:", document.styleSheets);
	// console.log("Found stylesheet:", stylesheet);

	if (!stylesheet) {
		console.log("fqs.css stylesheet not found");
		return;
	}

	const rules = stylesheet.cssRules || stylesheet.rules;
	// console.log("CSS rules:", rules);
	// define a closure that will update the font size of a rule
	// whose index is i if the font height, fh is specified in 
	// or if not specified, assign a numeric value
	// to the value in fh.
	const update = (i, fh) => {
		if (defaultParameters[fh]) {
			const v = defaultParameters[fh];
			rules[i].style.fontSize = v + 'px';
		} else {
			defaultParameters[fh] = +rules[i].style.fontSize.slice(0, -2);
		}
	}
	// loop over the rules to update font sizes.
	for (let i = 0; i < rules.length; i++) {
		switch (rules[i].selectorText) {
			case '.title':
				update(i, "titleFontHeight")
				break;
			case '.text':
				update(i, 'textFontHeight');
				break;
			case '.preface':
				update(i, 'prefaceFontHeight');
				break;
			case '.postscript':
				update(i, 'postscriptFontHeight');
				break;
			case '.chord':
				update(i, 'chordFontHeight');
				break;
			case '.pernote':
				update(i, 'pernoteFontHeight');
				break;
			case '.fingering':
				update(i, 'fingerFontHeight');
				break;
			case '.lyric':
				update(i, 'lyricFontHeight');
				break;
			case '.pitch':
				update(i, 'pitchFontHeight');
				break;
			case '.cue':
				update(i, 'cueFontHeight');
				break;
			case '.perbar':
				update(i, 'perbarFontHeight');
				break;
			case '.perbeat':
				update(i, 'perbeatFontHeight');
				break;
			case '.counter':
				update(i, 'counterFontHeight');
				break;
			case '.rest':
				update(i, 'restFontHeight');
				break;
			case '.perline':
				update(i, 'perlineFontHeight');
				break;
			case '.lineproblem':
				update(i, 'lineproblemFontHeight');
				break;
		}
	}
}
