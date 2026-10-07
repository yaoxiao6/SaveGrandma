import type { Action, GameController, ObjectId } from './types';
export const go = (id: ObjectId): Action => ({ type: 'move_to', target: { id } });
export const grab = (id: ObjectId): Action => ({ type: 'grab', target: { id } });
export const open = (id: ObjectId): Action => ({ type: 'open', target: { id } });
const rear: Action = { type: 'switch_camera', mode: 'rear' };
const bend: Action = { type: 'bend' };
const stand: Action = { type: 'stand' };
const tighten: Action = { type: 'rotate', target: { id: 'pipe_joint' }, direction: 'counterclockwise' };
/** Walk to the table and open every box; the wrench is in one of them depending on the seed. */
export const FIND_WRENCH: Action[] = [go('blue_toolbox'), open('red_toolbox'), open('blue_toolbox'), open('green_toolbox'), grab('wrench')];
export const PRESETS: Record<string, { name: string; description: string; seed: number; actions: Action[] }> = {
  wrench: { name: '01 · Tighten the pipe', description: 'Open the toolboxes, find the wrench, approach the leak, bend, and tighten.', seed: 7, actions: [rear, ...FIND_WRENCH, go('pipe_joint'), bend, tighten] },
  mitigation: { name: '02 · Buy some time', description: 'Towels and bucket add at most 15 seconds together at the initial leak rate.', seed: 7, actions: [rear, go('towels'), grab('towels'), go('puddle'), bend, { type: 'place', item: 'towels', target: { id: 'puddle' } }, stand, go('bucket'), bend, grab('bucket'), stand, go('puddle'), bend, { type: 'place', item: 'bucket', target: { id: 'puddle' } }, stand] },
  flood: { name: '03 · Flood failure', description: 'No intervention. One minute until the bathroom floods.', seed: 7, actions: [rear, { type: 'wait', seconds: 120 }] },
  missing_tool: { name: '04 · Missing wrench', description: 'The pipe cannot be tightened bare-handed.', seed: 7, actions: [rear, go('pipe_joint'), bend, tighten] },
  wrong_tool: { name: '05 · Wrong tool', description: 'A hammer is no use on a pipe.', seed: 7, actions: [rear, go('blue_toolbox'), open('red_toolbox'), open('blue_toolbox'), open('green_toolbox'), grab('hammer'), go('pipe_joint'), bend, tighten] },
  posture: { name: '06 · Wrong posture', description: 'The low pipe requires bending.', seed: 7, actions: [rear, ...FIND_WRENCH, go('pipe_joint'), tighten] },
  reach: { name: '07 · Out of reach', description: 'No automatic walking when an interaction is out of reach.', seed: 7, actions: [open('red_toolbox')] },
  hands: { name: '08 · Occupied hands', description: 'Phone + wrench leave no room for a second tool.', seed: 7, actions: [...FIND_WRENCH, grab('hammer')] },
  ambiguity: { name: '09 · Ambiguous toolbox', description: '“Open the toolbox” with three in view: a seeded stress check picks one or asks.', seed: 7, actions: [rear, go('blue_toolbox'), { type: 'open', target: { candidates: ['red_toolbox', 'blue_toolbox', 'green_toolbox'] } }] },
  clarification: { name: '10 · Clarification', description: 'A target without a rotation direction cannot be executed.', seed: 7, actions: [rear, ...FIND_WRENCH, go('pipe_joint'), bend, { type: 'rotate', target: { id: 'pipe_joint' } }] },
  wrong_way: { name: '11 · Wrong rotation', description: 'An explicit clockwise instruction reliably worsens the leak.', seed: 7, actions: [rear, ...FIND_WRENCH, go('pipe_joint'), bend, { type: 'rotate', target: { id: 'pipe_joint' }, direction: 'clockwise' }] },
};
/** Presets exercise exactly the public interface the voice adapter will use. */
export function runPreset(controller: GameController, key: string, seed?: number) {
  const preset = PRESETS[key];
  controller.reset({ seed: seed ?? preset.seed }); controller.start();
  const runId = controller.getObservation().runId;
  return preset.actions.map(action => controller.submitAction({ runId, action }));
}
