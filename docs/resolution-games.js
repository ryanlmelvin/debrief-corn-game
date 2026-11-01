import { createRescue, advanceRescue, rescueAction, validRescue } from './rescue.js';
import { createTransmission, advanceTransmission, transmissionAction, validTransmission } from './transmission.js';

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
  else advanceTransmission(state, dt);
}

// Held inputs belong to the current pointer/key session, never to a pause,
// background tab, update, or restored session.
export function releaseResolutionGame(s) {
  if (s?.resolution?.activity?.kind === 'rescue') rescueAction(s.resolution.activity.state, 'release');
}
