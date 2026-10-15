// Turns a Playwright JSON report into ONE GitHub error annotation listing each failing test
// (project, file:line, title) with the first line of its error.  Used by the CI full-e2e job.
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'e2e-results.json';
let report;
try {
  report = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.log(`::error title=e2e summary::could not read ${file}: ${error.message}`);
  process.exit(0);
}

const strip = (text) => String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
const lines = [];
const counts = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };

function walk(suite) {
  (suite.suites || []).forEach(walk);
  (suite.specs || []).forEach((spec) => {
    (spec.tests || []).forEach((test) => {
      counts[test.status] = (counts[test.status] || 0) + 1;
      if (test.status !== 'unexpected' && test.status !== 'flaky') return;
      const result = (test.results || []).find((r) => r.status !== 'passed' && r.status !== 'skipped') || {};
      const error = strip((result.error && (result.error.message || result.error.value)) || '');
      const first = error.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12).join(' | ');
      lines.push(`[${test.projectName}] ${spec.file}:${spec.line} ${spec.title} ${test.status === 'flaky' ? '(flaky)' : ''}\n    ${first.slice(0, 1500)}`);
    });
  });
}
(report.suites || []).forEach(walk);

const head = `${counts.unexpected} failed, ${counts.flaky} flaky, ${counts.expected} passed, ${counts.skipped} skipped`;
const body = [head, ...lines].join('\n');
console.log(body);
const escaped = body.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
console.log(`::error title=e2e failures::${escaped}`);
