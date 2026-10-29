/*
 * red-black-interval-tree — public entry point.
 *
 * Only this module is meant to be imported by users:
 *     import { IntervalTree } from "red-black-interval-tree";
 *
 * Re-exporting the concrete class keeps the public surface minimal and
 * stable: callers depend on a single, documented name rather than on the
 * internal module layout, which may change between releases.
 */
export { IntervalTree } from "./core.js";
