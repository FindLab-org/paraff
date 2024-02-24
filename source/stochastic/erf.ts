
const erfinv = (x: number): number => {
	// maximum relative error = .00013
	const a = 0.147;

	const b = 2 / (Math.PI * a) + Math.log(1-x**2) / 2;
	const sqrt1 = Math.sqrt( b**2 - Math.log(1-x**2) / a );
	const sqrt2 = Math.sqrt( sqrt1 - b );
	return sqrt2 * Math.sign(x);
};



export {
	erfinv,
};
