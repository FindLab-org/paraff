
import randn from "./randn";
import { erfinv } from "./erf";



type PossibilityTable<T> = {p: number, value: T}[];


const weightTableLinear = <T>(items: [number, T][]): PossibilityTable<T> => {
	const sum = items.reduce((sum, it) => sum + it[0], 0);

	let p = 0;
	return items.map(it => {
		p += it[0] / sum;
		const item = { p, value: it[1] };

		return item;
	});
};


const rollTableLinear = <T>(table: PossibilityTable<T>): T => {
	const rolling = Math.random();
	for (const { p, value } of table) {
		if (rolling <= p)
			return value;
	}

	return undefined as any;
};


type PossibilityTableFunctional<T> = {p: number, gen: (p: number) => T}[];


const weightTableMirror = <T>(items: [number, [T, T]][]): PossibilityTableFunctional<T> => {
	const sum = items.reduce((sum, it) => sum + it[0], 0);

	let p = 0;
	return items.map(([w, [vp, vn]]) => {
		p += w / sum;
		const item = { p, gen: p => p >= 0 ? vp : vn };

		return item;
	});
};


const rollTableNormal = <T>(table: PossibilityTableFunctional<T>, sigma: number = 1): T => {
	const rolling = randn() * sigma;
	for (const { p, gen } of table) {
		if (Math.abs(rolling) <= erfinv(p))
			return gen(rolling);
	}

	return undefined as any;
};


type WeightTable<T> = {w: number, value: T}[];


const rollTableSoftmax = <T>(table: WeightTable<T>, temperature: number = 1): T => {
	const ws = table.map(it => it.w / temperature);
	const ews = ws.map(Math.exp);
	const sum = ews.reduce((sum, w) => sum + w, 0);

	let p = 0;
	const wtable = table.map((item, i) => {
		p += ews[i] / sum;
		return { p, value: item.value };
	});

	const rolling = Math.random();
	for (const { p, value } of wtable) {
		if (Math.abs(rolling) <= p)
			return value;
	}

	return undefined as any;
};


const roll = (possibility: number): boolean => Math.random() < possibility;



export {
	weightTableLinear,
	rollTableLinear,
	weightTableMirror,
	rollTableNormal,
	rollTableSoftmax,
	roll,
};
