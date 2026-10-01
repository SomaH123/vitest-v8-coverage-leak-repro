export function createHolder() {
	const payload = Array.from({ length: 150_000 }, (_, i) => ({ i, label: `item-${i}` }));
	return function count() {
		return payload.length;
	};
}
