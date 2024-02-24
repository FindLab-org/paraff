
import fs from "fs";
import path from "path";
import YAML from "yaml";

//import "../env.js";

import * as paraff from "../source/paraff";



const main = async (source: string, targetDir: string): Promise<void> => {
	const sourceText = fs.readFileSync(source).toString();
	const scores = YAML.parse(sourceText) as Record<string, Record<string, string>>;

	Object.entries(scores).forEach(([scoreName, score]) => Object.entries(score).forEach(async ([mm, sentence]) => {
		const targetPath = path.join(targetDir, `${scoreName}-${mm}.ly`);
		const doc = await paraff.parseCode(sentence);
		const ly = paraff.lilypondEncoder.encode(doc);

		fs.promises.writeFile(targetPath, ly);
	}));
};


main(process.argv[2], process.argv[3]);
