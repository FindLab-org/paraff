
import { ParaffDoc } from "./paraff";



const parseCode = async (code: string): Promise<ParaffDoc> => {
	const grammar = await import("./grammar.jison.js");
	const raw = grammar.parse(code);

	return raw;
};



export {
	parseCode,
};
