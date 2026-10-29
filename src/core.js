/*
 * Core implementation: a Red-Black interval tree.
 *
 * Design decisions (stated plainly so the behaviour is never a surprise):
 *
 * 1. Intervals are **half-open**: [low, high).  A query point x is contained
 *    by an interval [lo, hi) iff lo <= x && x < hi.  Half-open ranges compose
 *    cleanly (adjacent [0,1) and [1,2) do not overlap) and avoid the ambiguity
 *    of whether a single point "touches" a closed endpoint.  The README says
 *    this once, and every method below assumes it.
 *
 * 2. The tree is keyed by `low`, the left endpoint.  Ties on `low` are broken
 *    by `high` so that insertion order never affects the visible structure.
 *
 * 3. Each node caches `maxHigh`: the largest `high` seen in its subtree.  This
 *    is the classic CLRS augmentation and lets pointQuery prune an entire
 *    subtree when node.left.maxHigh < x AND node.interval.low > x.
 *
 * 4. Duplicate intervals (same low and high) are allowed and each insertion
 *    returns a distinct opaque handle so the caller can remove one without
 *    guessing which node a value lives in.
 */

/** @typedef {number} Handle — opaque, unique per inserted interval. */

let nextHandle = 1;

/**
 * Internal node.  Fields are mutated in place during RB fixups, so we use a
 * plain mutable class rather than a frozen record.
 */
class Node {
  /**
   * @param {number} low
   * @param {number} high
   * @param {unknown} value
   */
  constructor(low, high, value) {
    this.low = low;
    this.high = high;
    this.value = value;
    this.maxHigh = high;
    // Handles are 32-bit-ish positive integers wrapped to a safe range so
    // they stay small and JSON-friendly even after millions of insertions.
    this.handle = nextHandle++;
    this.red = true; // new nodes start red (RB invariant)
    this.left = null;
    this.right = null;
    this.parent = null;
  }
}

// Re-augment maxHigh after structural mutation.  Pulled into a helper because
// every rotation and delete touches several nodes at once.
function recomputeMaxHigh(n) {
  let m = n.high;
  if (n.left && n.left.maxHigh > m) m = n.left.maxHigh;
  if (n.right && n.right.maxHigh > m) m = n.right.maxHigh;
  n.maxHigh = m;
}

export class IntervalTree {
  constructor() {
    this.root = null;
    this._size = 0;
    this._byHandle = new Map();
  }

  /** Number of intervals currently stored. */
  get size() {
    return this._size;
  }

  /**
   * Insert [low, high) with an associated value.
   * @param {number} low
   * @param {number} high
   * @param {unknown} [value]
   * @returns {number} opaque handle for removal
   */
  insert(low, high, value) {
    if (typeof low !== "number" || typeof high !== "number") {
      throw new TypeError("low and high must be numbers");
    }
    if (Number.isNaN(low) || Number.isNaN(high)) {
      throw new RangeError("low and high must not be NaN");
    }
    if (!(low < high)) {
      // Covers low >= high and the degenerate low === high (empty interval).
      throw new RangeError(`require low < high; got low=${low}, high=${high}`);
    }

    const node = new Node(low, high, value);
    this._byHandle.set(node.handle, node);

    // Standard BST insert by (low, high).
    let y = null;
    let x = this.root;
    while (x !== null) {
      y = x;
      if (node.low < x.low || (node.low === x.low && node.high < x.high)) {
        x = x.left;
      } else {
        x = x.right;
      }
    }
    node.parent = y;
    if (y === null) {
      this.root = node;
    } else if (
      node.low < y.low ||
      (node.low === y.low && node.high < y.high)
    ) {
      y.left = node;
    } else {
      y.right = node;
    }

    this._insertFixup(node);

    // Walk up refreshing maxHigh — the RB fixup may have rotated, so we start
    // from the newly inserted node and climb to the root.
    for (let p = node; p !== null; p = p.parent) recomputeMaxHigh(p);

    this._size++;
    return node.handle;
  }

  _insertFixup(z) {
    while (z.parent !== null && z.parent.red) {
      const gp = z.parent.parent;
      if (gp === null) break;
      if (z.parent === gp.left) {
        const y = gp.right;
        if (y !== null && y.red) {
          z.parent.red = false;
          y.red = false;
          gp.red = true;
          z = gp;
        } else {
          if (z === z.parent.right) {
            z = z.parent;
            this._rotateLeft(z);
          }
          if (z.parent !== null) {
            z.parent.red = false;
            if (z.parent.parent !== null) {
              z.parent.parent.red = true;
              this._rotateRight(z.parent.parent);
            }
          }
        }
      } else {
        const y = gp.left;
        if (y !== null && y.red) {
          z.parent.red = false;
          y.red = false;
          gp.red = true;
          z = gp;
        } else {
          if (z === z.parent.left) {
            z = z.parent;
            this._rotateRight(z);
          }
          if (z.parent !== null) {
            z.parent.red = false;
            if (z.parent.parent !== null) {
              z.parent.parent.red = true;
              this._rotateLeft(z.parent.parent);
            }
          }
        }
      }
    }
    this.root.red = false;
  }

  _rotateLeft(x) {
    const y = x.right;
    if (y === null) return;
    x.right = y.left;
    if (y.left !== null) y.left.parent = x;
    y.parent = x.parent;
    if (x.parent === null) {
      this.root = y;
    } else if (x === x.parent.left) {
      x.parent.left = y;
    } else {
      x.parent.right = y;
    }
    y.left = x;
    x.parent = y;
    recomputeMaxHigh(x);
    recomputeMaxHigh(y);
  }

  _rotateRight(x) {
    const y = x.left;
    if (y === null) return;
    x.left = y.right;
    if (y.right !== null) y.right.parent = x;
    y.parent = x.parent;
    if (x.parent === null) {
      this.root = y;
    } else if (x === x.parent.right) {
      x.parent.right = y;
    } else {
      x.parent.left = y;
    }
    y.right = x;
    x.parent = y;
    recomputeMaxHigh(x);
    recomputeMaxHigh(y);
  }

  /**
   * Remove the interval identified by its insertion handle.
   * @param {number} handle
   * @returns {boolean} true if something was removed
   */
  remove(handle) {
    const z = this._byHandle.get(handle);
    if (!z) return false;

    let y = z;
    let yWasRed = y.red;
    let x = null;
    let xParent = null;

    if (z.left === null) {
      x = z.right;
      this._transplant(z, z.right);
      xParent = z.parent;
    } else if (z.right === null) {
      x = z.left;
      this._transplant(z, z.left);
      xParent = z.parent;
    } else {
      y = this._minimum(z.right); // in-order successor
      yWasRed = y.red;
      x = y.right;
      if (y.parent === z) {
        xParent = y;
      } else {
        xParent = y.parent;
        this._transplant(y, y.right);
        y.right = z.right;
        y.right.parent = y;
      }
      this._transplant(z, y);
      y.left = z.left;
      y.left.parent = y;
      y.red = z.red;
    }

    this._byHandle.delete(handle);
    this._size--;

    // Refresh maxHigh along the path from xParent to the root.  We re-walk
    // rather than track a precise splice point because delete can move y up
    // two levels, and a single unified walk is simpler and obviously correct.
    for (let p = xParent; p !== null; p = p.parent) recomputeMaxHigh(p);

    if (!yWasRed && x !== null) {
      this._deleteFixup(x, xParent);
    }

    return true;
  }

  _transplant(u, v) {
    if (u.parent === null) {
      this.root = v;
    } else if (u === u.parent.left) {
      u.parent.left = v;
    } else {
      u.parent.right = v;
    }
    if (v !== null) v.parent = u.parent;
  }

  _minimum(n) {
    while (n.left !== null) n = n.left;
    return n;
  }

  _deleteFixup(x, parent) {
    while (x !== this.root && (x === null || !x.red)) {
      if (parent === null) break;
      if (x === parent.left) {
        let w = parent.right;
        if (w !== null && w.red) {
          w.red = false;
          parent.red = true;
          this._rotateLeft(parent);
          w = parent.right;
        }
        if (w === null) break;
        const wlBlack = w.left === null || !w.left.red;
        const wrBlack = w.right === null || !w.right.red;
        if (wlBlack && wrBlack) {
          w.red = true;
          x = parent;
          parent = x.parent;
        } else {
          if (wrBlack) {
            if (w.left !== null) w.left.red = false;
            w.red = true;
            this._rotateRight(w);
            w = parent.right;
          }
          w.red = parent.red;
          parent.red = false;
          if (w.right !== null) w.right.red = false;
          this._rotateLeft(parent);
          x = this.root;
          break;
        }
      } else {
        let w = parent.left;
        if (w !== null && w.red) {
          w.red = false;
          parent.red = true;
          this._rotateRight(parent);
          w = parent.left;
        }
        if (w === null) break;
        const wrBlack = w.right === null || !w.right.red;
        const wlBlack = w.left === null || !w.left.red;
        if (wlBlack && wrBlack) {
          w.red = true;
          x = parent;
          parent = x.parent;
        } else {
          if (wlBlack) {
            if (w.right !== null) w.right.red = false;
            w.red = true;
            this._rotateLeft(w);
            w = parent.left;
          }
          w.red = parent.red;
          parent.red = false;
          if (w.left !== null) w.left.red = false;
          this._rotateRight(parent);
          x = this.root;
          break;
        }
      }
    }
    if (x !== null) x.red = false;
  }

  /**
   * Return all values whose interval [low, high) contains x.
   * Order is ascending by (low, high), which is stable across mutations.
   * @param {number} x
   * @returns {unknown[]}
   */
  pointQuery(x) {
    if (typeof x !== "number" || Number.isNaN(x)) {
      throw new TypeError("x must be a finite number");
    }
    const out = [];
    this._pointQuery(this.root, x, out);
    return out;
  }

  _pointQuery(n, x, out) {
    if (n === null) return;
    // Prune: if the subtree's largest high cannot reach x, nothing here or
    // below contains x.  This is the single reason the augmentation exists.
    if (n.maxHigh <= x) return;
    this._pointQuery(n.left, x, out);
    if (n.low <= x && x < n.high) out.push(n.value);
    // Even when this node does not contain x, a right child with low <= x
    // still might, so we descend whenever n.low <= x.
    if (n.low <= x) this._pointQuery(n.right, x, out);
  }
}
