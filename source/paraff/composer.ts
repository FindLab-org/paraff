
import { TokenGen } from "./types";
import { Token, TOKENS, TokenPhonet, TokenDivision, TokenStaff, isTokenOf, TokenTimewarp, TokenTremoloCast } from "./vocab";
import { chooseLogits } from "../stochastic";
import { TOKEN_TRANSFER_TABLE } from "./tokenTransfer";
import { parseCode } from "./parser";
import { ParaffDocument } from "./paraff";
import { splitIds, checkNoteheadConfliction, stringifyTokens } from "./utils";



interface ComposerOptions {
	temperature: number;
	parserGuide: boolean;
	staffLimit: 1|2|3;
	prompt: string;
	vocab: string[];
	primer: Token[];
	stepQuota: number;
	forbidPartial: boolean;
	forbiddenTokens: Token[];
	disposableMasker: DisposableMasker;
};


interface DecisiveComposerOptions {
	branchN: number;	// size of beam search
	parserGuide: boolean;
	staffLimit: 1|2|3;
	prompt: string;
	vocab: string[];
	primer: Token[];
	stepQuota: number;
	forbidPartial: boolean;
	forbiddenTokens: Token[];
	limitPitch: boolean;	// limit pitch in piano range: [21, 108]
	forbidNoteheadConfliction: boolean;
	stepAward: number;
};


type MaskValue = 0|1;

type TokenGenerator = Generator<TokenGen, void>;


class DisposableMasker {
	tokens: Set<Token>;
	mask: MaskValue[];


	constructor (preferredTokens: Token[]) {
		this.tokens = new Set(preferredTokens);

		this.updateMask();
	}


	updateMask (): void {
		const headers = Array.from(this.tokens).map(t => Token[t].match(/^[A-Z]+/)).filter(Boolean).map(c => c![0]);
		this.mask = TOKENS.map(token => !this.tokens.has(Token[token]) && headers.some(head => token.startsWith(head)) ? 0 : 1);
	}


	nextId (t: Token): void {
		if (this.tokens.has(t)) {
			this.tokens.delete(t);
			this.updateMask();
		}
	}


	get disposed (): boolean {
		return !this.tokens.size;
	}
};


const maskFromStatus = (tailStaus: ParaffDocument.TailStatus): MaskValue[] => {
	const mask = TOKENS.map(() => 1 as MaskValue);

	mask[tailStaus.beamOpen ? Token.Bl : Token.Br] = 0;

	if (!tailStaus.timeWarping)
		mask[Token.W] = 0;

	if (tailStaus.filling! === 0) {
		if (tailStaus.incompleteTimeWarping) {
			mask[Token.VB] = 0;
			mask[Token.EOM] = 0;
		}
		else {
			Object.values(TokenPhonet).forEach(t => mask[t] = 0);
			Object.values(TokenDivision).forEach(t => mask[t] = 0);
			mask[Token.Dot] = 0;
			mask[Token.Mu] = 0;
			mask[Token.Md] = 0;

			// forbid grace & tremolo cast at tail?
			mask[Token.G] = 0;
			Object.values(TokenTremoloCast).forEach(t => mask[t] = 0);
		}
	}

	return mask;
};


const compose = async (
	gens: TokenGenerator,
	{
		temperature = 1,
		parserGuide = false,
		staffLimit,
		vocab,
		prompt,
		primer = [Token.BOM],
		stepQuota = 512,
		forbidPartial = false,
		forbiddenTokens = [],
		disposableMasker = undefined,
	}: Partial<ComposerOptions> = {},
): Promise<Token[]> => {
	const descriptors = [] as number[];
	if (prompt && vocab)
		descriptors.push(...(prompt.match(/\S+/g) || []).map(word => vocab.indexOf(word.toLowerCase())).filter(t => t > 0));

	const tokens = [...primer];

	//const t0 = Date.now();

	let gen = gens.next().value!;
	while (gen && descriptors.length + tokens.length > gen.n_seq)
		gen = gens.next().value!;

	const initialGuidMask = TOKENS.map((_, t) => [Token.W, Token.Br].includes(t) ? 0 : 1);
	if (staffLimit)
		Object.values(TokenStaff).slice(staffLimit).forEach(t => initialGuidMask[t] = 0);

	let guideMask = [...initialGuidMask];
	let guideMask2 = TOKENS.map(() => 1);

	let eventStack = 0;
	let steps = 0;
	let lastTs: ParaffDocument.TailStatus|null = null;

	const tidyBeam = () => {
		if (!lastTs)
			console.warn("no lastTs:", Token[tokens[tokens.length - 1]]);
		if (lastTs && lastTs.beamOpen) {
			while (true) {
				const bli = tokens.lastIndexOf(Token.Bl);
				const bri = tokens.lastIndexOf(Token.Br);
				if (bli > bri)
					tokens.splice(bli, 1);
				else {
					//console.debug("Bl break:", bli, bri);
					break;
				}
				//console.debug("Bl removed:", bli);
			}
		}
	};

	const timewarpCheck = async (): Promise<boolean> => {
		const code = tokens.map(t => Token[t]).join(" ").replace(/VB$/, "EOM");
		const { tailStatus } = await parseCode(code) as ParaffDocument.Measure;
		if (tailStatus.invalidTimewarp) {
			const voices = splitIds(tokens);
			const lastVoice = voices.pop()!;
			const ai = lastVoice.findIndex(isTokenOf(TokenPhonet));
			const pops = lastVoice.length - ai + 1;

			//console.debug("invalid timewarp, pop:", pops, voices.length, stringifyTokens(lastVoice));
			for (let i = 0; i < pops; i++)
				tokens.pop();

			return true;
		}

		return false;
	};

	while (gen) {
		const lastToken = tokens[tokens.length - 1];

		const mask = TOKEN_TRANSFER_TABLE[lastToken];
		console.assert(mask, "unexpected token for TOKEN_TRANSFER_TABLE:", lastToken, tokens, primer);
		if (parserGuide) {
			if (mask[Token.EOM]) {
				eventStack = 0;

				const code = [...tokens, Token.EOM].map(t => Token[t]).join(" ");
				const { tailStatus } = await parseCode(code) as ParaffDocument.Measure;
				lastTs = tailStatus;
				if (tailStatus.filling! > 0 && tokens.length) {
					tokens.pop();
					guideMask2[lastToken] = 0;
					if (steps > stepQuota - 8)
						console.debug("lastToken:", Token[lastToken]);

					continue;
				}
				else
					guideMask = maskFromStatus(tailStatus);

				if (tailStatus.beamOpen) {
					guideMask[Token.VB] = 0;
					guideMask2[Token.Br] = 1;
				}

				if (forbidPartial && tailStatus.filling! < 0) {
					if (!tokens.includes(Token.VB)) {
						guideMask[Token.VB] = 0;
						guideMask[Token.EOM] = 0;
					}
				}
			}
			else {
				++eventStack;
				if (eventStack > 20) {	// avoid pitch stack explode
					console.debug("event stack explode:", tokens.map(t => Token[t]).join(" "));
					break;
				}

				if (lastTs && lastTs.incompleteTimeWarping) {
					if (mask[Token.D1]) {
						const m = mask[Token.W] ? 0 : 1;
						Object.values(TokenDivision).forEach(t => guideMask[t] = m);
					}
				}
			}
		}

		const choices = mask.reduce((sum, m, mi) => sum + m * guideMask[mi] * guideMask2[mi], 0);
		if (!choices) {
			while (!TOKEN_TRANSFER_TABLE[tokens[tokens.length - 1]][Token.EOM] && tokens.length)
				tokens.pop();

			tidyBeam();

			tokens.push(Token.EOM);

			break;
		}

		const logits = await gen.deduce([...descriptors, ...tokens]);

		//console.debug("paraff compose step:", Date.now() - t0);

		const lookupMask = i => mask[i] && guideMask[i] && guideMask2[i] && !forbiddenTokens.includes(i) && (!disposableMasker || disposableMasker.mask[i]);

		const logitsMasked = logits.slice(0, TOKENS.length).map((l, li) => lookupMask(li) ? l / temperature : -Infinity);

		const nextId = chooseLogits(logitsMasked);
		//if (nextId === 0)
		//	debugger;
		if (++steps > stepQuota)
			break;
		else if (steps > stepQuota - 8)
			console.debug("token:", Token[nextId]);

		console.assert(nextId !== 0, "zero token sampled, logits:", {
			mask: Array(TOKENS.length).fill(0).map((_, li) => mask[li] && guideMask[li] && guideMask2[li] && !forbiddenTokens.includes(li)),
			logits,
			lastToken,
		});
		if (!nextId)
			break;

		tokens.push(nextId);

		if (disposableMasker)
			disposableMasker.nextId(nextId);

		if (descriptors.length + tokens.length > gen.n_seq)
			gen = gens.next().value!;

		// remove last open beam at boundary
		if ([Token.VB, Token.EOM].includes(nextId)) {
			tidyBeam();

			if (await timewarpCheck()) {
				guideMask = [...initialGuidMask];
				guideMask2 = TOKENS.map(() => 1);
				continue;
			}
		}

		if (nextId === Token.EOM)
			break;

		if (nextId === Token.VB) {
			guideMask = [...initialGuidMask];
			guideMask2 = TOKENS.map(() => 1);
		}
	}

	return tokens;
};


interface ComposerBranch {
	logit: number;
	tokens: Token[];
	lastToken: Token;
	guideMask: MaskValue[];
	eventStack: number;
};


const DEFAULT_STEP_AWARD = 0.04;


const composeDecisive = async (
	gens: TokenGenerator,
	{
		branchN = 1,
		//parserGuide = false,
		staffLimit,
		vocab,
		prompt,
		primer = [Token.BOM],
		stepQuota = 512,
		forbidPartial = false,
		forbiddenTokens = [],
		limitPitch = false,
		forbidNoteheadConfliction = false,
		stepAward = DEFAULT_STEP_AWARD,
	}: Partial<DecisiveComposerOptions> = {},
): Promise<Token[]> => {
	const descriptors = [] as number[];
	if (prompt && vocab)
		descriptors.push(...(prompt.match(/\S+/g) || []).map(word => vocab.indexOf(word.toLowerCase())).filter(t => t > 0));

	let gen = gens.next().value!;
	while (gen && descriptors.length + primer.length > gen.n_seq)
		gen = gens.next().value!;

	const initialGuidMask = TOKENS.map((_, t) => [Token.W, Token.Br].includes(t) ? 0 : 1);
	if (staffLimit)
		Object.values(TokenStaff).slice(staffLimit).forEach(t => initialGuidMask[t] = 0);

	let branches = [{
		logit: 0,
		tokens: primer,
		lastToken: primer[primer.length - 1],
		guideMask: [...initialGuidMask],
		eventStack: 0,
	}] as ComposerBranch[];

	const checkTimewarp = async (tokens: Token[]): Promise<boolean> => {
		const code = tokens.map(t => Token[t]).join(" ");
		const { tailStatus } = await parseCode(code) as ParaffDocument.Measure;
		return tailStatus.invalidTimewarp;
	};

	const runBranch = async branch => {
		const mask = TOKEN_TRANSFER_TABLE[branch.lastToken];
		let eventStack = branch.eventStack;
		let guideMask = branch.guideMask;
		const tokens = branch.tokens;

		if (branch.lastToken === Token.VB) {
			if (await checkTimewarp(tokens.slice(0, -1).concat([Token.EOM])))
				return [];

			branch.guideMask = [...initialGuidMask];
		}
		else {
			if (mask[Token.EOM]) {
				eventStack = 0;

				const code = [...tokens, Token.EOM].map(t => Token[t]).join(" ");
				const doc = await parseCode(code) as ParaffDocument.Measure;
				const { tailStatus } = doc;
				//lastTs = tailStatus;
				if (tailStatus.filling! > 0 && tokens.length)
					return [];
				else
					guideMask = maskFromStatus(tailStatus);

				if (limitPitch) {
					if (tailStatus.chord && tailStatus.chord.some(pitch => pitch.note > 28 || pitch.note < -23))
						return [];
				}

				if (forbidNoteheadConfliction && checkNoteheadConfliction(doc))
					return [];

				if (tailStatus.beamOpen) {
					if (tailStatus.filling === 0)
						return [];

					guideMask[Token.VB] = 0;
					guideMask[Token.EOM] = 0;
				}

				if (forbidPartial && tailStatus.filling! < 0) {
					if (!tokens.includes(Token.VB)) {
						guideMask[Token.VB] = 0;
						guideMask[Token.EOM] = 0;
					}
				}
			}
			else {
				++eventStack;
				if (eventStack > 20)	// avoid pitch stack explode
					return [];

				if (limitPitch && [Token.Osub, Token.Osup].includes(branch.lastToken)) {
					if (branch.tokens.slice(-4).every(token => [Token.Osub, Token.Osup].includes(token)))
						return [];
				}

				/*if (lastTs && lastTs.incompleteTimeWarping) {
					if (mask[Token.D1]) {
						const m = mask[Token.W] ? 0 : 1;
						Object.values(TokenDivision).forEach(t => guideMask[t] = m);
					}
				}*/
			}
		}

		const lookupMask = i => mask[i] && guideMask[i] && !forbiddenTokens.includes(i);

		const logits = await (gen as TokenGen).deduce([...descriptors, ...tokens]);
		const maskedLogits = logits.slice(0, TOKENS.length).map((l, li) => lookupMask(li) ? l : -Infinity);

		const expsum = maskedLogits.reduce((sum, l) => sum + Math.exp(l), 0);
		const base = Math.log(expsum);

		const inheritFields = (nextId: Token) => ({
			tokens: [...tokens, nextId],
			guideMask: [...guideMask],
			eventStack,
		});

		return maskedLogits.map((logit, lastToken) => ({ lastToken, logit: branch.logit + (logit - base) + stepAward, ...(Number.isFinite(logit) ? inheritFields(lastToken) : {}) }) as ComposerBranch);
	};

	let candidateBranch: ComposerBranch = branches[0];

	let steps = 0;
	while (gen) {
		const branchLogits = await Promise.all(branches.slice(0, branchN).map(runBranch));
		while (branchLogits.filter(b => b.length > 0).length < branchN && branchLogits.length < branches.length)
			branchLogits.push(await runBranch(branches[branchLogits.length]));
		branches = branchLogits.flat(1).sort((b1, b2) => b2.logit - b1.logit);

		if (!branches.length)
			break;

		const tokens = branches[0].tokens;
		if (branches[0].lastToken === Token.EOM) {
			if (await checkTimewarp(tokens))
				break;

			//console.log("logit:", branches[0].logit, branches[0].logit / (tokens.length - primer.length));
			return tokens;
		}

		if (++steps > stepQuota) {
			if (candidateBranch.lastToken !== Token.EOM)
				candidateBranch = branches[0];
			break;
		}

		const finalBranch = branches.find(branch => Number.isFinite(branch.logit) && branch.lastToken === Token.EOM);
		if (finalBranch) {
			if (!candidateBranch || candidateBranch.lastToken !== Token.EOM || finalBranch.logit > candidateBranch.logit) {
				if (!await checkTimewarp(finalBranch.tokens))
					candidateBranch = finalBranch;
			}
		}

		branches = branches.filter(branch => Number.isFinite(branch.logit) && branch.lastToken !== Token.EOM);
		if (!branches.length)
			break;

		if (candidateBranch.lastToken === Token.EOM && branches[0].logit < candidateBranch.logit)
			break;

		//console.debug(branches.slice(0, branchN).map(branch => (branch.tokens.length > 10 ? "... " : "") + stringifyTokens(branch.tokens.slice(-10))).join("\n"));

		if (descriptors.length + tokens.length > gen.n_seq)
			gen = gens.next().value!;
	}
	//if (steps > candidateBranch.tokens.length - primer.length)
	//	console.log("steps:", steps, candidateBranch.tokens.length);
	//console.log("logit:", candidateBranch.logit, candidateBranch.logit / (candidateBranch.tokens.length - primer.length));

	return candidateBranch.tokens;
};



export {
	TokenGenerator,
	compose,
	composeDecisive,
	ComposerOptions,
	DisposableMasker,
};
