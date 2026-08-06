import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePracticeScrollPosition,
  normalizePracticeScrollSpeed,
  practiceScrollPixelsPerSecond,
} from '../src/practice-scroll.js';

test('practice speed remains within the visible 0.1 to 1.0 range', () => {
  assert.equal(normalizePracticeScrollSpeed(-4), 0.1);
  assert.equal(normalizePracticeScrollSpeed(0.54), 0.5);
  assert.equal(normalizePracticeScrollSpeed(9), 1);
});

test('scroll rate is independent of audio or song duration', () => {
  assert.equal(practiceScrollPixelsPerSecond(0.1), 5);
  assert.equal(practiceScrollPixelsPerSecond(1), 45);
  assert.ok(practiceScrollPixelsPerSecond(0.5) > 20);
  assert.ok(practiceScrollPixelsPerSecond(0.5) < 24);
});

test('sub-pixel frame advances accumulate instead of rounding to zero', () => {
  let position = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    position = advancePracticeScrollPosition(position, 1 / 60, 0.1, 1000);
  }
  assert.ok(position >= 4.99 && position <= 5.01, `advanced ${position}px`);
});

test('scrolling clamps elapsed stalls and stops at the document end', () => {
  assert.equal(advancePracticeScrollPosition(95, 10, 1, 100), 100);
  assert.equal(advancePracticeScrollPosition(20, 0.25, 1, 100), 31.25);
  assert.equal(advancePracticeScrollPosition(20, 1, 1, 100), 31.25);
  assert.equal(advancePracticeScrollPosition(20, 1, 1, 0), 0);
});
