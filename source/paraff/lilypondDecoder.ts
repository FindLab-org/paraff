
import { lilyParser } from "lotus";
import { PostEvent, Command } from "lotus/inc/lilyParser/lilyTerms";

import { Fraction } from "./types";
import { Token, PromptToken, isTokenOf, TokenNumerator, TokenDenominator, TokenKey, TokenStaff, TokenClef, TokenOctaveShift,
	TokenPhonet, TokenAccidental, TokenDivision, TokenTimewarp, TokenTremolo, TokenTremoloCast } from "./vocab";
import { reducedFraction } from "../fraction";
import { MARKS } from "./lilypondEncoder";



type ParaffVoice = Token[];


interface ParaffMeasure {
	key: number|null;
	timeSig: Fraction|null;

	voices: ParaffVoice[];

	description: Set<string>;
	graceChainN: number;
};


const LILYPOND_CLEF_VALUES = {
	treble: -3,
	G: -3,
	bass: 3,
	F: 3,
	C: 0,
};


const DEFAULT_PITCH = lilyParser.LilyTerms.ChordElement.from({ phonet: "c", octave: 1 });


const INV_MARKS = Object.fromEntries(Object.entries(MARKS).filter(([k, v]) => !"()~".includes(v)).map(([k, v]) => [v.replace(/^-/, ""), k]));
//const EX_SIGNS = Object.fromEntries(Object.entries(MARKS).filter(([k, v]) => !v.startsWith("\\")).map(([k, v]) => [v, k]));
//const EX_CMDS = Object.fromEntries(Object.entries(MARKS).filter(([k, v]) => v.startsWith("\\")).map(([k, v]) => [v.slice(1), k]));

const IS_DYNMAIC = /^[fpmrsz]+$/;


const parseLilyDoc = (lilyDocument: lilyParser.LilyDocument): ParaffMeasure[] => {
	const measureMap = new Map<number, ParaffMeasure>();
	const staffNames = [] as string[];

	const interpreter = lilyDocument.interpret();
	interpreter.layoutMusic.musicTracks.forEach((track, vi) => {
		const appendStaff = (staffName: string): void => {
			if (!staffNames.includes(staffName))
				staffNames.push(staffName);
		};

		const staffName = track.contextDict!.Staff;
		appendStaff(staffName);
		let staff = staffNames.indexOf(staffName);

		//let lastDuration = lilyParser.LilyTerms.Duration.default;
		let lastFactor: Fraction|null = null;

		let graceChainN = 0;

		const context = new lilyParser.TrackContext(undefined, { listener: (term: lilyParser.BaseTerm, context: lilyParser.TrackContext) => {
			const mi = term._measure!;
			if (!measureMap.get(mi)) {
				measureMap.set(mi, {
					key: null,
					timeSig: null,
					voices: [],
					description: new Set(),
					graceChainN: 0,
				});
			}

			if (context.staffName) {
				appendStaff(context.staffName);
				staff = staffNames.indexOf(context.staffName);
			}

			const measure = measureMap.get(mi)!;
			if (!measure.voices[vi])
				graceChainN = 0;

			measure.voices[vi] = measure.voices[vi] || [TokenStaff[staff]];
			const voice = measure && measure.voices[vi];

			if (term instanceof lilyParser.MusicEvent || term instanceof lilyParser.LilyTerms.StemDirection || term instanceof lilyParser.LilyTerms.OctaveShift) {
				if (context.key && measure.key === null)
					measure.key = context.key.key;
				if (context.time && measure.timeSig === null)
					measure.timeSig = context.time.value;

				if (context.clef && !voice.some(isTokenOf(TokenClef))) {
					const value = LILYPOND_CLEF_VALUES[context.clef.clefName];
					if (Number.isInteger(value))
						voice.push(TokenClef[value]);
				}

				if (context.octave && context.octave.value && !voice.some(isTokenOf(TokenOctaveShift)))
					voice.push(TokenOctaveShift[-context.octave.value]);

				if (context.partialDuration)
					measure.description.add(PromptToken.Partial);
				else
					measure.description.add(PromptToken.Full);
			}

			if (term instanceof lilyParser.MusicEvent) {
				if (context.inGrace) {
					if ([Token.Md, Token.Mu].includes(voice[voice.length - 1]))
						voice.splice(voice.length - 1, 0, Token.G);
					else
						voice.push(Token.G);

					++graceChainN;
					measure.graceChainN = Math.max(measure.graceChainN, graceChainN);
				}
				else
					graceChainN = 0;

				if (!voice.some(t => [Token.Mu, Token.Md].includes(t))) {
					switch (context.stemDirection) {
					case "Up":
						voice.push(Token.Mu);
						break;
					case "Down":
						voice.push(Token.Md);
						break;
					}
				}

				switch (context.tremoloType) {
				case lilyParser.TremoloType.Single: {
					const d = Math.log2(term.durationValue.denominator);
					voice.push(TokenTremolo[d]);
				}

					break;
				case lilyParser.TremoloType.Catcher: {
					const d = Math.log2(term.durationValue.denominator);
					voice.push(TokenTremoloCast[d]);
				}

					break;
				}

				if (term instanceof lilyParser.LilyTerms.Chord) {
					for (const pitch of term.pitchesValue) {
						if (!(pitch instanceof lilyParser.LilyTerms.ChordElement))
							continue;

						const isFresh = !voice.some(isTokenOf(TokenPhonet)) || isPureSpaceVoice(voice);

						voice.push(TokenPhonet[pitch.phonetStep]);

						const alterValue = pitch.alterValue;
						if (alterValue)
							voice.push(TokenAccidental[alterValue]);

						const octave = isFresh ? context.pitch.relativeOctave(DEFAULT_PITCH) : pitch.octave;
						if (octave) {
							const o = octave > 0 ? Token.Osup : Token.Osub;
							for (let i = 0; i < Math.abs(octave); ++i)
								voice.push(o);
						}
					}
				}
				else if (term instanceof lilyParser.LilyTerms.Rest) {
					const isPhonet = isTokenOf(TokenPhonet);
					const isFresh = !term.isSpacer && (!voice.some(t => isPhonet(t) || t === Token.Rest) || isPureSpaceVoice(voice));
					voice.push(term.isSpacer ? Token.a : TokenPhonet[context.pitch.phonetStep]);

					if (isFresh) {
						const octave = context.pitch.relativeOctave(DEFAULT_PITCH);
						if (octave) {
							const o = octave > 0 ? Token.Osup : Token.Osub;
							for (let i = 0; i < Math.abs(octave); ++i)
								voice.push(o);
						}
					}
				}

				// timewarp
				if (context.factor && context.factor.value < 1 && context.factor.value > 0.5) {
					const factor = context.factor as any;
					if (factor !== lastFactor) {
						const reducedFactor = reducedFraction(factor.numerator, factor.denominator);
						voice.push(TokenTimewarp[reducedFactor.numerator]);
					}
					else
						voice.push(Token.W);

					lastFactor = factor;
				}

				let repeat = 0;
				const duration = context.tremoloDuration ? context.tremoloDuration : term.durationValue;
				if (duration.withMultiplier) {
					const durationFrac = reducedFraction(duration.magnitude, lilyParser.WHOLE_DURATION_MAGNITUDE);
					//console.log("multiplier:", durationFrac.numerator);
					const division = Math.log2(durationFrac.denominator);
					console.assert(Number.isInteger(division), "invalid duation magnitude:", duration.magnitude, durationFrac);
					voice.push(TokenDivision[Math.floor(division)]);
					repeat = durationFrac.numerator - 1;
				}
				else {
					voice.push(TokenDivision[duration.division]);
					if (duration.dots)
						voice.push(...Array(duration.dots).fill(Token.Dot));
				}

				//if (term.duration)
				//	lastDuration = term.duration;

				if (term.isRest) {
					const spacer = term instanceof lilyParser.LilyTerms.Rest && term.isSpacer;
					voice.push(spacer ? Token.RSpace : Token.Rest);
				}

				if (repeat) {
					const rpi = [...voice].reverse().findIndex(isTokenOf(TokenPhonet));
					const pi = voice.length - rpi - 1;
					const eventSeg = voice.slice(pi);
					for (let i = 0; i < repeat; ++i)
						voice.push(...eventSeg);
				}

				if (term.beamOn)
					voice.push(Token.Bl);
				else if (term.beamOff)
					voice.push(Token.Br);

				if (term.post_events) {
					//console.log("post_events:", term.post_events);
					term.post_events.filter(event => event instanceof PostEvent).forEach(((event: PostEvent) => {
						if (INV_MARKS[event.arg as string])
							voice.push(Token[`E${INV_MARKS[event.arg as string]}`]);

						if (event.arg instanceof Command) {
							if (IS_DYNMAIC.test(event.arg.cmd))
								event.arg.cmd.split("").forEach(c => voice.push(Token[`ED${c}`]));
						}
					}) as any);

					if (term.post_events.includes("~"))
						voice.push(Token.Earp);

					if (term.post_events.includes(")"))
						voice.push(Token.EslurR);
					if (term.post_events.includes("("))
						voice.push(Token.EslurL);
				}

				if (term.isTying)
					voice.push(Token.Etie);
			}
			else if (term instanceof lilyParser.LilyTerms.StemDirection) {
				console.assert(voice, "voice is null:", context);

				voice.push(term.direction === "Up" ? Token.Mu : Token.Md);
			}
			else if (term instanceof lilyParser.LilyTerms.Clef) {
				const value = LILYPOND_CLEF_VALUES[term.clefName];
				if (Number.isInteger(value))
					voice.push(TokenClef[value]);
			}
			else if (term instanceof lilyParser.LilyTerms.OctaveShift)
				voice.push(TokenOctaveShift[-term.value]);
			else if (term instanceof lilyParser.LilyTerms.Change) {
				if (term.args[0].key === "Staff") {
					if (Object.values(TokenStaff).includes(voice[voice.length - 1]))
						voice[voice.length - 1] = TokenStaff[staff];
					else
						voice.push(TokenStaff[staff]);
				}
			}
		} });
		context.execute(track.music);
	});

	for (const measure of measureMap.values())
		measure.voices = measure.voices.filter(Boolean);

	return [...measureMap.values()];
};


const tokenizeFraction = (fraction: Fraction): Token[] => [TokenNumerator[fraction.numerator], TokenDenominator[fraction.denominator]];


const isPureSpaceVoice = (tokens: Token[]): boolean => {
	const rt = [...tokens].reverse();
	const rip = rt.findIndex(isTokenOf(TokenPhonet));
	const rid = rt.findIndex(isTokenOf(TokenDivision));
	if (rip >= 0 && (rip < rid || rid < 0))	// incomplete chord at tail
		return false;

	const ds = tokens.filter(isTokenOf(TokenDivision)).length;
	const ss = tokens.filter(t => t === Token.RSpace).length;

	return ss >= ds;
};


interface DescriptedSentence {
	description: string[];
	sentence: Token[];
};


const tokenizeLilyDoc = (lilyDocument: lilyParser.LilyDocument): DescriptedSentence[] => {
	const measures = parseLilyDoc(lilyDocument);
	//console.log("measures:", measures);

	return measures.map(measure => {
		const voices = measure.voices.filter(v => v.length)
			.filter(v => !isPureSpaceVoice(v));	// ignore pure space voice
		const tokens = voices.map((v, i) => i ? [Token.VB, ...v.filter(Boolean)] : v).flat(1);

		if (measure.timeSig)
			tokens.unshift(...tokenizeFraction(measure.timeSig));
		if (Number.isInteger(measure.key))
			tokens.unshift(TokenKey[measure.key!]);

		const sentence = [
			Token.BOM,
			...tokens,
			Token.EOM,
		];

		const staffTokens = tokens.filter(isTokenOf(TokenStaff));
		const staffSet = new Set(staffTokens);
		const maxStaff = Math.max(...staffTokens);
		const polyvoice = Object.values(TokenStaff).some(s => voices.filter(voice => voice.some(t => t === s)).length > 1);
		const divisionTokens = tokens.filter(isTokenOf(TokenDivision));
		const maxDivision = Math.max(...divisionTokens);
		const hasGrace = tokens.some(t => t === Token.G);
		const hasTremolo = tokens.some(isTokenOf(TokenTremolo)) || tokens.some(isTokenOf(TokenTremoloCast));
		const hasDot = tokens.some(t => t === Token.Dot);
		const hasTimewarp = tokens.some(isTokenOf(TokenTimewarp));
		const hasOctaveShift = tokens.some(isTokenOf(TokenOctaveShift));
		const crossStaves = voices.some(voice => new Set(voice.filter(isTokenOf(TokenStaff))).size > 1);
		const complicated = voices.length > staffSet.size * 2
			|| voices.length > staffSet.size && crossStaves
			|| new Set(divisionTokens).size > 4
			|| measure.graceChainN > 3;

		const description = Array.from(measure.description);

		switch (maxStaff) {
		case Token.S1:
			description.push(PromptToken.SingleStaff);
			break;
		case Token.S2:
			description.push(PromptToken.DoubleStaff);
			break;
		case Token.S3:
			description.push(PromptToken.TripleStaff);
			break;
		}

		description.push(polyvoice ? PromptToken.PolyVoice : PromptToken.MonoVoice);

		switch (maxDivision) {
		case Token.D1:
			description.push(PromptToken.Rhythm1);
			break;
		case Token.D2:
			description.push(PromptToken.Rhythm2);
			break;
		case Token.D4:
			description.push(PromptToken.Rhythm4);
			break;
		case Token.D8:
			description.push(PromptToken.Rhythm8);
			break;
		case Token.D16:
			description.push(PromptToken.Rhythm16);
			break;
		case Token.D32:
			description.push(PromptToken.Rhythm32);
			break;
		default:
			description.push(PromptToken.Rhythm64);
			break;
		}

		description.push(hasGrace ? PromptToken.Grace : PromptToken.noGrace);
		description.push(hasTremolo ? PromptToken.Tremolo : PromptToken.noTremolo);
		description.push(hasDot ? PromptToken.Dot : PromptToken.noDot);
		description.push(hasTimewarp ? PromptToken.Timewarp : PromptToken.noTimewarp);
		description.push(hasOctaveShift ? PromptToken.OctaveShift : PromptToken.noOctaveShift);

		if (crossStaves)
			description.push(PromptToken.CrossStaves);

		if (complicated)
			description.push(PromptToken.Complicated);

		return {
			sentence,
			description,
		};
	}).filter(meaure => meaure.sentence.length > 5);
};



export {
	tokenizeLilyDoc,
};
