
%{
	const SUBDIVISION_MAX = 10;

	const TICK_ONE = 1920;

	const PHONETS = "cdefgab";


	class Duration {
		constructor (data) {
			Object.assign(this, data);
		}

		get magnitude () {
			return 2 ** (SUBDIVISION_MAX - this.division) * (2 - 2 ** -(this.dots || 0));
		}

		get subdivision () {
			return this.division + (this.dots || 0);
		}

		get tickDuration () {
			const main = TICK_ONE * 2 ** (-this.division) * (2 - 2 ** -(this.dots || 0));
			if (this.timeWarp && this.timeWarp.denominator)
				return main * this.timeWarp.numerator / this.timeWarp.denominator;

			return main;
		}
	};


	const event = (chord, duration, post_events) => {
		const result = {chord, duration};
		return (post_events || []).reduce((r, pe) => {
			if (pe.expressive) {
				r.marks = r.marks || [];
				r.marks.push(pe.expressive)
				return r;
			}

			return {...r, ...pe};
		}, result);
	};

	const context = token => ({context: token});

	const duration = (tw, division, dots) => new Duration({
		tw,
		division,
		dots,
	});

	const pitch = (phonet_acc, octaves) => ({
		phonet: phonet_acc[0],
		acc: phonet_acc[1],
		octaves,
	});

	const gcd = (a, b) => {
		if (!(Number.isInteger(a) && Number.isInteger(b))) {
			throw new Error(`non-integer gcd: ${a}, ${b}`);
			return 1;
		}

		return b === 0 ? a : gcd(b, a % b);
	};

	const fraction = (numerator, denominator) => ({
		numerator,
		denominator,
	});

	const reducedFraction = (n, d) => {
		const g = gcd(Math.round(n), Math.round(d));
		return fraction(n / g, d / g);
	};

	const tailN = token => Number(token.match(/\d+$/)[0]) * (/_\d+$/.test(token) ? -1 : 1);

	const deduceTD = (numerator, magnitude) => {
		for (let d = numerator + 1; d < numerator * 2; ++d)
			if (!Number.isInteger(Math.log2(d)))	// prefer non 2 power
				if (Number.isInteger(magnitude / d))
					return d;

		for (let d = numerator + 1; d < numerator * 2; ++d)
			if (magnitude % d === 0)
				return d;

		// one more chance
		for (let d = numerator + 1; d < numerator * 2; ++d)
			if (magnitude * 2 % d === 0)
				return d;

		return 0;
	}

	const deduceTimewarp = group => {
		const sum = group.reduce((s, term) => s + term.duration.magnitude, 0);

		const n = group[0].duration.tw;
		if (!Number.isInteger(n))
			return sum;

		const subdivision = Math.max(...group.map(term => term.duration.subdivision));
		const d = deduceTD(n, sum / 2 ** (SUBDIVISION_MAX - subdivision));
		const timeWarp = fraction(n, d);

		group.forEach(term => term.duration.timeWarp = timeWarp);
		group[0].timeWarp = timeWarp;
		group[group.length - 1].timeWarpEnd = true;

		return d ? sum * n / d : sum;
	};


	const relativePitch = (env, pitch) => {
		const step = PHONETS.indexOf(pitch.phonet);
		const interval = step - env.step;
		const octInc = Math.floor(Math.abs(interval / 4)) * -Math.sign(interval);

		env.octave += pitch.octaves + octInc;
		env.step = step;
		pitch.note = env.octave * 7 + step;
	};


	const voice = terms => {
		let group = null;
		let staff = null;
		let octaveShiftIn = "O0";
		let octaveShiftOut = "O0";

		let duration = 0;

		let headGracing = true;
		let hgDuration = 0;

		let headClef = null;

		terms.forEach(term => {
			if (!staff && term.context && term.context.staff)
				staff = term.context.staff;

			if (staff)
				term.staff = staff;

			if (term.context && term.context.octaveShift) {
				if (!duration)
					octaveShiftIn = term.context.octaveShift;
				octaveShiftOut = term.context.octaveShift;
			}

			if (!headClef && term.context && term.context.clef)
				headClef = term.context.clef;

			if (headGracing && term.grace)
				hgDuration += term.duration.magnitude;

			// process time warps
			if (term.duration && !term.grace) {
				headGracing = false;
				if (term.duration.tw) {
					if (Number.isInteger(term.duration.tw) || term.duration.tw === "Wx") {
						if (group)
							duration += deduceTimewarp(group)
						group = [term];
					}
					else //if (group)
						group.push(term);
					/*else
						term.error = "w-group-null"*/
				}
				else if (group) {
					duration += deduceTimewarp(group);
					group = null;
				}

				if (!term.duration.tw && !term.tremoloCatcher)
					duration += term.duration.magnitude;
			}
		});

		// tremolo pair
		[...terms].reverse().filter(term => term.duration && !term.grace).reduce((catcher, term) => {
			if (catcher)
				term.tremoloPitcher = catcher;
			return term.tremoloCatcher;
		}, false);

		// compute tick & note
		let tick = 0;
		let pitchEnv = {octave: 0, step: 0};
		let stemDirection = "u";
		terms.forEach(term => {
			term.tick = tick;
			if (term.duration && !term.grace)
				tick += term.duration.tickDuration;

			if (term.chord) {
				relativePitch(pitchEnv, term.chord[0]);

				if (term.chord.length > 1) {
					const base = {...pitchEnv};
					term.chord.slice(1).forEach(pitch => relativePitch(base, pitch));
				}

				if (term.stem)
					stemDirection = term.stem.substr(1);

				term.stemDirection = term.rest || !term.duration.division ? "-" : stemDirection;
			}
		});

		// check beams
		let inGrace = false;
		let beamTerms = [];
		terms.forEach(term => {
			if (!term.duration)
				return;

			const beamTerm = beamTerms[beamTerms.length - 1];

			if (beamTerm) {
				if (term.rest || term.duration.division < 3 || (beamTerm.grace && !term.grace)) {
					beamTerm.illBeam = true;
					beamTerms.pop();
				}
				else if (beamTerm.grace === term.grace) {
					if (term.beam === "Br")
						beamTerms.pop();
					else if (term.beam === "Bl")
						term.illBeam = true;
				}
				else {
					if (term.beam === "Bl")
						beamTerms.push(term);
					else if (term.beam === "Br") {
						term.illBeam = true;
						beamTerm.illBeam = true;
						beamTerms.pop();
					}
				}
			}
			else {
				if (term.beam == "Bl") {
					if (term.rest || term.duration.division < 3)
						term.illBeam = true;
					else
						beamTerms.push(term);
				}
				else if (term.beam == "Br")
					term.illBeam = true;
			}
			inGrace = term.grace;
		});

		if (group)
			duration += deduceTimewarp(group);

		return {
			staff,
			octaveShiftIn,
			octaveShiftOut,
			headClef,
			eventsTime: reducedFraction(duration, 2 ** SUBDIVISION_MAX),
			headGraceTime: reducedFraction(hgDuration, 2 ** SUBDIVISION_MAX),
			terms,
		};
	};


	const measure = (voices, descriptors) => {
		let key = null;
		let timeSig = null;

		voices[0].terms.forEach(term => {
			if (term.context) {
				if (Number.isInteger(term.context.key))
					key = term.context.key;
				else if (term.context.timeSig)
					timeSig = term.context.timeSig;
			}
		});

		const staffN = Math.max(...voices.map(voice =>
			Math.max(1, ...voice.terms.filter(term => term.context && term.context.staff).map(term => term.context.staff))));

		// balance voice-staff attribution
		Array(staffN).fill(0).forEach((_, si) => {
			const staff = si + 1;
			if (!voices.some(v => v.staff === staff)) {
				const voice = voices.find(v => v.terms.some(term => term.context && term.context.staff === staff));
				if (voice)
					voice.staff = staff;
			}
		})

		let ill = voices.some(voice => voice.terms.some(term => term.timeWarp && term.timeWarp.denominator === 0));
			//|| Array(staffN).fill(0).some((_, si) => !voices.some(v => v.staff === si + 1));

		const declaredTime = timeSig ? timeSig.numerator / timeSig.denominator : 1;

		// mark voice partial
		voices.forEach(voice => {
			const vt = voice.eventsTime.numerator / voice.eventsTime.denominator;
			if (vt < declaredTime)
				voice.partial = true;
			else if (vt > declaredTime)
				ill = true;
		});

		// head grace compensation
		const graceDenominator = voices.reduce((d, voice) => Math.max(d, voice.headGraceTime.denominator), 1);
		const graceNumerator = voices.reduce((n, voice) => Math.max(n, voice.headGraceTime.numerator * (graceDenominator / voice.headGraceTime.denominator)), 0);
		if (graceNumerator)
			voices.forEach(voice => {
				const time = reducedFraction(graceNumerator - voice.headGraceTime.numerator * (graceDenominator / voice.headGraceTime.denominator), graceDenominator);
				if (time.numerator)
					voice.compensatedGraceTime = time;
			});

		const tailStatus = {};
		if (voices.length) {
			const tailVoice = voices[voices.length - 1];

			const fullTime = voices.slice(0, voices.length - 1).reduce((time, voice) =>
				Math.min(time, voice.eventsTime.numerator / voice.eventsTime.denominator), declaredTime);
			const vt = tailVoice.eventsTime.numerator / tailVoice.eventsTime.denominator;
			tailStatus.filling = Number.isFinite(vt) && Number.isFinite(fullTime) ? (vt === fullTime ? 0 : (vt < fullTime ? -1 : 1)) : null;

			tailStatus.beamOpen = tailVoice.terms.reduce((open, term) => term.beam ? (term.beam === "Bl") : open, false);

			const lastEvent = tailVoice.terms.reduce((e, term) => term.duration ? term : e, null);
			tailStatus.timeWarping = lastEvent && !!lastEvent.duration.timeWarp;

			tailStatus.chord = lastEvent && lastEvent.chord;

			tailStatus.emptyStaff = Array(staffN).fill(0).some((_, si) => !voices.some(v => v.staff === si + 1));

			tailStatus.invalidTimewarp = tailVoice.terms.some(term => term.timeWarp && term.timeWarp.denominator === 0);
			tailStatus.incompleteTimeWarping = tailStatus.timeWarping && lastEvent.duration.timeWarp.denominator === 0;
		}

		return {
			key,
			timeSig,
			isPartial: voices.every(voice => voice.partial),
			defaultCompensatedGraceTime: graceNumerator ? reducedFraction(graceNumerator, graceDenominator) : null,
			staffN,
			ill,
			voices,
			tailStatus,
			descriptors,
		};
	};


	const delimiter = symbol => ({delimiter: symbol});
%}


%lex

%option flex unicode


%%

\s+									{}
"PAD"								{};

"BOS"								return 'BOS'
"EOS"								return 'EOS'
"BOM"								return 'BOM'
"EOM"								return 'EOM'
"VB"								return 'VB'

[S][123]							return 'Staff'

[C][cfg]							return 'Clef'

[K][0-6]							return 'Key'
[K][_][1-6]							return 'Key'

[T][N]\d+							return 'TN'
[T][D]\d+							return 'TD'

[a-g]								return 'P'

"Ass"								return 'A'
"Aff"								return 'A'
[A][sf]								return 'A'

"Osup"								return 'Osup'
"Osub"								return 'Osub'

"O0"								return 'Os'
[O][v][ab]							return 'Os'

"D1"								return 'D'
"D2"								return 'D'
"D4"								return 'D'
"D8"								return 'D'
"D16"								return 'D'
"D32"								return 'D'
"D64"								return 'D'
"D128"								return 'D'
"D256"								return 'D'

"Dot"								return 'Dot'

[B][lr]								return 'Beam'

[M][ud]								return 'Stem'

"Rest"								return 'Rest'
"RSpace"							return 'RSpace'

[W]\d+								return 'Wn'
"Wx"								return 'Wx'
"W"									return 'W'

"G"									return 'G'

"TM8"								return 'TM'
"TM16"								return 'TM'
"TM32"								return 'TM'
"TM64"								return 'TM'
"TM128"								return 'TM'
"TM256"								return 'TM'

"TC8"								return 'TC'
"TC16"								return 'TC'
"TC32"								return 'TC'
"TC64"								return 'TC'
"TC128"								return 'TC'
"TC256"								return 'TC'

[E]\w+								return 'E'

[#]\S+								return 'DESCRIPTOR'

<<EOF>>								return 'EOF';


/lex

%start start_symbol

%%

start_symbol
	: measure EOF		{ return $1; }
	| special EOF		{ return $1; }
	| desc_list EOF		{ return {descriptors: $1}; }
	;

special
	: delimiter			-> delimiter($1)
	;

delimiter
	: BOS
	| EOS
	;

measure
	: desc_list BOM voices EOM 	-> measure($3, $1)
	;

desc_list
	: %empty			-> []
	| desc_list desc	-> $1 ? [...$1, $2] : [$2]
	;

desc
	: DESCRIPTOR		-> $1
	;

voices
	: voice				-> [$1]
	| voices VB voice	-> [...$1, $3]
	;

voice
	: terms				-> voice($1)
	;

terms
	: %empty			-> []
	| terms event		-> $1 ? [...$1, $2] : [$2]
	| terms context		-> $1 ? [...$1, $2] : [$2]
	;

context
	: context_token		-> context($1)
	;

context_token
	: staff				-> ({staff: tailN($1)})
	| key				-> ({key: tailN($1)})
	| timeSig			-> ({timeSig: $1})
	| clef				-> ({clef: $1})
	| octave_shift		-> ({octaveShift: $1})
	;

staff
	: Staff
	;

key
	: Key
	;

clef
	: Clef
	;

octave_shift
	: Os
	;

timeSig
	: TN TD				-> fraction(tailN($1), tailN($2))
	;

event
	: stem_event
	| G stem_event						-> ({...$2, grace: true})
	| TM stem_event						-> ({...$2, tremolo: Math.log2(tailN($1))})
	| TC stem_event						-> ({...$2, tremoloCatcher: Math.log2(tailN($1))})
	;

stem_event
	: single_event
	| Stem single_event					-> ({...$2, stem: $1})
	;

single_event
	: chord duration post_events		-> event($1, $2, $3)
	;

chord
	: pitch				-> [$1]
	| chord pitch		-> [...$1, $2]
	;

pitch
	: phonet			-> pitch($1, 0)
	| phonet octaves	-> pitch($1, $2)
	;

octaves
	: octaves_sup
	| octaves_sub
	;

octaves_sup
	: Osup					-> 1
	| octaves_sup Osup		-> $1 + 1
	;

octaves_sub
	: Osub					-> -1
	| octaves_sub Osub		-> $1 - 1
	;

phonet
	: P						-> [$1, ""]
	| P A					-> [$1, $2.substr(1)]
	;

duration
	: optional_timewarp division dots		-> duration($1, $2, $3)
	;

division
	: D				-> Math.log2(Number(tailN($1)))
	;

dots
	: %empty		-> 0
	| dots Dot		-> ($1 || 0) + 1
	;

optional_timewarp
	: %empty
	| Wn			-> tailN($1)
	| Wx
	| W
	;

post_events
	: %empty					-> []
	| post_events rest			-> ($1 || []).concat([{rest: true, space: $2 === 'RSpace'}])
	| post_events beam			-> ($1 || []).concat([{beam: $2}])
	| post_events expressive	-> ($1 || []).concat([{expressive: $2}])
	;

rest
	: Rest
	| RSpace
	;

beam
	: Beam
	;

expressive
	: E				-> $1.slice(1)
	;
