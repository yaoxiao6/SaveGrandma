import { describe, expect, it } from 'vitest';
import { createGame } from '../game/controller';
import { getSceneFrame } from './presentation';
import { FIND_WRENCH, PRESETS } from '../game/presets';
import { lensYaw } from '../game/phone';
import type { Action } from '../game/types';

function setup() {
  const { controller, simulation } = createGame(); controller.start();
  const send = (action: Action) => controller.submitAction({ runId: controller.getObservation().runId, action });
  return { controller, simulation, send, frame: () => getSceneFrame(simulation.readState()) };
}

describe('Jeff’s presentation contract and phone camera', () => {
  it('front and rear lenses share a position and point in opposite directions', () => {
    const t = setup(); const selfie = t.frame().phone;
    t.send({ type: 'switch_camera', mode: 'rear' }); t.simulation.advance(1); const rear = t.frame().phone;
    expect(selfie.position).toEqual(rear.position);
    for (let i = 0; i < 3; i++) expect(selfie.target[i] - selfie.position[i]).toBeCloseTo(-(rear.target[i] - rear.position[i]));
  });
  it('bending lowers the phone continuously and shares the character’s progress', () => {
    const t = setup(); const before = t.frame().phone.position[1];
    t.send({ type: 'bend' }); t.simulation.advance(0.5); const middle = t.frame();
    expect(middle.character.bend).toBeCloseTo(0.5); expect(middle.character.animation.name).toBe('Bend_Down');
    t.simulation.advance(0.5); const after = t.frame().phone.position[1];
    expect(middle.phone.position[1]).toBeCloseTo((before + after) / 2);
  });
  it('repeating bend does not make an already bent Grandma pop upright', () => {
    const t = setup(); t.send({ type: 'bend' }); t.simulation.advance(1); t.send({ type: 'bend' }); t.simulation.advance(0.1);
    expect(t.frame().character.bend).toBe(1);
  });
  it('camera-relative look up raises the image aim with either lens', () => {
    for (const mode of ['selfie', 'rear'] as const) {
      const t = setup(); t.send({ type: 'switch_camera', mode }); t.simulation.advance(1);
      const before = t.frame().phone;
      t.send({ type: 'look', direction: 'up', degrees: 20, frame: 'camera' }); t.simulation.advance(1);
      const after = t.frame().phone;
      expect(after.target[1] - after.position[1]).toBeGreaterThan(before.target[1] - before.position[1]);
    }
  });
  it('switching a placed phone’s lens requires physically reaching it', () => {
    const t = setup();
    t.send({ type: 'move_to', target: { id: 'dry_spot' } }); t.send({ type: 'place_phone', target: { id: 'dry_spot' } });
    t.send({ type: 'move_to', target: { id: 'pipe_joint' } }); t.simulation.advance(20);
    t.send({ type: 'switch_camera', mode: 'rear' }); t.simulation.advance(1);
    expect(t.frame().phone.mode).toBe('selfie');
  });
  it('interpolates turning and ends with the same heading used for camera-frame actions', () => {
    const t = setup(); t.send({ type: 'turn', direction: 'left', degrees: 90 }); t.simulation.advance(0.35);
    expect(t.frame().character.yaw).toBeCloseTo(45);
    t.simulation.advance(0.35); expect(t.frame().character.yaw).toBeCloseTo(90);
    expect(t.frame().phone.yaw).toBeCloseTo(lensYaw(t.simulation.readState()));
  });
  it('recenters a previously aimed phone gradually during a body turn', () => {
    const t = setup(); t.send({ type: 'look', direction: 'left', degrees: 35 }); t.simulation.advance(1);
    const initialYaw = t.frame().phone.yaw;
    t.send({ type: 'turn', direction: 'left', degrees: 90 }); t.simulation.advance(0.35);
    const middleYaw = t.frame().phone.yaw;
    t.simulation.advance(0.35);
    expect(middleYaw).toBeCloseTo((initialYaw + t.frame().phone.yaw) / 2);
  });
  it('a placed phone ignores Grandma’s subsequent motion, posture and looking', () => {
    const t = setup();
    t.send({ type: 'move_to', target: { id: 'dry_spot' } }); t.send({ type: 'place_phone', target: { id: 'dry_spot' } }); t.simulation.advance(10);
    const fixed = t.frame().phone;
    t.send({ type: 'move_to', target: { id: 'pipe_joint' } }); t.send({ type: 'bend' }); t.send({ type: 'look', direction: 'down' }); t.simulation.advance(10);
    expect(t.frame().phone).toEqual(fixed);
  });
  it('exposes stable anchors and inventory hand slots independently of model choice', () => {
    const t = setup(); for (const action of FIND_WRENCH) t.send(action); t.simulation.advance(12);
    expect(t.frame().character.hands).toEqual({ left: 'phone', right: 'wrench' });
    expect(t.frame().effects.openToolboxes).toEqual(['red_toolbox', 'blue_toolbox', 'green_toolbox']);
    expect(t.frame().anchors.pipe_joint).toEqual([-1.3, 0.45, 4.6]);
    const snapshot = t.simulation.readState(); getSceneFrame(snapshot); expect(t.simulation.readState()).toEqual(snapshot);
  });
  it('freezes animation time in pause and switches to a terminal cue on success', () => {
    const t = setup(); for (const action of PRESETS.wrench.actions) t.send(action); t.simulation.advance(0.3);
    t.controller.pause(); const paused = t.frame(); t.simulation.advance(20);
    expect(t.frame()).toEqual(paused); expect(paused.character.animation.playing).toBe(false);
    t.controller.resume(); t.simulation.advance(40); expect(t.frame().character.animation.name).toBe('Relief');
  });
});
