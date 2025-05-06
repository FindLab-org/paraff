
import { Fraction } from "../fraction";



namespace ABC {
	type Token = string;


	export interface Pitch {
		acc: string|null;
		phonet: Token;
		quotes: number|null;
	};


	//export interface Duration {
	//};


	export interface EventTerm {
		chord: Pitch[];
		duration: Fraction;
		/*rest: boolean;
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
		stemDirection: string;*/
	};


	interface KeyValue {
		name: string;
		value: any;
	};


	export interface Control {
		control: KeyValue;
	};


	interface Text {
		text: string;
	};


	interface Articulation {
		articulation: string;
	};


	interface Comment {
		comment: string;
	};


	export type Term = Event | Control | Text;


	type Header = KeyValue | Comment;


	export interface BarPatch {
		/*voice: number;
		key: number;
		timeSig: Fraction;*/
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
