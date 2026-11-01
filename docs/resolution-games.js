import { createRescue, advanceRescue, rescueAction, validRescue } from './rescue.js';

export const RESOLUTION_GAMES = ['rescue'];

export function createResolutionActivity(s, route) {
  return route === 'rescue' ? { kind: route, state: createRescue(s.rng) } : null;
}

export function validResolutionActivity(activity, route) {
  return !!activity && Object.keys(activity).length === 2 && activity.kind === route &&
    route === 'rescue' && validRescue(activity.state);
}

export function resolutionGameActive(s) {
  const r = s?.resolution;
  return s?.phase === 'resolution' && r?.step === 2 &&
    validResolutionActivity(r.activity, r.route) && r.activity.state.stage !== 'complete';
}

export function resolutionGameAction(s, action) {
  if (!resolutionGameActive(s)) return false;
  return rescueAction(s.resolution.activity.state, action);
}

export function advanceResolutionGame(s, dt) {
  if (!resolutionGameActive(s)) return;
  advanceRescue(s.resolution.activity.state, dt);
}

// Held inputs belong to the current pointer/key session, never to a pause,
// background tab, update, or restored session.
export function releaseResolutionGame(s) {
  if (s?.resolution?.activity?.kind === 'rescue') rescueAction(s.resolution.activity.state, 'release');
}
