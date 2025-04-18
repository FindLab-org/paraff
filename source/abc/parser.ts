


const parseCode = async (code: string): Promise<any> => {
	const grammar = await import("./grammar.jison.js");
	const raw = grammar.parse(code);

	return raw;
};



export {
	parseCode,
};
