// node --test
import test from "node:test";
import assert from "node:assert/strict";
import { newMatch, roll, step, REARM_MS } from "./state.js";

const HIT = () => 0.9, CRIT = () => 0.2, JAM = () => 0.1;

test("odds: 15% malfunction, 20% crit, 65% hit", () => {
  assert.equal(roll(0.149), "malfunction");
  assert.equal(roll(0.15), "crit");
  assert.equal(roll(0.349), "crit");
  assert.equal(roll(0.35), "hit");
});

test("only the side to move fires, and the turn passes", () => {
  const m = newMatch();
  assert.equal(step(m, "B", "m14", 0, true, HIT), null); // not B's turn
  const shot = step(m, "A", "ak_47", 0, true, HIT);
  assert.deepEqual(shot, { side: "A", target: "B", weaponId: "ak_47", outcome: "hit", damage: 28 });
  assert.equal(m.hp.B, 172);
  assert.equal(m.turn, "B");
});

test("a side can't fire the other side's weapon or with an agent out of view", () => {
  const m = newMatch();
  assert.equal(step(m, "A", "m14", 0, true, HIT), null);
  assert.equal(step(m, "A", "ak_47", 0, false, HIT), null);
  assert.equal(m.turn, "A");
});

test("tracking flicker can't fire twice: the card must be away for REARM_MS", () => {
  const m = newMatch();
  step(m, "A", "ak_47", 0, true, HIT);
  step(m, "B", "m14", 10, true, JAM); // B jams, turn back to A
  assert.equal(m.turn, "A");
  // A's card never left the table: no shot.
  assert.equal(step(m, "A", "ak_47", 20, true, HIT), null);
  // Card lost for one frame (flicker) then back: still no shot.
  step(m, "A", null, 30, true, HIT);
  assert.equal(step(m, "A", "ak_47", 40, true, HIT), null);
  // Lifted for long enough, then laid down again: fires.
  step(m, "A", null, 40 + REARM_MS, true, HIT);
  assert.ok(step(m, "A", "famas_f1", 50 + REARM_MS, true, HIT));
});

test("crits round to whole HP and the match ends at 0", () => {
  const m = newMatch();
  m.hp.B = 20;
  const shot = step(m, "A", "pp_19_bizon", 0, true, CRIT); // 15 x 1.5 = 22.5
  assert.equal(shot.damage, 23);
  assert.equal(m.hp.B, 0);
  assert.equal(m.winner, "A");
  step(m, "B", null, REARM_MS, true, HIT);
  assert.equal(step(m, "B", "m14", REARM_MS + 1, true, HIT), null); // nothing after the end
});
