'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLogBuffer, formatLogEntry, redactSensitiveText } = require('../src/log-redaction.cjs');

test('redacts credentials embedded in proxy URLs, key/value text, and bearer tokens', () => {
  const text = redactSensitiveText('https://alice:secret@proxy.example password=secret token: abc123 Bearer xyz.123');
  assert.doesNotMatch(text, /alice|secret|abc123|xyz\.123/);
  assert.match(text, /\[REDACTED\]/);
});

test('formatted log entries retain useful context while redacting secrets', () => {
  const entry = formatLogEntry('error', ['proxy_password=top-secret', new Error('request failed')], '2026-01-01T00:00:00Z');
  assert.equal(entry.timestamp, '2026-01-01T00:00:00Z');
  assert.equal(entry.level, 'error');
  assert.match(entry.message, /request failed/);
  assert.doesNotMatch(entry.message, /top-secret/);
});

test('log buffer keeps only the latest entries', () => {
  const buffer = createLogBuffer(2);
  buffer.add(1);
  buffer.add(2);
  buffer.add(3);
  assert.deepEqual(buffer.list(), [2, 3]);
});
