
interface Fraction {
	numerator: number;
	denominator: number;
};


const frac = (numerator: number, denominator: number): Fraction => ({ numerator, denominator });


const reducedFraction = (n: number, d: number): Fraction => {
	n = Math.round(n);
	d = Math.round(d);

	const g = n !== 0 ? gcd(n, d) : d;

	return frac(n / g, d / g);
};


const gcd = (a: number, b: number): number => {
	if (!(Number.isInteger(a) && Number.isInteger(b))) {
		console.error("non-integer gcd:", a, b);
		return 1;
	}

	return b === 0 ? a : gcd(b, a % b);
};


const lcm = (a: number, b: number): number => {
	const d = gcd(a, b);

	return a * b / d;
};


const fracMul = (value: number, fraction: Fraction): number => fraction ? (value * fraction.numerator / fraction.denominator) : value;


const fracAdd = (f1: Fraction, f2: Fraction): Fraction => {
	const sumD = lcm(f1.denominator, f2.denominator);
	const sumN = f1.numerator * sumD / f1.denominator + f2.numerator * sumD / f2.denominator;

	return reducedFraction(sumN, sumD);
};


const fracSubtract = (f1: Fraction, f2: Fraction): Fraction => fracAdd(f1, frac(-f2.numerator, f2.denominator));



export {
	Fraction,
	frac,
	reducedFraction,
	gcd,
	lcm,
	fracMul,
	fracAdd,
	fracSubtract,
};
