import { test } from "node:test";
import assert from "node:assert/strict";

import { IntervalTree } from "../src/index.js";

// --- Happy path ----------------------------------------------------------

test("pointQuery returns values whose half-open interval contains x", () => {
  const t = new IntervalTree();
  t.insert(0, 10, "a"); // [0,10) contains 0..9
  t.insert(10, 20, "b"); // [10,20) contains 10..19
  assert.deepEqual(t.pointQuery(5), ["a"]);
  assert.deepEqual(t.pointQuery(15), ["b"]);
});

test("pointQuery at exact boundary respects half-open semantics", () => {
  const t = new IntervalTree();
  t.insert(0, 10, "a");
  t.insert(10, 20, "b");
  assert.deepEqual(t.pointQuery(0), ["a"]); // left endpoint included
  assert.deepEqual(t.pointQuery(10), ["b"]); // right endpoint excluded from a
  assert.deepEqual(t.pointQuery(20), []); // excluded from b
});

test("multiple intervals containing x come back sorted by low", () => {
  const t = new IntervalTree();
  t.insert(0, 100, "outer");
  t.insert(40, 60, "mid");
  t.insert(45, 55, "inner");
  assert.deepEqual(t.pointQuery(50), ["outer", "mid", "inner"]);
});

// --- Edge cases the implementation actually handles ----------------------

test("insert rejects low >= high", () => {
  const t = new IntervalTree();
  assert.throws(() => t.insert(5, 5, "x"), RangeError);
  assert.throws(() => t.insert(6, 5, "x"), RangeError);
});

test("insert rejects NaN endpoints", () => {
  const t = new IntervalTree();
  assert.throws(() => t.insert(NaN, 5), RangeError);
  assert.throws(() => t.insert(0, NaN), RangeError);
});

test("pointQuery on empty tree returns []", () => {
  assert.deepEqual(new IntervalTree().pointQuery(42), []);
});

test("pointQuery with no matches returns []", () => {
  const t = new IntervalTree();
  t.insert(0, 10, "a");
  t.insert(20, 30, "b");
  assert.deepEqual(t.pointQuery(15), []);
  assert.deepEqual(t.pointQuery(-1), []);
});

test("size tracks insertions", () => {
  const t = new IntervalTree();
  assert.equal(t.size, 0);
  t.insert(0, 1, null);
  t.insert(1, 2, null);
  t.insert(2, 3, null);
  assert.equal(t.size, 3);
});

// --- Duplicates and removal ---------------------------------------------

test("duplicate intervals are stored separately and both returned", () => {
  const t = new IntervalTree();
  const h1 = t.insert(0, 10, "first");
  const h2 = t.insert(0, 10, "second");
  assert.deepEqual(t.pointQuery(5), ["first", "second"]);
  assert.equal(t.size, 2);
  assert.notEqual(h1, h2);
});

test("remove by handle deletes exactly one matching interval", () => {
  const t = new IntervalTree();
  const h1 = t.insert(0, 10, "first");
  const h2 = t.insert(0, 10, "second");
  assert.equal(t.remove(h1), true);
  assert.equal(t.size, 1);
  assert.deepEqual(t.pointQuery(5), ["second"]);
  assert.equal(t.remove(h2), true);
  assert.equal(t.size, 0);
  assert.deepEqual(t.pointQuery(5), []);
});

test("remove with unknown handle returns false", () => {
  const t = new IntervalTree();
  t.insert(0, 10, "a");
  assert.equal(t.remove(999), false);
  assert.equal(t.size, 1);
});

// --- Structure integrity after stress ------------------------------------
//
// We cannot observe the red-black invariants directly without exposing
// internals, but we CAN observe that the tree still answers correctly after
// many interleaved insertions and deletions.  If rotations or maxHigh
// maintenance were wrong, pointQuery would drift here.

test("pointQuery stays correct across mixed insert/remove", () => {
  const t = new IntervalTree();
  const handles = [];
  // Insert 30 intervals [i, i+5).
  for (let i = 0; i < 30; i++) {
    handles.push(t.insert(i, i + 5, `v${i}`));
  }
  assert.equal(t.size, 30);
  // Remove every third one.
  for (let i = 0; i < 30; i += 3) {
    assert.equal(t.remove(handles[i]), true);
  }
  assert.equal(t.size, 20);
  // For each point, compute the expected survivors explicitly and compare.
  for (let x = 0; x < 35; x++) {
    const expected = [];
    for (let i = 0; i < 30; i++) {
      if (i % 3 === 0) continue;
      if (i <= x && x < i + 5) expected.push(`v${i}`);
    }
    assert.deepEqual(
      t.pointQuery(x),
      expected,
      `mismatch at x=${x}`,
    );
  }
});

test("pointQuery stays correct after removing all nodes one by one", () => {
  const t = new IntervalTree();
  const hs = [];
  for (let i = 0; i < 20; i++) hs.push(t.insert(i, i + 3, i));
  // Remove in reverse insertion order to exercise successor deletion paths.
  for (let i = 19; i >= 0; i--) {
    assert.equal(t.remove(hs[i]), true);
    assert.equal(t.size, i);
  }
  assert.deepEqual(t.pointQuery(10), []);
});

test("insert then query with negative endpoints", () => {
  const t = new IntervalTree();
  t.insert(-50, -40, "neg");
  t.insert(-45, -10, "wide");
  assert.deepEqual(t.pointQuery(-45), ["neg", "wide"]);
  assert.deepEqual(t.pointQuery(-42), ["neg", "wide"]);
  assert.deepEqual(t.pointQuery(-20), ["wide"]);
  assert.deepEqual(t.pointQuery(-10), []);
});
