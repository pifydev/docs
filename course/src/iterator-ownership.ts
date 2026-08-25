const claimedIterators = new WeakSet<object>();

/** Claims one physical iterator identity across every course model adapter. */
export function claimIteratorOnce(iterator: unknown): boolean {
  if (
    (typeof iterator !== "object" || iterator === null) &&
    typeof iterator !== "function"
  ) {
    return false;
  }
  if (claimedIterators.has(iterator)) return false;
  claimedIterators.add(iterator);
  return true;
}
