// Sharp-Shooter rules, kept free of A-Frame so `node --test` can check them.

export const MAX_HP = 200;
export const REARM_MS = 500; // a weapon card must be off the table this long before its side can fire again

// Damage matches what is printed on each card.
export const WEAPONS = {
  ak_47: { side: "A", name: "AK-47", damage: 28 },
  famas_f1: { side: "A", name: "FAMAS F1", damage: 22 },
  pp_19_bizon: { side: "A", name: "PP-19 Bizon", damage: 15 },
  m14: { side: "B", name: "M14", damage: 27 },
  sks_type_56: { side: "B", name: "SKS Type 56", damage: 24 },
  vz61_skorpion: { side: "B", name: "Vz. 61 Skorpion", damage: 14 },
};

export const other = (side) => (side === "A" ? "B" : "A");

export function newMatch() {
  return {
    hp: { A: MAX_HP, B: MAX_HP },
    turn: "A",
    winner: null,
    armed: { A: true, B: true },
    lastSeen: { A: -Infinity, B: -Infinity },
  };
}

// 15% malfunction, 20% critical (x1.5), 65% hit.
export function roll(r) {
  return r < 0.15 ? "malfunction" : r < 0.35 ? "crit" : "hit";
}

// Call every frame for each side with the weapon card in view (or null).
// Returns the shot when one is fired, otherwise null.
export function step(match, side, weaponId, now, bothAgentsInView, random = Math.random) {
  if (weaponId) match.lastSeen[side] = now;
  else if (now - match.lastSeen[side] >= REARM_MS) match.armed[side] = true;

  const weapon = WEAPONS[weaponId];
  if (!weapon || weapon.side !== side) return null;
  if (match.winner || match.turn !== side || !match.armed[side] || !bothAgentsInView) return null;

  const outcome = roll(random());
  const damage = outcome === "malfunction" ? 0 : Math.round(weapon.damage * (outcome === "crit" ? 1.5 : 1));
  const target = other(side);
  match.hp[target] = Math.max(0, match.hp[target] - damage);
  match.armed[side] = false; // a card left on the table can't fire again next turn
  match.turn = target; // a malfunction still uses the turn
  if (match.hp[target] === 0) match.winner = side;
  return { side, target, weaponId, outcome, damage };
}
