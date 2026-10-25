import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDrowsiness } from '../src/detection.js';

test('ignores low confidence readings', () => assert.equal(classifyDrowsiness({ drowsinessScore: 0.99, confidence: 0.4 }), null));
test('returns warning for elevated score', () => assert.equal(classifyDrowsiness({ drowsinessScore: 0.7, confidence: 0.9 })?.level, 'WARNING'));
test('returns critical for prolonged closure', () => assert.equal(classifyDrowsiness({ drowsinessScore: 0.5, eyeClosedMs: 2200, confidence: 0.9 })?.level, 'CRITICAL'));
