import { spawnSync } from 'node:child_process';

const runs = [
	['no coverage', 'test:no-coverage'],
	['coverage-v8', 'test:v8'],
	['coverage-istanbul', 'test:istanbul'],
];

const rows = [];
for (const [label, script] of runs) {
	const { stdout, stderr } = spawnSync('npm', ['run', script, '--silent'], { encoding: 'utf8' });
	const heaps = [...(stdout + stderr).matchAll(/HEAP_AT_FILE_START file-\d+\.spec\.ts heapMB=(\d+) documents=(\d+)/g)];
	rows.push({ label, heaps: heaps.map((m) => `${m[1]} MB/${m[2]}`) });
}

console.log('Heap (MB) / live documents at the start of each file, in run order, after a forced GC:\n');
for (const { label, heaps } of rows) console.log(label.padEnd(20), heaps.join('  '));
