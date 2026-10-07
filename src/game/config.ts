import type { Action, ObjectId, Vec2 } from './types';
export const TUNING = {
  floodThreshold: 100, initialLeakPerSecond: 100 / 300, wrongRotationMultiplier: 1.65, maxLeakMultiplier: 4,
  towelCapacity: 8, bucketCapacity: 12, reach: 1.3, moveSpeed: 0.85, approachDistance: 0.95,
  queueLimit: 64, tickSeconds: 0.05, stressMedium: 0.33, stressHigh: 0.67,
  mistakes: { low: 0.15, medium: 0.30, high: 0.45 },
  durations: { look: 0.5, turn: 0.7, move: 1, move_to: 1, switch_camera: 0.6, place_phone: 1.5, retrieve_phone: 1.5, bend: 1, stand: 1, grab: 1.5, place: 1.5, rotate: 4, apply_patch: 6, secure_patch: 5, wait: 1 } satisfies Record<Action['type'], number>,
  room: { minX: -2.3, maxX: 2.3, minZ: 0.45, maxZ: 4.65 },
  // Inflated by Grandma's footprint. Shared by collision checks and scene design.
  obstacles: [{ minX: 1.45, maxX: 2.65, minZ: 4.25, maxZ: 4.85 }],
} as const;
export type SceneObject = { id: ObjectId; name: string; color: string; position: Vec2; height: number; portable: boolean; aliases: string[] };
export const OBJECTS: Record<ObjectId, SceneObject> = {
  supply_valve: { id: 'supply_valve', name: 'Red supply valve', color: 'red', position: { x: -0.65, z: 4.6 }, height: 0.95, portable: false, aliases: ['valve', 'supply valve', 'red valve', 'fitting'] },
  pipe_joint: { id: 'pipe_joint', name: 'Leaking brass joint', color: 'brass', position: { x: -1.3, z: 4.6 }, height: 0.45, portable: false, aliases: ['pipe', 'joint', 'pipe joint', 'fitting'] },
  wrench: { id: 'wrench', name: 'Steel wrench', color: 'silver', position: { x: -0.5, z: 2.5 }, height: 0.85, portable: true, aliases: ['wrench', 'tool'] },
  patch: { id: 'patch', name: 'Rubber patch', color: 'black', position: { x: 0.25, z: 2.5 }, height: 0.85, portable: true, aliases: ['patch', 'rubber patch'] },
  clamp: { id: 'clamp', name: 'Metal clamp', color: 'silver', position: { x: 0.95, z: 2.5 }, height: 0.85, portable: true, aliases: ['clamp', 'tool'] },
  towels: { id: 'towels', name: 'Folded towels', color: 'peach', position: { x: -2.15, z: 1.65 }, height: 0.8, portable: true, aliases: ['towel', 'towels'] },
  bucket: { id: 'bucket', name: 'Blue bucket', color: 'blue', position: { x: -2.1, z: 3.1 }, height: 0.25, portable: true, aliases: ['bucket', 'blue bucket'] },
  dry_spot: { id: 'dry_spot', name: 'Dry phone shelf', color: 'green', position: { x: 1.8, z: 3.5 }, height: 1.15, portable: false, aliases: ['shelf', 'dry spot', 'phone shelf'] },
  puddle: { id: 'puddle', name: 'Water below the pipe', color: 'blue', position: { x: -1.3, z: 4 }, height: 0, portable: false, aliases: ['water', 'puddle', 'floor'] },
};
export const ids = Object.keys(OBJECTS) as ObjectId[];
export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
export const radians = (degrees: number) => degrees * Math.PI / 180;
export const normalize = (degrees: number) => ((degrees + 180) % 360 + 360) % 360 - 180;
