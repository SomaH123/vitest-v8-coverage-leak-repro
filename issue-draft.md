<!-- Vitest bug report template: https://github.com/vitest-dev/vitest/issues/new?template=bug_report.yml -->

## Title

`browser`: `coverage-v8` leaks every test file's realm per tab (precise coverage is never stopped or reset between isolated files)

## Describe the bug

In browser mode with `coverage.provider: 'v8'`, the JS realm of every finished test file stays alive until the tab is closed. Each file adds its entire object graph (modules, DOM, closures) to the tab's heap, so a tab that runs many files eventually runs out of memory. In our suite (83 files, 12 tabs) tabs reached the `--max-old-space-size` cap and the run failed with `[birpc] rpc is closed, cannot call "createTesters"` / `Browser connection was closed … Was the page closed unexpectedly?`. Raising the heap size only delays the crash.

The leak doesn't happen without coverage, or with `@vitest/coverage-istanbul`.

### Reproduction summary

The linked repo runs 8 tiny test files in one tab (`fileParallelism: false`, `isolate: true`). Each keeps a ~10 MB object graph on its own `globalThis`. A browser command forces a GC through CDP at the start of each file and prints the heap size and the number of live documents:

```
no coverage          5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2
coverage-v8          5 MB/2  13 MB/3  22 MB/4  31 MB/5  40 MB/6  49 MB/7  57 MB/8  66 MB/9
coverage-istanbul    5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2  5 MB/2
```
(heap in MB / live documents)

With V8 coverage each finished file leaves one document and its heap behind. Without it, the removed iframe is collected.

### Cause

- `@vitest/coverage-v8` starts `Profiler.startPreciseCoverage({ callCount: true, detailed: true })` per tab.
- In count mode V8 keeps every `FeedbackVector` ever created in a strong root list (`feedback_vectors_for_profiling_tools`), so that call counts survive GC. Feedback vectors reference their realm's `NativeContext`, so no realm created while coverage runs can be collected.
- `takePreciseCoverage` is called once per file, which resets the counters but doesn't release that list. `stopCoverage()` in `@vitest/coverage-v8/dist/browser.js` is a deliberate no-op ("Browser mode should not stop coverage as same V8 instance is shared between tests"), so `stopPreciseCoverage` is never called.

In a heap snapshot of our real suite, the retainer path of a removed realm was:

```
(GC roots) → (Strong root list).feedback_vectors_for_profiling_tools
  → ArrayList → FeedbackVector → … .context → NativeContext → Window (removed iframe)
```

(Retainer path taken from the real app. I haven't captured one for the minimal repro; its behaviour matches the one in the real suite.)

### Suggested fix

Between isolated files (after the final `takePreciseCoverage` for the previous file), stop precise coverage and start it again with the same parameters, i.e. `Profiler.stopPreciseCoverage` → (GC) → `Profiler.startPreciseCoverage`. One subtlety: take coverage once more right before the stop, because code that runs between the previous file's snapshot and the restart (e.g. `unload`/`visibilitychange` handlers of the removed iframe) would otherwise be lost. In our suite a stop/start without that extra take lost 2 branches (idle-tracker code that only runs when the previous iframe unloads).

We ran this as a workaround for a while, in a custom browser command that also registers the data via `coverage-<uuid>.json` + `onAfterSuiteRun`. With it the heap at the start of each file stayed at 11–36 MB (it climbed to ~600 MB per tab before), and coverage output was identical to a run without the reset on a deterministic 10-file/439-test subset (0 differences in lines, functions and branches). We have since switched to `coverage-istanbul`, which doesn't leak.

### Related

- Separate from the leak from `@floating-ui/dom` walking `window.frameElement` into the orchestrator window, which also pins realms (that one is app-side and unrelated to coverage).
- No existing issue found when searching for "precise coverage", "feedback vector", "realm leak" and "browser coverage memory" (2026-09-28).

## Reproduction

<link to the repro repo once pushed>

```sh
npm install && npx playwright install chromium && npm run repro
```

## System Info

```
OS: Linux 6.18 Manjaro Linux, 16 cores (11th Gen Intel i7-11850H), 31 GB
Node: 24.19.0, npm 12.0.2
vitest 5.0.1, @vitest/browser-playwright 5.0.1, @vitest/coverage-v8 5.0.1 (+ @vitest/coverage-istanbul 5.0.1 for comparison)
playwright 1.63.0 (chromium headless shell)
```

## Used Package Manager

npm

## Validations

- [x] Follow our [Code of Conduct](https://github.com/vitest-dev/vitest/blob/main/CODE_OF_CONDUCT.md)
- [x] Read the [Contributing Guidelines](https://github.com/vitest-dev/vitest/blob/main/CONTRIBUTING.md)
- [x] Read the [docs](https://vitest.dev/guide)
- [x] Check that there isn't [already an issue](https://github.com/vitest-dev/vitest/issues) that reports the same bug to avoid creating a duplicate
- [x] Check that this is a concrete bug. For Q&A open a [GitHub Discussion](https://github.com/vitest-dev/vitest/discussions) or join our [Discord Chat Server](https://chat.vitest.dev)
- [x] The provided reproduction is a [minimal reproducible example](https://stackoverflow.com/help/minimal-reproducible-example) of the bug
