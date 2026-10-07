import type { ComponentType } from 'react';
import Bathroom from './Bathroom';
import Grandma from './Grandma';
import type { ItemId } from '../game/types';
import type { SceneFrame } from '../view/presentation';

export type SceneVisuals = {
  /** Local origin at feet, facing +Z. Outer root transform is applied by the game. */
  Grandma?: ComponentType<{ frame: SceneFrame }>;
  /** Room and fixed fixtures, including mounted phone/pipe repair overlays. */
  Environment?: ComponentType<{ frame: SceneFrame }>;
  /** Item-local visual, used consistently on shelves, in hands and when deployed. */
  Tool?: ComponentType<{ id: ItemId }>;
};

/** Jeff: import your visual components here. Empty slots retain working placeholders. */
export const SCENE_VISUALS: SceneVisuals = { Environment: Bathroom, Grandma };
