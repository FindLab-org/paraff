
export default (): number => {
	const u = 1 - Math.random();
	const v = 1 - Math.random();
	return Math.sqrt( -2 * Math.log( u ) ) * Math.cos( 2 * Math.PI * v );
};
