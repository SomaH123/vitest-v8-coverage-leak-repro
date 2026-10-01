# Vitest browser mode: `coverage-v8` keeps every test file's realm alive

Minimal reproduction for a memory leak in Vitest browser mode (`@vitest/browser-playwright`) when `@vitest/coverage-v8` is enabled.

With `isolate: true`, each test file runs in its own iframe, and the iframe is removed when the next file starts.
With `coverage-v8` the removed iframe's JS realm is never garbage collected, so every file's objects stay in the tab's heap until the tab crashes (`[birpc] rpc is closed`).
`coverage-istanbul` and no coverage don't leak.

## Reproduce

```sh
npm install
npx playwright install chromium   # if not installed yet
npm run repro
```

This runs the same 8 test files three times (no coverage, `coverage-v8`, `coverage-istanbul`) in a single tab (`fileParallelism: false`).
Each file keeps a ~10 MB object graph on its own `globalThis`.
At the start of every file, a browser command forces a GC through CDP (`HeapProfiler.collectGarbage`) and prints the JS heap size and live document count (`Memory.getDOMCounters`).

Result (Vitest 5.0.1, Playwright 1.63.0, Chromium headless shell):

```
Heap (MB) / live documents at the start of each file, in run order, after a forced GC:

no coverage          5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2
coverage-v8          5 MB/2  13 MB/3  22 MB/4  31 MB/5  40 MB/6  49 MB/7  57 MB/8  66 MB/9
coverage-istanbul    5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2
```

Without the leak, only the orchestrator and the current file's iframe are alive (2 documents).
With `coverage-v8`, one more document and ~9 MB stay behind per finished file.

You can also run each variant on its own: `npm run test:no-coverage`, `npm run test:v8`, `npm run test:istanbul`.

## Where it comes from

`coverage-v8` calls `Profiler.startPreciseCoverage({ callCount: true, detailed: true })` once per tab and, in browser mode, never stops it (`stopCoverage()` in `@vitest/coverage-v8/dist/browser.js` is a no-op).
In count mode V8 keeps every `FeedbackVector` in a strong root list (`feedback_vectors_for_profiling_tools`) so the counts survive GC, and feedback vectors reference their realm's `NativeContext`.
