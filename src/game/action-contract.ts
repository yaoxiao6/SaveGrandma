import type { Action, ActionRequest } from './types';

type Schema = {
  type?: 'object' | 'array' | 'string' | 'number';
  const?: string;
  enum?: readonly string[];
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: false;
  items?: Schema;
  oneOf?: readonly Schema[];
  minimum?: number; maximum?: number;
  minLength?: number; maxLength?: number;
  maxItems?: number;
};
const text = (maxLength = 200): Schema => ({ type: 'string', maxLength });
const choice = (...values: string[]): Schema => ({ type: 'string', enum: values });
const object = (properties: Record<string, Schema>, required: string[]): Schema => ({ type: 'object', properties, required, additionalProperties: false });
const objectId = choice('supply_valve', 'pipe_joint', 'wrench', 'patch', 'clamp', 'towels', 'bucket', 'dry_spot', 'puddle');
const target = object({
  id: objectId,
  description: text(),
  candidates: { type: 'array', items: objectId, maxItems: 9 },
  qualifiers: object({ color: text(30) }, []),
}, []);
const direction = choice('forward', 'backward', 'left', 'right');
const frame = choice('grandma', 'camera');
const degrees: Schema = { type: 'number', minimum: 1, maximum: 180 };
const action = (type: Action['type'], properties: Record<string, Schema> = {}, required: string[] = []) => object({ type: { const: type }, ...properties }, ['type', ...required]);
const actions = {
  look: action('look', { direction: choice('forward', 'backward', 'left', 'right', 'up', 'down'), degrees, frame }, ['direction']),
  turn: action('turn', { direction: choice('left', 'right'), degrees, frame }, ['direction']),
  move: action('move', { direction, meters: { type: 'number', minimum: 0.1, maximum: 5 }, frame }, ['direction', 'meters']),
  move_to: action('move_to', { target }, ['target']),
  switch_camera: action('switch_camera', { mode: choice('selfie', 'rear') }, ['mode']),
  place_phone: action('place_phone', { target }, ['target']),
  retrieve_phone: action('retrieve_phone'),
  bend: action('bend'),
  stand: action('stand'),
  grab: action('grab', { target }, ['target']),
  place: action('place', { target, item: choice('wrench', 'patch', 'clamp', 'towels', 'bucket') }, ['target', 'item']),
  rotate: action('rotate', { target, direction: choice('clockwise', 'counterclockwise') }, ['target']),
  apply_patch: action('apply_patch', { target }, ['target']),
  secure_patch: action('secure_patch', { target }, ['target']),
  wait: action('wait', { seconds: { type: 'number', minimum: 0.1, maximum: 600 } }, ['seconds']),
} satisfies Record<Action['type'], Schema>;

function freeze<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

/** Provider-independent JSON Schema; contains input shape, never solution rules. */
export const ACTION_REQUEST_SCHEMA = freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...object({
    runId: { type: 'string', minLength: 1, maxLength: 100 },
    action: { oneOf: Object.values(actions) },
    unresolved: { type: 'array', items: text(100), maxItems: 8 },
  }, ['runId', 'action']),
});

function matches(value: unknown, schema: Schema): boolean {
  if (schema.oneOf) return schema.oneOf.filter(option => matches(value, option)).length === 1;
  if (schema.const !== undefined && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value as string)) return false;
  if (schema.type === 'string') return typeof value === 'string' && value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity);
  if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity);
  if (schema.type === 'array') return Array.isArray(value) && value.length <= (schema.maxItems ?? Infinity) && value.every(item => matches(item, schema.items!));
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const fields = value as Record<string, unknown>;
    if (schema.required?.some(key => !Object.hasOwn(fields, key) || fields[key] === undefined)) return false;
    return Object.keys(fields).every(key => Object.hasOwn(schema.properties!, key) && (fields[key] === undefined || matches(fields[key], schema.properties![key])));
  }
  return true;
}

/** The controller and command session use this same schema at runtime. */
export function isActionRequest(input: unknown): input is ActionRequest {
  return matches(input, ACTION_REQUEST_SCHEMA);
}
