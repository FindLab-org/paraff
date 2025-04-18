
import fs from "fs";
import YAML from "yaml";

import {parseCode} from "../source/abc/parser";



const main = async () => {
	const sourceText = fs.readFileSync("./tests/assets/simple.abc").toString();
	const raw = await parseCode(sourceText);
	console.log("result:", raw);
};


main();
