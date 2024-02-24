
export const choose = (ps: number[]): number => {
	const sum = ps.reduce((sum, p) => sum + p, 0);
	let roll = sum * Math.random();

	let i = 0;
	for (const p of ps) {
		if (roll <= p)
			return i;

		roll -= p;
		++i;
	}

	return i;
};


export const chooseLogits = (logits: number[]): number => choose(logits.map(Math.exp));
