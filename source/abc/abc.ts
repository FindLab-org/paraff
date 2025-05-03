
import { Fraction } from "../fraction";



namespace ABC {
	type Token = string;


	export interface Pitch {
	};


	export interface Duration {
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
	};


	export interface ContextTerm {
	};


	export type Term = EventTerm | ContextTerm;


	interface KeyValue {
		name: string;
		value: any;
	};


	interface Comment {
		comment: string;
	};


	type Header = KeyValue | Comment;


	export interface BarPatch {
		voice: number;
		key: number;
		timeSig: Fraction;
		terms: Term[];
		bar: Token;
	};


	interface Body {
		patches: BarPatch[];
	};


	export interface Document {
		headers: Header[];
		body: Body;
	};
}



export {
	ABC,
};
