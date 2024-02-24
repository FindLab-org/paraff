
import fs from "fs";
import path from "path";
import YAML from "yaml";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import "../env.js";

import * as paraff from "../source/paraff";



/*
	PARAFF file specification

	header block
		0-6 bytes		PARAFF
		6-8 bytes		\0\0
		8-12 bytes		vocab start position
		12-16 bytes		sentences start position
		16-20 bytes		sentence number
		20-24 bytes		sentence align size

	vocab block

	sentence block
*/


const argv = yargs(hideBin(process.argv)).command(
	"$0 source [options]",
	"Tokenize paraff yaml file.",
	yargs => yargs
		.positional("source", {
			describe: "YAML source path",
			type: "string",
		})
		.demandOption("source")
		.option("paragraphMode", { alias: "g", type: "boolean" })
	,
).help().argv;


const WORD_WHITE_LIST = Object.values(paraff.PromptToken) as string[];


const CHUNK_SIZE = 0x10000;


const main = async (): Promise<void> => {
	const { source } = argv;

	const sourceText = fs.readFileSync(source).toString();
	const sourceObj = YAML.parse(sourceText);
	const scores = (sourceObj.scores ? sourceObj.scores : sourceObj) as Record<string, Record<string, string>>;
	const sentences = Object.values(scores).map(score => Object.values(score)).flat(1);

	// extract descriptors
	const descriptorCounter: Record<string, number> = {};
	sentences.forEach(sentence => sentence.match(/\S+/g)!
		.filter(word => !Number.isInteger(paraff.Token[word]))
		.forEach(word => descriptorCounter[word] = (descriptorCounter[word] || 0) + 1));
	const n_scores = Object.keys(scores).length;
	const descriptors = Object.entries(descriptorCounter)
		.sort((d1, d2) => d2[1] - d1[1])
		.filter(([word, n]) => n > (argv.paragraphMode ? n_scores : sentences.length) * 0.01 || WORD_WHITE_LIST.includes(word))	// ignore descriptors low frequency
		.map(([word]) => word);

	const id2Word = [...paraff.TOKENS, ...descriptors];
	const word2Id: Record<string, number> = id2Word.reduce((table, word, id) => ((table[word] = id), table), {});

	const tokens = sentences.map(sentence => sentence.match(/\S+/g)!.map(word => word2Id[word]).filter(id => Number.isInteger(id)))
		.filter(ids => ids.includes(paraff.Token.BOM));	// exclude special sentences
	//const maxLen = Math.max(...tokens.map(s => s.length));
	const maxLen = tokens.map(s => s.length).reduce((m, len) => Math.max(m, len), 0);
	const n_ids = tokens.reduce((sum, ids) => sum + ids.length, 0);

	console.log("descriptors number:", descriptors.length);
	console.log("vocab size:", id2Word.length);
	console.log("sentences number:", tokens.length);
	console.log("max sentence length:", maxLen);
	console.log("average sentence length:", n_ids / tokens.length);

	const date = new Date().toISOString().split("T")[0].replace(/-/g, "");

	const vocab = id2Word.join(",")
		.normalize("NFD").replace(/[\u0300-\u036f]/g, "");	// remove accents
	fs.writeFileSync(path.resolve(path.dirname(source), `${date}-vocab.txt`), vocab);

	// output paragraph index file
	if (argv.paragraphMode) {
		const phid2Word = [...paraff.PHASES, ...descriptors];
		const word2PhId: Record<string, number> = phid2Word.reduce((table, word, id) => ((table[word] = id), table), {});
		const phase_vocab = phid2Word.join(",")
			.normalize("NFD").replace(/[\u0300-\u036f]/g, "");	// remove accents

		let sentenceIndex = 0;
		const groups = new Set<string>();

		const paragraphs = Object.entries(scores).map(([name, score]) => {
			const group = name.replace(/\[[\d-]*\]$/, "");
			groups.add(group);
			const descriptors = score._descriptors.match(/\S+/g)!.map(word => word2PhId[word]).filter(id => id >= 0);
			const bodyKeys = Object.keys(score).filter(key => !key.startsWith("_"));
			const phaseTypes = bodyKeys.map(key => {
				if (key.includes("pre"))
					return paraff.Phase.BOS;
				else if (key.includes("post"))
					return paraff.Phase.EOS;
				else
					return paraff.Phase.Measure;
			});
			const phaseNumbers = bodyKeys.map(key => {
				console.assert(/n([-\d]+),([-\d]+)/.test(key), "invalid key:", key);
				const [_, fn, bn] = key.match(/n([-\d]+),([-\d]+)/)!;
				return [fn, bn].map(Number);
			});
			const sentenceN = Object.values(score).filter(sentence => sentence.includes("BOM")).length;
			const sentenceRange = [sentenceIndex, sentenceIndex + sentenceN];

			sentenceIndex += sentenceN;

			return {
				name,
				group,
				descriptors,
				phaseTypes,
				phaseNumbers,
				sentenceRange,
			};
		});
		const meta = {
			paraff: `${date}.paraff`,
			vocab: paraff.TOKENS.join(","),
			phase_vocab,
			groups: Array.from(groups),
			paragraphs,
		};
		fs.writeFileSync(path.resolve(path.dirname(source), `${date}-paragraph.yaml`), YAML.stringify(meta));

		const max_paragraph_length = paragraphs.reduce((max, pg) => Math.max(max, pg.descriptors.length + pg.phaseTypes.length), 0);
		console.log("max_paragraph_length:", max_paragraph_length);
	}

	const outputPath = path.resolve(path.dirname(source), `${date}.paraff`);
	const file = await fs.promises.open(outputPath, "w");
	await file.write(Buffer.from("PARAFF"));
	await file.write(Buffer.from([0, 0]));

	const vocabPosition = 24;
	const vocabBuffer = Buffer.from(vocab);
	const dataPosition = vocabPosition + vocabBuffer.length;
	const sentenceAlign = Math.ceil(maxLen / 16) * 16;
	await file.write(Buffer.from(new Int32Array([vocabPosition, dataPosition, tokens.length, sentenceAlign]).buffer));
	console.log("header wrote.");

	await file.write(vocabBuffer);
	console.log("vocab wrote.");

	for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
		const data = tokens.slice(i, i + CHUNK_SIZE).map(ids => ids.concat(Array(sentenceAlign - ids.length).fill(0))).flat(1);
		await file.write(Buffer.from(data));
		console.log("body chunk wrote:", data.length);
	}

	await file.close();

	console.log("Done:", outputPath);
};


main();
