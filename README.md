# red-black-interval-tree

A self-balancing interval tree that answers point-containment queries: given a point `x`, return every stored interval `[low, high)` that contains it.

## Usage

```js
import { IntervalTree } from "red-black-interval-tree";

const t = new IntervalTree();
const h = t.insert(0, 10, "a");        // half-open [0, 10)
t.insert(5, 15, "b");

t.pointQuery(7);  // ["a", "b"]
t.pointQuery(10); // ["b"]   — 10 is excluded from [0,10)
t.remove(h);      // true
t.pointQuery(7);  // ["b"]
```

## Exports

- `IntervalTree` — the only exported class.
  - `insert(low, high, value?) -> handle` (number)
  - `remove(handle) -> boolean`
  - `pointQuery(x) -> unknown[]`
  - `size` (getter, number)

## Why this exists

Point-containment over a dynamic set of ranges is common (scheduling, hit testing, version overlap). A flat scan is O(n); a balanced interval tree with the CLRS `maxHigh` augmentation is O(log n + k) for `k` matches, and stays balanced under arbitrary insertion and deletion.

The trade-off: intervals are keyed by `low`, so the tree is optimised for point queries, not for "find all intervals overlapping `[a, b]`". If you need full overlap queries rather than point containment, this is not the right structure.

## The awkward edge

Intervals are **half-open**: `[low, high)`. A point equal to `high` is NOT contained. Two adjacent intervals `[0, 10)` and `[10, 20)` do not overlap — `pointQuery(10)` returns only the second. This avoids the ambiguity of whether a zero-width closed interval `[5, 5]` should "contain" 5 (we reject `low >= high` on insert, so that case never arises). Pick half-open once, stick with it everywhere.

`insert` throws on `low >= high` or `NaN` rather than silently producing a node that can never match.
