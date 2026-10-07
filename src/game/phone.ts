import { normalize } from './config';
import type { WorldState } from './controller';
import type { Action } from './types';

/** Authoritative heading shared by movement and rendering. */
export function lensYaw(world: WorldState) {
  const { grandma, phone } = world;
  return normalize((phone.placement === 'dry_spot' ? phone.fixedYaw : grandma.yaw + phone.yaw) + (phone.mode === 'selfie' ? 180 : 0));
}
export function turnYaw(world: WorldState, action: Extract<Action, { type: 'turn' }>) {
  const base = action.frame === 'camera' ? lensYaw(world) : world.grandma.yaw;
  return normalize(base + (action.direction === 'left' ? 1 : -1) * (action.degrees ?? 90));
}
export function lookAngles(world: WorldState, action: Extract<Action, { type: 'look' }>) {
  const { grandma, phone } = world;
  const degrees = action.degrees ?? 35;
  if (action.direction === 'up' || action.direction === 'down') {
    const lensSign = action.frame === 'camera' && phone.mode === 'selfie' ? -1 : 1;
    return { yaw: phone.yaw, pitch: Math.max(-65, Math.min(65, phone.pitch + lensSign * (action.direction === 'up' ? degrees : -degrees))) };
  }
  const base = action.frame === 'camera' ? lensYaw(world) : grandma.yaw;
  const offset = { forward: 0, backward: 180, left: degrees, right: -degrees }[action.direction];
  return {
    yaw: normalize(base + offset - grandma.yaw - (action.frame === 'camera' && phone.mode === 'selfie' ? 180 : 0)),
    pitch: action.direction === 'forward' ? 0 : phone.pitch,
  };
}
