import test from 'node:test';
import assert from 'node:assert/strict';
import { secondsToTimecode, clamp } from '../src/index.ts';
test('formats subtitle timecode', () => assert.equal(secondsToTimecode(61.234), '00:01:01,234'));
test('clamps values', () => assert.equal(clamp(12, 0, 10), 10));
test('rejects invalid time', () => assert.throws(() => secondsToTimecode(-1), RangeError));
