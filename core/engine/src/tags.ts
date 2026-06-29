// Fabric reactTags are caller-allocated: even numbers (odd-mod-10 is reserved
// for root tags). A tag is minted once when a node is first created and then
// stays with it across clone-on-write commits (the clone keeps the family), so
// this counter only ever moves forward: one tag per node, not per commit.
let next = 2;

export function nextTag(): number {
  const tag = next;
  next += 2;
  return tag;
}
