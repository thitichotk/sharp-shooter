// Sharp-Shooter: wires MindAR card tracking and the A-Frame scene to the rules in state.js,
// and draws the broadcast HUD (scorebug, kill feed, lower third, card locks).
import { WEAPONS, MAX_HP, newMatch, step } from "./state.js";

const $ = (id) => document.getElementById(id);
const scene = document.querySelector("a-scene");

const SIDES = {
  A: { target: "charaA", name: "Agent A", tag: "CT", css: "a", color: "var(--ct)" },
  B: { target: "charaB", name: "Agent B", tag: "T", css: "b", color: "var(--t)" },
};
const WEAPON_IDS = Object.keys(WEAPONS);
const CARD_HEIGHT = { agent: 857 / 653, weapon: 552 / 858 }; // printed art, in card widths
const SHOT_EFFECT_MS = 2000;
const FEED_ROWS = 4;

// ---------- Tracking ----------

const seen = {}; // target element id -> currently tracked
for (const el of document.querySelectorAll("[mindar-image-target]")) {
  el.addEventListener("targetFound", () => (seen[el.id] = true));
  el.addEventListener("targetLost", () => (seen[el.id] = false));
}
const weaponInView = (side) => WEAPON_IDS.find((id) => WEAPONS[id].side === side && seen[`${id}-card`]) || null;

// ---------- Scene ----------

for (const [side, s] of Object.entries(SIDES)) {
  s.model = $(`model-${side}`);
  s.shot = $(`shot-${side}`);
  s.death = $(`death-${side}`);
  s.guns = WEAPON_IDS.filter((id) => WEAPONS[id].side === side).map((id) => [id, $(`gun-${id}`)]);
  s.pose = "eye_test";
}

function setPose(s, pose) {
  if (s.pose === pose) return; // setting the mixer every frame restarts nothing but costs a lot
  s.pose = pose;
  s.model.setAttribute("animation-mixer", "clip", pose);
}

const posA = new THREE.Vector3();
const posB = new THREE.Vector3();
function faceEachOther() {
  SIDES.A.model.object3D.getWorldPosition(posA);
  SIDES.B.model.object3D.getWorldPosition(posB);
  SIDES.A.model.object3D.lookAt(posB);
  SIDES.B.model.object3D.lookAt(posA);
}

// ---------- HUD ----------

let match = newMatch();
let running = false;
let overTimer = 0;

function renderScore() {
  for (const side of ["A", "B"]) {
    const hp = $(`hp-${side}`);
    hp.textContent = match.hp[side];
    hp.style.setProperty("--pct", `${(match.hp[side] / MAX_HP) * 100}%`);
  }
  $("turn").textContent = match.winner ? "–" : match.turn;
  $("scorebug").setAttribute(
    "aria-label",
    `Agent A ${match.hp.A} HP, Agent B ${match.hp.B} HP` + (match.winner ? "" : `, Agent ${match.turn} to move`),
  );
}

function addFeedRow(shot) {
  const s = SIDES[shot.side], t = SIDES[shot.target];
  const row = document.createElement("div");
  row.className = "row";
  const span = (cls, text) => Object.assign(document.createElement("span"), { className: cls, textContent: text });
  row.append(span(s.css, s.name), span("gun", WEAPONS[shot.weaponId].name));
  if (shot.outcome === "malfunction") row.append(span("miss", "Malfunction"));
  else {
    row.append(span(t.css, t.name));
    if (shot.outcome === "crit") row.append(span("crit", "Crit"));
    row.append(span("dmg", shot.damage));
  }
  $("feed").prepend(row);
  while ($("feed").children.length > FEED_ROWS) $("feed").lastChild.remove();
}

let lowerKey = "";
function renderLower(bothInView) {
  const side = match.turn, s = SIDES[side];
  const text = !bothInView
    ? "Show both agent cards to the camera."
    : !match.armed[side]
      ? "Lift the weapon card off the table, then lay one down to fire."
      : `Lay one of ${s.name}'s weapon cards beside the agent.`;
  const key = `${side}|${text}|${!!match.winner}`;
  if (key === lowerKey) return; // the DOM only changes when the message does
  lowerKey = key;
  $("lower").hidden = !!match.winner;
  $("lower").style.setProperty("--c", s.color);
  $("lower-title").textContent = `${s.name} to fire`;
  $("lower-text").textContent = text;
}

// Card locks: white corner brackets around each tracked card, placed by projecting the card's
// corners (MindAR targets are 1 unit wide, centred) onto the screen.
const locks = {};
const corner = new THREE.Vector3();
function lockFor(targetId, label, sideTag) {
  if (!locks[targetId]) {
    const el = document.createElement("div");
    el.className = "lock";
    el.innerHTML = `<span class="tag">${sideTag ? `<i>${sideTag}</i> ` : ""}${label}</span>`;
    if (sideTag) el.style.setProperty("--c-side", sideTag === "CT" ? "var(--ct)" : "var(--t)");
    $("locks").append(el);
    locks[targetId] = el;
  }
  return locks[targetId];
}

function placeLock(targetId, height, label, sideTag) {
  const el = lockFor(targetId, label, sideTag);
  const target = $(targetId);
  if (!seen[targetId] || !scene.camera) return (el.hidden = true);
  const box = scene.canvas.getBoundingClientRect();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of [[-0.5, -height / 2], [0.5, -height / 2], [-0.5, height / 2], [0.5, height / 2]]) {
    corner.set(x, y, 0).applyMatrix4(target.object3D.matrixWorld).project(scene.camera);
    const sx = box.left + ((corner.x + 1) / 2) * box.width;
    const sy = box.top + ((1 - corner.y) / 2) * box.height;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  if (![x0, y0, x1, y1].every(Number.isFinite)) return (el.hidden = true); // no pose yet
  el.hidden = false;
  Object.assign(el.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
}

function renderLocks() {
  for (const s of Object.values(SIDES)) placeLock(s.target, CARD_HEIGHT.agent, s.name, s.tag);
  for (const id of WEAPON_IDS) placeLock(`${id}-card`, CARD_HEIGHT.weapon, `${WEAPONS[id].name} · ${WEAPONS[id].damage} dmg`);
}

// ---------- Game loop ----------

function onShot(shot) {
  addFeedRow(shot);
  renderScore();
  const s = SIDES[shot.side];
  if (shot.damage > 0) {
    s.shot.object3D.visible = true;
    setTimeout(() => (s.shot.object3D.visible = false), SHOT_EFFECT_MS);
  }
  if (match.winner) {
    SIDES[shot.target].death.object3D.visible = true;
    overTimer = setTimeout(showOver, 1500); // let the explosion play first
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;
  const bothInView = !!(seen.charaA && seen.charaB);
  for (const [side, s] of Object.entries(SIDES)) {
    const weaponId = weaponInView(side);
    s.model.object3D.visible = !!seen[s.target] && match.hp[side] > 0;
    for (const [id, gun] of s.guns) gun.object3D.visible = id === weaponId; // only the card on the table
    setPose(s, weaponId ? "tools_preview" : "eye_test");
    const shot = step(match, side, weaponId, now, bothInView);
    if (shot) onShot(shot);
  }
  if (bothInView) faceEachOther(); // never turn towards a card that isn't there
  renderLower(bothInView);
  renderLocks();
}
requestAnimationFrame(frame);

function showOver() {
  const w = SIDES[match.winner];
  $("result").style.setProperty("--c", w.color);
  $("winner-text").textContent = `${w.name} wins`;
  $("final-score").textContent = `Agent A ${match.hp.A} HP · Agent B ${match.hp.B} HP`;
  $("over").hidden = false;
}

function newGame() {
  clearTimeout(overTimer);
  match = newMatch();
  lowerKey = "";
  $("feed").replaceChildren();
  for (const s of Object.values(SIDES)) s.death.object3D.visible = false;
  renderScore();
  $("over").hidden = true;
}

// ---------- Screens ----------

const startButton = $("start-match");
const assets = document.querySelector("a-assets");
const loadedBytes = {}, totalBytes = {};
for (const item of document.querySelectorAll("a-asset-item")) {
  item.addEventListener("progress", (e) => {
    loadedBytes[item.id] = e.detail.loadedBytes;
    totalBytes[item.id] = e.detail.totalBytes;
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    if (!startButton.disabled) return;
    startButton.textContent = `Loading models ${Math.round((sum(loadedBytes) / Math.max(sum(totalBytes), 1)) * 100)}%`;
  });
}
function assetsReady() {
  startButton.disabled = false;
  startButton.textContent = "Start match";
}
if (assets.hasLoaded) assetsReady();
else assets.addEventListener("loaded", assetsReady);

startButton.addEventListener("click", () => {
  startButton.disabled = true;
  startButton.textContent = "Starting camera";
  scene.systems["mindar-image-system"].start();
});
scene.addEventListener("arReady", () => {
  $("start").hidden = true;
  $("hud").hidden = false;
  newGame();
  running = true;
});
scene.addEventListener("arError", () => {
  $("start").hidden = true;
  $("camera-error").hidden = false;
});
$("retry").addEventListener("click", () => location.reload());
$("rematch").addEventListener("click", newGame);
$("restart").addEventListener("click", newGame);
