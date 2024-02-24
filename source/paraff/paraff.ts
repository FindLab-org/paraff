
import * as types from "./types";

import { Token, TokenStaff, TokenKey, TokenNumerator, TokenDenominator, TokenTremolo, TokenTremoloCast, TokenDivision, TokenTimewarp } from "./vocab";



const VToken = Token;
type VToken = Token;


namespace ParaffDocument {
	type Token = string;


	export type Fraction = types.Fraction;


	export interface Pitch {
		phonet: Token;
		acc: string;
		octaves: number;
		note: number;
	};


	export interface Duration {
		division: number;
		dots: number;
		timeWarp?: Fraction;
		tw?: Token;
	};


	export interface EventTerm {
		chord: Pitch[];
		duration: Duration;
		rest: boolean;
		space: boolean;
		beam: Token;
		illBeam?: Boolean;
		stem: Token;
		timeWarp?: Fraction;
		timeWarpEnd?: boolean;
		grace?: boolean;
		tremolo?: number;
		tremoloPitcher?: number;
		tremoloCatcher?: number;
		staff: number;
		tick: number;
		stemDirection: string;
		marks: types.ExpressiveMark[];
	};


	export interface Staff {
		staff: number;
	};

	export interface KeySignature {
		key: number;
	};

	export interface TimeSignature {
		timeSig: Fraction;
	};

	export interface Clef {
		clef: Token;
	};

	export interface OctaveShift {
		octaveShift: Token;
	};


	export interface ContextTerm {
		context: Staff | KeySignature | TimeSignature | Clef | OctaveShift;
		staff: number;
		tick: number;
	};


	export type Term = EventTerm | ContextTerm;


	export interface Voice {
		staff: number;
		octaveShiftIn: string;
		octaveShiftOut: string;
		headClef: string;
		terms: Term[];
		eventsTime: Fraction;
		compensatedGraceTime?: Fraction;
		partial?: boolean;
	};


	export interface TailStatus {
		timeWarping: boolean;
		invalidTimewarp: boolean;
		incompleteTimeWarping: boolean;
		beamOpen: boolean;
		filling: -1|0|1|null;	// -1: partial, 0: full, 1: overflow, null: unknown
		emptyStaff: boolean;
		chord?: Pitch[];
	};


	export interface Measure {
		key: number;
		timeSig: Fraction;
		isPartial: boolean;
		defaultCompensatedGraceTime: Fraction;
		staffN: number;
		voices: Voice[];
		ill: boolean;
		tailStatus: TailStatus;
		descriptors: Token[];
	};


	export interface Special {
		delimiter?: string;
		descriptors?: Token[];
	};


	const serializePitch = (pitch: Pitch): VToken[] => {
		const tokens = [VToken[pitch.phonet]];

		if (pitch.acc)
			tokens.push(VToken[`A${pitch.acc}`]);

		if (pitch.octaves > 0) {
			for (let i = 0; i < pitch.octaves; ++i)
				tokens.push(VToken.Osup);
		}
		else if (pitch.octaves < 0) {
			for (let i = 0; i > pitch.octaves; --i)
				tokens.push(VToken.Osub);
		}

		return tokens;
	};


	const serializeTerm = (term: Term): VToken[] => {
		const termx = term as any;
		if (termx.context) {
			if (termx.context.staff)
				return [TokenStaff[termx.context.staff - 1]];
			else if (Number.isInteger(termx.context.key))
				return [TokenKey[termx.context.key]];
			else if (termx.context.timeSig)
				return [TokenNumerator[termx.context.timeSig.numerator], TokenDenominator[termx.context.timeSig.denominator]];
			else if (termx.context.clef)
				return [VToken[termx.context.clef] as any];
			else if (termx.context.octaveShift)
				return [VToken[termx.context.octaveShift] as any];

			// unexpect context term
			return [];
		}

		const eterm = term as EventTerm;
		const tokens = [] as VToken[];
		if (eterm.grace)
			tokens.push(VToken.G);
		else if (eterm.tremolo)
			tokens.push(TokenTremolo[eterm.tremolo]);
		else if (eterm.tremoloCatcher)
			tokens.push(TokenTremoloCast[eterm.tremoloCatcher]);

		if (eterm.stem)
			tokens.push(VToken[eterm.stem]);

		eterm.chord.forEach(pitch => tokens.push(...serializePitch(pitch)));

		if (eterm.duration) {
			if (eterm.duration.tw)
				tokens.push(TokenTimewarp[eterm.duration.tw] || VToken[eterm.duration.tw]);

			tokens.push(TokenDivision[eterm.duration.division]);

			for (let i = 0; i < eterm.duration.dots; ++i)
				tokens.push(VToken.Dot);
		}

		if (eterm.space)
			tokens.push(VToken.RSpace);
		else if (eterm.rest)
			tokens.push(VToken.Rest);

		if (eterm.beam)
			tokens.push(VToken[eterm.beam]);

		if (eterm.marks) {
			eterm.marks.forEach(mark => {
				tokens.push(VToken[`E${mark}`]);
			});
		}

		return tokens;
	};


	const serializeVoice = (voice: Voice): VToken[] => {
		return voice.terms.map(serializeTerm).flat(1);
	};


	export const serializeMeasure = (measure: Measure): VToken[] => {
		const tokens = [VToken.BOM] as VToken[];

		for (const voice of measure.voices) {
			if (tokens.length > 1)
				tokens.push(VToken.VB);

			tokens.push(...serializeVoice(voice));
		}

		tokens.push(VToken.EOM);

		return tokens;
	};
}


type ParaffDoc = ParaffDocument.Measure|ParaffDocument.Special;



export {
	ParaffDocument,
	ParaffDoc,
};
