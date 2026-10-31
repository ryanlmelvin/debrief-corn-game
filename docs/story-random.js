// Independent, stateless draws keep story variety from changing combat randomness.
export function storyDraw(seed, key) {
  let value=2166136261;
  for(const character of `${seed}:${key}`)value=Math.imul(value^character.charCodeAt(0),16777619);
  value=Math.imul(value^(value>>>16),0x85ebca6b);
  value=Math.imul(value^(value>>>13),0xc2b2ae35);
  return (value^(value>>>16))>>>0;
}
