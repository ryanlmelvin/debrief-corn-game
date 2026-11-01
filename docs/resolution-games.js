import { createRescue, advanceRescue, rescueAction, validRescue } from './rescue.js';
import { createTransmission, advanceTransmission, transmissionAction, validTransmission, TRANSMISSION_EXPOSURE_COST } from './transmission.js';
import { startRogue } from './rogue.js';

export const RESOLUTION_GAMES = ['rescue', 'transmission'];

export function resolutionFirstCall(s) {
  const choice = s.fieldEvents?.journal?.find(entry => entry.id === 'first-call')?.choice;
  return ['answer', 'record'].includes(choice) ? choice : 'leave';
}

export function createResolutionActivity(s, route) {
  if (route === 'rescue') return { kind: route, state: createRescue(s.rng) };
  if (route === 'transmission') return { kind: route, state: createTransmission(s.rng, resolutionFirstCall(s)) };
  return null;
}

export function validResolutionActivity(activity, route) {
  return !!activity && Object.keys(activity).length === 2 && activity.kind === route &&
    (route === 'rescue' ? validRescue(activity.state) : route === 'transmission' && validTransmission(activity.state));
}

export function resolutionGameActive(s) {
  const r = s?.resolution;
  return s?.phase === 'resolution' && r?.step === 2 &&
    !(s.practice === 'transmission' && s.exposure >= 100) &&
    validResolutionActivity(r.activity, r.route) && r.activity.state.stage !== 'complete';
}

export function resolutionGameAction(s, action) {
  if (!resolutionGameActive(s)) return false;
  const { kind, state } = s.resolution.activity;
  return kind === 'rescue' ? rescueAction(state, action) : transmissionAction(state, action);
}

export function advanceResolutionGame(s, dt) {
  if (!resolutionGameActive(s)) return;
  const { kind, state } = s.resolution.activity;
  if (kind === 'rescue') advanceRescue(state, dt);
  else {
    // Charge new collision events, never the saved retry count. This also keeps
    // the cost exact when an old save's display counter has reached its limit.
    let collisions = 0;
    advanceTransmission(state, dt, () => { collisions++; });
    if (!collisions) return;
    s.exposure = Math.min(100, s.exposure + collisions * TRANSMISSION_EXPOSURE_COST);
    if (s.exposure < 100 || s.practice) return;
    // Exposure has the same consequence as it does on the field. Keep the
    // completed entry receipts so the Transmission unlock is not lost.
    delete s.resolution;
    s.phase = 'field';
    startRogue(s, 'corn');
  }
}

// Held inputs belong to the current pointer/key session, never to a pause,
// background tab, update, or restored session.
export function releaseResolutionGame(s) {
  if (s?.resolution?.activity?.kind === 'rescue') rescueAction(s.resolution.activity.state, 'release');
}
