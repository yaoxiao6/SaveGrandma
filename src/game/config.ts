import type { Action, ObjectId, ToolboxId, ToolId, Vec2 } from './types';
export const TUNING = {
  // One minute from the first drip to Grandma drowning.
  floodThreshold: 100, initialLeakPerSecond: 100 / 120, wrongRotationMultiplier: 1.65, maxLeakMultiplier: 4,
  towelCapacity: 10, bucketCapacity: 15, reach: 1.3, moveSpeed: 0.85, approachDistance: 0.95,
  queueLimit: 64, tickSeconds: 0.05, stressMedium: 0.33, stressHigh: 0.67,
  mistakes: { low: 0.15, medium: 0.30, high: 0.45 },
  durations: { look: 0.5, turn: 0.7, move: 1, move_to: 1, switch_camera: 0.6, place_phone: 1.5, retrieve_phone: 1.5, bend: 1, stand: 1, grab: 1.5, place: 1.5, rotate: 4, open: 1.2, wait: 1 } satisfies Record<Action['type'], number>,
  room: { minX: -2.3, maxX: 2.3, minZ: 0.45, maxZ: 4.65 },
  // Inflated by Grandma's footprint. Shared by collision checks and scene design.
  obstacles: [{ minX: 1.45, maxX: 2.65, minZ: 4.25, maxZ: 4.85 }, { minX: 1.35, maxX: 2.65, minZ: 1.55, maxZ: 3.25 }],
} as const;
export type SceneObject = { id: ObjectId; name: string; color: string; position: Vec2; height: number; portable: boolean; aliases: string[] };
export const TOOLBOXES: ToolboxId[] = ['red_toolbox', 'blue_toolbox', 'green_toolbox'];
export const TOOLS: ToolId[] = ['wrench', 'screwdriver', 'hammer'];
/** The table on Grandma's left (+X) that holds the three toolboxes. Tools start inside a box, so their position is assigned at run start. */
const TABLE_X = 1.9;
export const OBJECTS: Record<ObjectId, SceneObject> = {
  pipe_joint: { id: 'pipe_joint', name: 'Red leaking pipe', color: 'red', position: { x: -1.3, z: 4.6 }, height: 0.45, portable: false, aliases: ['pipe', 'red pipe', 'leaking pipe', 'leak', 'joint', 'pipe joint', 'fitting'] },
  red_toolbox: { id: 'red_toolbox', name: 'Red toolbox', color: 'red', position: { x: TABLE_X, z: 2.0 }, height: 0.85, portable: false, aliases: ['toolbox', 'toolboxes', 'tool box', 'box', 'red toolbox', 'red box'] },
  blue_toolbox: { id: 'blue_toolbox', name: 'Blue toolbox', color: 'blue', position: { x: TABLE_X, z: 2.4 }, height: 0.85, portable: false, aliases: ['toolbox', 'toolboxes', 'tool box', 'box', 'blue toolbox', 'blue box'] },
  green_toolbox: { id: 'green_toolbox', name: 'Green toolbox', color: 'green', position: { x: TABLE_X, z: 2.8 }, height: 0.85, portable: false, aliases: ['toolbox', 'toolboxes', 'tool box', 'box', 'green toolbox', 'green box'] },
  wrench: { id: 'wrench', name: 'Steel wrench', color: 'silver', position: { x: TABLE_X, z: 2.4 }, height: 0.85, portable: true, aliases: ['wrench', 'spanner', 'tool'] },
  screwdriver: { id: 'screwdriver', name: 'Yellow screwdriver', color: 'yellow', position: { x: TABLE_X, z: 2.4 }, height: 0.85, portable: true, aliases: ['screwdriver', 'tool'] },
  hammer: { id: 'hammer', name: 'Wooden hammer', color: 'brown', position: { x: TABLE_X, z: 2.4 }, height: 0.85, portable: true, aliases: ['hammer', 'tool'] },
  towels: { id: 'towels', name: 'Folded towels', color: 'peach', position: { x: -2.15, z: 1.65 }, height: 0.8, portable: true, aliases: ['towel', 'towels'] },
  bucket: { id: 'bucket', name: 'Blue bucket', color: 'blue', position: { x: -2.1, z: 3.1 }, height: 0.25, portable: true, aliases: ['bucket', 'blue bucket'] },
  dry_spot: { id: 'dry_spot', name: 'Dry phone shelf', color: 'green', position: { x: 1.8, z: 3.5 }, height: 1.15, portable: false, aliases: ['shelf', 'dry spot', 'phone shelf'] },
  puddle: { id: 'puddle', name: 'Water below the pipe', color: 'blue', position: { x: -1.3, z: 4 }, height: 0, portable: false, aliases: ['water', 'puddle', 'floor'] },
};
export const ids = Object.keys(OBJECTS) as ObjectId[];
export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
export const radians = (degrees: number) => degrees * Math.PI / 180;
export const normalize = (degrees: number) => ((degrees + 180) % 360 + 360) % 360 - 180;
