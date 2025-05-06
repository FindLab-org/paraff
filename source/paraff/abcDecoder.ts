
import { ABC } from "../abc";
import { Token } from "./vocab";



interface DescriptedSentence {
	description: string[];
	sentence: Token[];
};


const tokenizeAbcDoc = (doc: ABC.Document): DescriptedSentence[] => {
	// TODO:
	return null;
};



export {
	tokenizeAbcDoc,
};
