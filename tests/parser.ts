
import fs from "fs";
import YAML from "yaml";

import * as paraff from "../source/paraff";



const parse = async (source: string): Promise<void> => {
	const sourceText = fs.readFileSync(source).toString();
	const scores = YAML.parse(sourceText) as Record<string, Record<string, string>>;

	for (const [name, score] of Object.entries(scores)) {
		for (const measure of Object.values(score))
			await paraff.parseCode(measure);

		console.log(name, "parsing passed.");
	}
};

parse("./tests/assets/basic.yaml");
