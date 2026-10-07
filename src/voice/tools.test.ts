import { beforeEach, describe as group, expect, it } from 'vitest';
import { RunContext } from '@openai/agents';
import { gameController, simulation } from '../game/session';
import { grandmaTools } from './tools';

const byName = Object.fromEntries(grandmaTools.map(t => [t.name, t]));

/** Invoke a tool as the Realtime session would, while simulated time runs. */
async function call(name: string, args: object = {}) {
  const pending = byName[name].invoke(new RunContext(), JSON.stringify(args));
  let done = false;
  void pending.then(() => { done = true; });
  for (let i = 0; i < 2000 && !done; i++) { simulation.advance(0.05); await Promise.resolve(); await Promise.resolve(); }
  return JSON.parse(String(await pending));
}

group('Grandma voice tools', () => {
  beforeEach(() => { gameController.reset({ seed: 7 }); gameController.start(); });

  it('solves the valve route through tools', async () => {
    expect((await call('switch_camera', { camera: 'back' })).status).toBe('completed');
    expect((await call('walk_to', { thing: 'the red valve', color: null })).status).toBe('completed');
    const twist = await call('twist', { thing: 'valve', color: 'red', direction: 'clockwise' });
    expect(twist.status).toBe('completed');
    expect(gameController.getObservation().stage).toBe('won');
  });

  it('asks which way when no direction was given', async () => {
    await call('walk_to', { thing: 'valve', color: null });
    const twist = await call('twist', { thing: 'valve', color: null, direction: null });
    expect(twist.status).toBe('clarification_needed');
  });

  it('reports prerequisite failures for Grandma to explain', async () => {
    const grab = await call('pick_up', { thing: 'bucket', color: null });
    expect(grab.status).toBe('failed');
    expect(grab.now.sees).toBeInstanceOf(Array);
  });

  it('hides object ids from the model', async () => {
    const seen = await call('look_around');
    expect(JSON.stringify(seen)).not.toMatch(/supply_valve|pipe_joint|dry_spot/);
  });

  it('rejects actions when the call is paused', async () => {
    gameController.pause();
    expect((await call('bend_down')).status).toBe('not_running');
  });
});
