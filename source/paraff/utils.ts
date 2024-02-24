
import { Token, TOKENS, PromptToken } from "./vocab";
import { TokenGen, SentenceDecoder, LatentVector, ExpressiveMark } from "./types";
import { ParaffDocument } from "./paraff";
import { fracSubtract } from "../fraction";



const stringifyTokens = (ids: Token[]): string => ids.map(id => Token[id]).join(" ").replace(/VB /g, "VB\n");


const parseCodeTokens = (code: string): Token[] => (code.match(/\S+/g) || []).map(t => TOKENS.indexOf(t)).filter(id => id >= 0);


const splitIds = (ids: Token[]): Token[][] => {
	const vbs = ids.reduce((idx, id, i) => id === Token.VB ? [...idx, i] : idx, [] as number[]);

	return [0, ...vbs].map((index, vi) => {
		const bi = vi ? index + 1 : index;
		const ei = vi >= vbs.length ? ids.length - 1 : vbs[vi];

		return ids.slice(bi, ei);
	}).filter(v => v.length);
};


const joinIdVoices = (voices: Token[][]): Token[] => voices.map((ids, vi) => [...ids, vi === voices.length - 1 ? Token.EOM : Token.VB]).flat(1);


// remove incomplete last voice
const ampute = (ids: Token[]): Token[] => {
	if (ids[ids.length - 1] === Token.EOM)
		return ids;

	const voices = splitIds(ids);

	return joinIdVoices(voices.slice(0, voices.length - 1));
};


const combineSpaces = (sentence: string): string => {
	const patterns = [2, 4, 8, 16, 32, 64, 128, 256].map(d => new RegExp(`([a-g] D${d} RSpace ){2,}`));
	while (true) {
		const di = patterns.findIndex(p => p.test(sentence));
		if (di < 0)
			break;

		const source = sentence.match(patterns[di])![0];
		const n = source.match(/RSpace/g)!.length;
		const a = source.match(/^[a-g]/)![0];

		let dots = 0;
		switch (n) {
		case 3:
			dots = 1;
			break;
		case 7:
			dots = 2;
			break;
		}

		const ni = Math.min(di + 1, Math.floor(Math.log2(n)));
		const residueN = n - (2 ** ni) * (2 - 2 ** -dots);
		const division = di + 1 - ni;

		const dotsStr = "Dot ".repeat(dots);

		const target = `${a} D${2 ** division} ${dotsStr}RSpace ` + (residueN ? `${a} D${2 ** (di + 1)} RSpace `.repeat(residueN) : "");

		sentence = sentence.replace(source, target);
	}

	return sentence;
};


const describeScore = (dss: string[][]): string[] => {
	const descs = [] as string[];
	if (dss.some(ds => ds.includes(PromptToken.TripleStaff)))
		descs.push(PromptToken.TripleStaff);
	else if (dss.some(ds => ds.includes(PromptToken.DoubleStaff)))
		descs.push(PromptToken.DoubleStaff);
	else
		descs.push(PromptToken.SingleStaff);

	if (dss.some(ds => ds.includes(PromptToken.PolyVoice)))
		descs.push(PromptToken.PolyVoice);
	else
		descs.push(PromptToken.MonoVoice);

	const complicates = dss.filter(ds => ds.includes(PromptToken.Complicated));
	if (complicates.length / dss.length > 0.2)
		descs.push(PromptToken.Complicated);

	return descs;
};


interface DecoderTokenGenOptions {
	vocab?: string[];
	scorePremier?: number[];
};


class DecoderTokenGen implements TokenGen {
	decoder: SentenceDecoder;
	latent: LatentVector|null;
	n_seq: number;
	vocab?: string[];
	scorePremier?: number[];


	constructor (decoder: SentenceDecoder, latent: LatentVector|null, { vocab, scorePremier }: DecoderTokenGenOptions = {}) {
		this.decoder = decoder;
		this.latent = latent;
		this.n_seq = decoder.n_seq - 1;	// deduct MSUM token at head
		this.vocab = vocab;
		this.scorePremier = scorePremier;
	}


	async deduce (input_ids: number[]): Promise<number[]> {
		if (this.vocab)
			input_ids = input_ids.map(id => this.vocab!.indexOf(TOKENS[id]));
		const ps = await (this.scorePremier ? this.decoder.decodeScore(this.scorePremier!, input_ids, this.latent) :
			this.decoder.decode(input_ids, this.latent!));

		if (this.vocab)
			return TOKENS.map(word => this.vocab!.includes(word) ? ps[this.vocab!.indexOf(word)] : -Infinity);

		return ps;
	}
};


const tickDuration = (doc: ParaffDocument.Measure, wholeDuration: number = 1920): number => {
	const times = doc.voices.map(voice => voice.eventsTime);
	const duration = times.reduce((max, time) => Math.max(max, wholeDuration * time.numerator / time.denominator), 0);

	return duration;
};


const tidyPadding = (doc: ParaffDocument.Measure): Token[][] => {
	if (doc.voices.length < 2)
		return [[]];

	const times = doc.voices.map(voice => voice.eventsTime);
	const max = times.reduce((max, time) => time.numerator / time.denominator > max.numerator / max.denominator ? time : max);

	return times.map(time => {
		const residual = fracSubtract(max, time);
		//console.log("residual:", residual, max, time);
		if (!residual.numerator)
			return [];

		const d = Token["D" + residual.denominator.toString()];

		return Array(residual.numerator).fill([Token.a, d, Token.RSpace]).flat(1);
	});
};


const checkNoteheadConfliction = (doc: ParaffDocument.Measure, { checkRest = false }: {checkRest?: boolean} = {}): boolean => {
	const positions = new Set<string>();

	return doc.voices.some(voice => voice.terms.some(term => {
		const event = (term as ParaffDocument.EventTerm);
		if (!event.grace && !event.space) {
			if (checkRest && event.rest) {
				const keys = [-2, -1, 0, 1, 2].map(dn =>
					["-", "u", "d"].map(stemDirection => `${event.staff},${event.tick},${event.chord[0].note + dn},${stemDirection}`))
					.flat(1);
				return keys.some(key => {
					if (positions.has(key))
						return true;
					positions.add(key);

					return false;
				});
			}

			if (event.stemDirection) {
				return event.chord.some(pitch => {
					const key = `${event.staff},${event.tick},${pitch.note},${event.stemDirection}`;
					if (positions.has(key))
						return true;

					positions.add(key);

					return false;
				});
			}
		}

		return false;
	}));
};


const isChordHolding = (chord0: ParaffDocument.Pitch[], chord1: ParaffDocument.Pitch[]): boolean => {
	if (chord0.length !== chord1.length)
		return false;

	return !chord0.some((p0, i) => {
		const p1 = chord1[i];
		return p1.phonet !== p0.phonet || p1.acc !== p0.acc || (i ? p1.octaves !== p0.octaves : p1.octaves);
	});
};


const fixTies = (doc: ParaffDocument.Measure): number => doc.voices.reduce((n, voice) => {
	const terms = voice.terms.filter(t => !(t as any).context) as ParaffDocument.EventTerm[];
	terms.slice(0, -1).forEach((term, i) => {
		if (!term.marks || !term.marks.length)
			return;

		const nextTerm = terms[i + 1];
		const holding = isChordHolding(term.chord, nextTerm.chord);
		if (term.marks.includes(ExpressiveMark.Tie)) {
			// remove invalid tie
			if (!holding) {
				term.marks = term.marks.filter(m => m !== ExpressiveMark.Tie);
				++n;
			}
		}
		else if (term.marks.includes(ExpressiveMark.SlurL) && nextTerm.marks && nextTerm.marks.includes(ExpressiveMark.SlurR)) {
			// convert slurs to tie
			if (holding) {
				term.marks = term.marks.filter(m => m !== ExpressiveMark.SlurL);
				nextTerm.marks = nextTerm.marks.filter(m => m !== ExpressiveMark.SlurR);
				term.marks.push(ExpressiveMark.Tie);
				++n;
			}
		}
	});

	return n;
}, 0);



export {
	stringifyTokens,
	parseCodeTokens,
	splitIds,
	joinIdVoices,
	ampute,
	combineSpaces,
	describeScore,
	DecoderTokenGen,
	tickDuration,
	tidyPadding,
	checkNoteheadConfliction,
	fixTies,
};
