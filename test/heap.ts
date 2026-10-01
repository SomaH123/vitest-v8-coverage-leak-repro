import { commands } from 'vitest/browser';
import { beforeAll, expect, test } from 'vitest';
import { createHolder } from '../src/leaky';

export function defineLeakCheck() {
	beforeAll(async () => {
		await commands.heapUsage();
	});

	test('keeps a ~10 MB object graph on the realm global', () => {
		const count = createHolder();
		(globalThis as Record<string, unknown>).holder = count;
		expect(count()).toBe(150_000);
	});
}
