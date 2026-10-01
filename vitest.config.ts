import { defineConfig } from 'vitest/config';
import { defineBrowserCommand, playwright } from '@vitest/browser-playwright';
import type { CDPSession } from 'playwright';

const sessions = new WeakMap<object, CDPSession>();

const heapUsage = defineBrowserCommand(async (ctx) => {
	let session = sessions.get(ctx.page);
	if (!session) {
		session = await ctx.page.context().newCDPSession(ctx.page);
		await session.send('HeapProfiler.enable');
		sessions.set(ctx.page, session);
	}
	await session.send('HeapProfiler.collectGarbage');
	const { usedSize } = await session.send('Runtime.getHeapUsage');
	const { documents } = await session.send('Memory.getDOMCounters');
	const file = ctx.testPath?.split('/').pop();
	console.log(`HEAP_AT_FILE_START ${file} heapMB=${Math.round(usedSize / 1048576)} documents=${documents}`);
});

export default defineConfig({
	test: {
		include: ['test/*.spec.ts'],
		fileParallelism: false,
		isolate: true,
		coverage: {
			include: ['src/**'],
			reporter: ['text-summary'],
		},
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
			commands: { heapUsage },
		},
	},
});
