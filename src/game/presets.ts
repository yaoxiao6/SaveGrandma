import type { Action, GameController, ObjectId } from './types';
export const go = (id: ObjectId): Action => ({ type: 'move_to', target: { id } });
export const grab = (id: ObjectId): Action => ({ type: 'grab', target: { id } });
const rear: Action = { type: 'switch_camera', mode: 'rear' };
const bend: Action = { type: 'bend' };
const stand: Action = { type: 'stand' };
const valve: Action = { type: 'rotate', target: { id: 'supply_valve' }, direction: 'clockwise' };
const joint: Action = { type: 'rotate', target: { id: 'pipe_joint' }, direction: 'clockwise' };
export const PRESETS: Record<string, { name: string; description: string; seed: number; actions: Action[] }> = {
  valve: { name: '01 · Close the valve', description: 'A free hand, a red valve, one clockwise turn.', seed: 7, actions: [rear, go('supply_valve'), valve] },
  wrench: { name: '02 · Tighten the joint', description: 'Pick up the wrench, approach the leak, bend, and tighten.', seed: 7, actions: [rear, go('wrench'), grab('wrench'), go('pipe_joint'), bend, joint] },
  patch: { name: '03 · Patch + clamp', description: 'Set the phone down. Both hands are needed for each repair step.', seed: 7, actions: [rear, go('dry_spot'), { type: 'place_phone', target: { id: 'dry_spot' } }, go('patch'), grab('patch'), go('pipe_joint'), bend, { type: 'apply_patch', target: { id: 'pipe_joint' } }, stand, go('clamp'), grab('clamp'), go('pipe_joint'), bend, { type: 'secure_patch', target: { id: 'pipe_joint' } }] },
  mitigation: { name: '04 · Buy some time', description: 'Towels and bucket add at most 60 seconds together at the initial leak rate.', seed: 7, actions: [rear, go('towels'), grab('towels'), go('puddle'), bend, { type: 'place', item: 'towels', target: { id: 'puddle' } }, stand, go('bucket'), bend, grab('bucket'), stand, go('puddle'), bend, { type: 'place', item: 'bucket', target: { id: 'puddle' } }, stand] },
  flood: { name: '05 · Flood failure', description: 'No intervention. Use 10× speed to inspect the five-minute limit.', seed: 7, actions: [rear, { type: 'wait', seconds: 300 }] },
  missing_tool: { name: '06 · Missing wrench', description: 'An in-reach joint cannot be tightened without the wrench.', seed: 7, actions: [rear, go('pipe_joint'), bend, joint] },
  posture: { name: '07 · Wrong posture', description: 'The low pipe joint requires bending.', seed: 7, actions: [rear, go('wrench'), grab('wrench'), go('pipe_joint'), joint] },
  reach: { name: '08 · Out of reach', description: 'No automatic walking when an interaction is out of reach.', seed: 7, actions: [valve] },
  hands: { name: '09 · Occupied hands', description: 'Phone + wrench leave no room for the patch.', seed: 7, actions: [go('wrench'), grab('wrench'), go('patch'), grab('patch')] },
  ambiguity: { name: '10 · Ambiguous fitting', description: 'Seed 7 picks a plausible alternate fitting, then reports the actual outcome.', seed: 7, actions: [rear, go('supply_valve'), { type: 'rotate', target: { candidates: ['supply_valve', 'pipe_joint'] }, direction: 'clockwise' }] },
  clarification: { name: '11 · Clarification', description: 'A target without a rotation direction cannot be executed.', seed: 7, actions: [rear, go('supply_valve'), { type: 'rotate', target: { id: 'supply_valve' } }] },
  wrong_way: { name: '12 · Wrong rotation', description: 'An explicit counterclockwise instruction reliably worsens the leak.', seed: 7, actions: [rear, go('supply_valve'), { type: 'rotate', target: { id: 'supply_valve' }, direction: 'counterclockwise' }] },
};
/** Presets exercise exactly the public interface the voice adapter will use. */
export function runPreset(controller: GameController, key: string, seed?: number) {
  const preset = PRESETS[key];
  controller.reset({ seed: seed ?? preset.seed }); controller.start();
  const runId = controller.getObservation().runId;
  return preset.actions.map(action => controller.submitAction({ runId, action }));
}
