import { OBJECTS, normalize, radians, TUNING } from '../game/config';
import type { WorldState } from '../game/controller';
import { lookAngles, turnYaw } from '../game/phone';
import type { ItemId, ObjectId } from '../game/types';

export type Point3 = [number, number, number];
export type AnimationName = 'Idle_Standing' | 'Idle_Bent' | 'Walk' | 'Look' | 'Turn' | 'Bend_Down' | 'Stand_Up' | 'Pick_Up' | 'Put_Down' | 'Phone_Place' | 'Phone_Retrieve' | 'Phone_Check' | 'Rotate_Valve' | 'Tighten_Joint' | 'Apply_Patch' | 'Secure_Clamp' | 'Relief' | 'Flooded';
export type SceneFrame = {
  runId: string;
  character: {
    position: Point3; yaw: number; bend: number;
    hands: { left: ItemId | 'phone' | null; right: ItemId | null };
    animation: { name: AnimationName; progress: number; duration: number; loop: boolean; playing: boolean; actionId: string | null; targetId: ObjectId | null };
  };
  phone: { position: Point3; target: Point3; yaw: number; mode: 'selfie' | 'rear'; placement: 'hand' | 'dry_spot' };
  anchors: Record<ObjectId, Point3>;
  effects: { waterHeight: number; waterRatio: number; leakRatio: number; patchApplied: boolean; bucketUsed: boolean; towelsUsed: boolean; bucketFill: number; towelSaturation: number };
};
const blendAngle = (from: number, to: number, progress: number) => from + normalize(to - from) * progress;

/** Jeff's render contract. Pure and testable: visuals never mutate gameplay. */
export function getSceneFrame(world: WorldState): SceneFrame {
  const { grandma: g, phone, active } = world;
  const action = active?.request.action;
  const progress = active ? active.elapsed / active.duration : 0;
  const initialBend = g.posture === 'bent' ? 1 : 0;
  const bend = action?.type === 'bend' ? initialBend + (1 - initialBend) * progress : action?.type === 'stand' ? initialBend * (1 - progress) : initialBend;
  let bodyYaw = g.yaw;
  if (action?.type === 'turn') {
    const delta = normalize(turnYaw(world, action) - g.yaw);
    bodyYaw += (Math.abs(delta) === 180 ? (action.direction === 'left' ? 180 : -180) : delta) * progress;
  }
  const look = action?.type === 'look' ? lookAngles(world, action) : action?.type === 'turn' ? { yaw: 0, pitch: phone.pitch } : phone;
  const lookYaw = blendAngle(phone.yaw, look.yaw, progress);
  const pitch = phone.pitch + (look.pitch - phone.pitch) * progress;
  const yaw = normalize((phone.placement === 'hand' ? bodyYaw + lookYaw : phone.fixedYaw) + (phone.mode === 'selfie' ? 180 : 0));
  const position: Point3 = phone.placement === 'hand'
    ? [g.position.x + Math.sin(radians(bodyYaw)) * 0.55, 1.3 - bend * 0.45, g.position.z + Math.cos(radians(bodyYaw)) * 0.55]
    : [OBJECTS.dry_spot.position.x, 1.32, OBJECTS.dry_spot.position.z];
  // Opposite lenses share one physical phone pose, including pitch.
  const rearPitch = phone.placement === 'hand' ? pitch - 12 : -Math.atan(0.18) * 180 / Math.PI;
  const lensPitch = radians(phone.mode === 'selfie' ? -rearPitch : rearPitch);
  const target: Point3 = [position[0] + Math.sin(radians(yaw)) * Math.cos(lensPitch), position[1] + Math.sin(lensPitch), position[2] + Math.cos(radians(yaw)) * Math.cos(lensPitch)];
  let name: AnimationName = g.posture === 'bent' ? 'Idle_Bent' : 'Idle_Standing';
  if (world.stage === 'won') name = 'Relief';
  else if (world.stage === 'lost') name = 'Flooded';
  else if (action) {
    switch (action.type) {
      case 'move': case 'move_to': name = 'Walk'; break;
      case 'look': name = 'Look'; break;
      case 'turn': name = 'Turn'; break;
      case 'bend': name = 'Bend_Down'; break;
      case 'stand': name = 'Stand_Up'; break;
      case 'grab': name = 'Pick_Up'; break;
      case 'place': name = 'Put_Down'; break;
      case 'place_phone': name = 'Phone_Place'; break;
      case 'retrieve_phone': name = 'Phone_Retrieve'; break;
      case 'switch_camera': name = 'Phone_Check'; break;
      case 'rotate': name = active?.target === 'supply_valve' ? 'Rotate_Valve' : 'Tighten_Joint'; break;
      case 'apply_patch': name = 'Apply_Patch'; break;
      case 'secure_patch': name = 'Secure_Clamp'; break;
    }
  }
  const ratio = world.water / TUNING.floodThreshold;
  return {
    runId: world.runId,
    character: {
      position: [g.position.x, 0, g.position.z], yaw: bodyYaw, bend,
      hands: { left: phone.placement === 'hand' ? 'phone' : g.held[1] ?? null, right: g.held[0] ?? null },
      animation: { name, progress, duration: active?.duration ?? 0, loop: name === 'Walk' || name.startsWith('Idle_'), playing: world.stage === 'running', actionId: active?.id ?? null, targetId: active?.target ?? null },
    },
    phone: { position, target, yaw, mode: phone.mode, placement: phone.placement },
    anchors: Object.fromEntries(Object.values(OBJECTS).map(o => {
      const item = world.items[o.id as ItemId];
      return [o.id, item ? [item.position.x, item.height, item.position.z] : [o.position.x, o.height, o.position.z]];
    })) as Record<ObjectId, Point3>,
    effects: { waterHeight: 0.015 + ratio * 0.3, waterRatio: ratio, leakRatio: world.leakRate / TUNING.initialLeakPerSecond, patchApplied: world.patchApplied, bucketUsed: world.bucketUsed, towelsUsed: world.towelUsed, bucketFill: world.bucketUsed ? 1 - world.bucketRemaining / TUNING.bucketCapacity : 0, towelSaturation: world.towelUsed ? 1 - world.towelRemaining / TUNING.towelCapacity : 0 },
  };
}
