import { describe, expect, it } from 'vitest';
import { createGame, Simulation } from './controller';
import { TUNING } from './config';
import { FIND_WRENCH, go, grab, open, PRESETS, runPreset } from './presets';
import type { Action, ActionRequest, GameEvent, Result } from './types';

function setup(seed = 7) {
  const { controller, simulation: sim } = createGame(seed);
  const events: GameEvent[] = [];
  controller.subscribe(event => events.push(event));
  controller.start();
  const send = (action: Action, unresolved?: string[]) => controller.submitAction({ runId: controller.getObservation().runId, action, unresolved });
  // Advance until Grandma is idle (at most 40 s) so chained steps do not run into the one-minute flood.
  const run = (...actions: Action[]) => { actions.forEach(a => send(a)); for (let i = 0; i < 800 && (sim.readState().active || sim.readState().queue.length); i++) sim.advance(0.05); };
  const results = () => events.filter((e): e is Extract<GameEvent, { type: 'action_result' }> => e.type === 'action_result').map(e => e.result);
  const last = (): Result => results().at(-1)!;
  return { sim, controller, events, send, run, results, last };
}

describe('public-controller end-to-end solutions', () => {
  for (const preset of ['wrench']) it(`wins via ${preset} using only structured actions`, () => {
    const t = setup();
    expect(runPreset(t.controller, preset).every(r => r.accepted)).toBe(true);
    t.sim.advance(90);
    expect(t.controller.getObservation().stage).toBe('won');
    expect(t.sim.readState().leakRate).toBe(0);
    expect(t.results().every(r => r.status === 'completed')).toBe(true);
    expect(t.events.filter(e => e.type === 'terminal')).toHaveLength(1);
    const elapsed = t.sim.readState().elapsed;
    t.sim.advance(100);
    expect(t.sim.readState().elapsed).toBe(elapsed);
  });
  it('floods at two minutes, not before, without intervention', () => {
    const t = setup(); t.sim.advance(119.9);
    expect(t.controller.getObservation().stage).toBe('running');
    t.sim.advance(0.1);
    expect(t.controller.getObservation().stage).toBe('lost');
    expect(t.sim.readState().water).toBe(TUNING.floodThreshold);
  });
  it('towels and bucket are bounded, cannot be repeatedly collected, and add 30 seconds total', () => {
    const t = setup(); runPreset(t.controller, 'mitigation'); t.sim.advance(30);
    expect(t.results().every(r => r.status === 'completed')).toBe(true);
    expect(t.sim.readState().towelUsed).toBe(true);
    expect(t.sim.readState().bucketUsed).toBe(true);
    t.sim.advance(149.9 - t.sim.readState().elapsed);
    expect(t.sim.readState().stage).toBe('running');
    t.sim.advance(0.1);
    expect(t.sim.readState().stage).toBe('lost');
    expect(t.sim.readState().items.bucket.location).toBe('used');
    expect(t.sim.readState().items.towels.location).toBe('used');
  });
  it('wrong explicit rotations worsen leakage and shorten the available time', () => {
    const t = setup(); runPreset(t.controller, 'wrong_way'); t.sim.advance(30);
    expect(t.last().code).toBe('LEAK_WORSENED');
    expect(t.sim.readState().leakRate).toBeCloseTo(TUNING.initialLeakPerSecond * TUNING.wrongRotationMultiplier);
    t.sim.advance(60); expect(t.sim.readState().stage).toBe('lost');
  });
});

describe('prerequisites never perform missing steps', () => {
  for (const [preset, code] of Object.entries({ missing_tool: 'MISSING_TOOL', wrong_tool: 'MISSING_TOOL', posture: 'WRONG_POSTURE', reach: 'OUT_OF_REACH', hands: 'HANDS_FULL', clarification: 'CLARIFICATION_NEEDED' })) it(`reports ${code} via ${preset}`, () => {
    const t = setup(); runPreset(t.controller, preset); t.sim.advance(30);
    expect(t.last().code).toBe(code); expect(t.sim.readState().stage).toBe('running');
    expect(t.sim.readState().leakRate).toBe(TUNING.initialLeakPerSecond);
  });
  it('keeps tools hidden until their toolbox is opened', () => {
    const t = setup();
    expect(JSON.stringify(t.controller.getObservation())).not.toContain('wrench');
    t.run(go('blue_toolbox'), grab('wrench'));
    expect(t.last().code).toBe('NOT_FOUND');
    const box = (Object.entries(t.sim.readState().toolboxes).find(([, b]) => b.tool === 'wrench')!)[0] as 'red_toolbox';
    t.run(open(box));
    expect(t.last().message).toContain('wrench');
    expect(t.controller.getObservation().surroundings.some(o => o.id === 'wrench')).toBe(true);
    t.run(open(box)); expect(t.last().code).toBe('ALREADY_DONE');
    t.run(grab('wrench')); expect(t.sim.readState().grandma.held).toEqual(['wrench']);
  });
  it('deals the tools differently across seeds but identically for one seed', () => {
    const deal = (seed: number) => Object.values(setup(seed).sim.readState().toolboxes).map(b => b.tool).join();
    expect(deal(7)).toBe(deal(7));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(deal)).size).toBeGreaterThan(1);
  });
  it('requires standing to walk and bending for a floor bucket', () => {
    const t = setup(); t.run(go('bucket'), grab('bucket'));
    expect(t.last().code).toBe('WRONG_POSTURE');
    t.run({ type: 'bend' }, go('dry_spot')); expect(t.last().code).toBe('WRONG_POSTURE');
  });
  it('rejects walking through room boundaries', () => {
    const t = setup(); const before = t.sim.readState().grandma.position;
    t.run({ type: 'move', direction: 'backward', meters: 3 });
    expect(t.last().code).toBe('BLOCKED'); expect(t.sim.readState().grandma.position).toEqual(before);
  });
  it('rejects blocked paths through the tool table and toilet', () => {
    const t = setup(); t.run({ type: 'move', direction: 'left', meters: 2 }, { type: 'move', direction: 'forward', meters: 3.7 });
    expect(t.last().code).toBe('BLOCKED');
  });
});

describe('interpretation belongs to the simulation, without an autonomous solver', () => {
  it('rejects broad goals and malformed or non-finite runtime requests', () => {
    const t = setup();
    for (const action of [{ type: 'fix', target: 'pipe' }, { type: 'wait', seconds: NaN }, { type: 'move', direction: 'sideways', meters: 2 }, { type: 'grab', target: { id: 'other' } }, { type: 'rotate', target: { id: 'pipe_joint' }, direction: 'left' }, null]) {
      expect(t.controller.submitAction({ runId: t.controller.getObservation().runId, action } as ActionRequest).code).toBe('INVALID_REQUEST');
    }
    expect(t.controller.getObservation().queuedActions).toBe(0);
  });
  it('unknown descriptions and unresolved direction ask for clarification', () => {
    const t = setup(); t.run({ type: 'grab', target: { description: 'that thing' } });
    expect(t.last().status).toBe('clarification_needed');
    t.send({ type: 'rotate', target: { id: 'pipe_joint' }, direction: 'clockwise' }, ['direction']); t.sim.advance(1);
    expect(t.last().code).toBe('CLARIFICATION_NEEDED');
  });
  it('explicit qualifiers disambiguate and contradictory qualifiers ask', () => {
    const t = setup(); t.run(go('blue_toolbox'), { type: 'open', target: { description: 'toolbox', qualifiers: { color: 'red' } } });
    expect(t.last().code).toBe('OK'); expect(t.sim.readState().toolboxes.red_toolbox.open).toBe(true);
    const t2 = setup(); t2.run({ type: 'grab', target: { id: 'wrench', qualifiers: { color: 'red' } } });
    expect(t2.last().code).toBe('CLARIFICATION_NEEDED');
  });
  it('seeded ambiguous targets produce a plausible alternate for some seeds and ask for others, reproducibly', () => {
    const trial = (seed: number) => {
      const t = setup(seed); t.run(go('blue_toolbox'));
      t.run({ type: 'open', target: { candidates: ['red_toolbox', 'blue_toolbox', 'green_toolbox'] } });
      return t;
    };
    const seeds = Array.from({ length: 30 }, (_, i) => i);
    const mistaken = seeds.filter(seed => trial(seed).events.some(e => e.type === 'misunderstanding'));
    expect(mistaken.length).toBeGreaterThan(0); expect(mistaken.length).toBeLessThan(seeds.length);
    const a = trial(mistaken[0]), b = trial(mistaken[0]);
    // The red box is nearest from the approach point, so a mistake never picks it.
    expect(a.last().targetId).not.toBe('red_toolbox'); expect(a.last().code).toBe('OK');
    expect(b.last().targetId).toBe(a.last().targetId);
    const asked = seeds.find(seed => !mistaken.includes(seed))!;
    expect(trial(asked).last().code).toBe('CLARIFICATION_NEEDED');
  });
  it('precise valid instructions are reliable at every stress band across seeds', () => {
    for (const elapsed of [0, 25, 41]) for (const seed of [1, 7, 22, 42, 99]) {
      const t = setup(seed); t.sim.advance(elapsed); t.run(...FIND_WRENCH, go('pipe_joint'), { type: 'bend' }, { type: 'rotate', target: { id: 'pipe_joint' }, direction: 'clockwise' });
      expect(t.sim.readState().stage).toBe('won');
      expect(t.events.some(e => e.type === 'misunderstanding')).toBe(false);
    }
  });
  it('uses 15/30/45 percent stress thresholds with reproducible increased mistakes', () => {
    const counts = [0, 50, 90].map(elapsed => {
      let mistakes = 0;
      for (let seed = 0; seed < 80; seed++) {
        const t = setup(seed); t.sim.advance(elapsed); t.run(go('blue_toolbox'));
        t.send({ type: 'open', target: { candidates: ['red_toolbox', 'blue_toolbox', 'green_toolbox'] } }); t.sim.advance(0.05);
        if (t.events.some(e => e.type === 'misunderstanding')) mistakes++;
      }
      return mistakes;
    });
    expect(counts[0]).toBeGreaterThan(0); expect(counts[1]).toBeGreaterThan(counts[0]); expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(TUNING.mistakes).toEqual({ low: 0.15, medium: 0.3, high: 0.45 });
  });
  it('does not leak hidden repairs, capacities, RNG or solution metadata in observations', () => {
    const t = setup(); const obs = JSON.stringify(t.controller.getObservation());
    for (const key of ['toolboxes', 'wrench', 'hammer', 'screwdriver', 'leakRate', 'seed', 'mistakes', 'capacity', 'solution', 'clockwise', 'TUNING']) expect(obs).not.toContain(key);
    expect('readState' in t.controller).toBe(false);
  });
});

describe('phone and reference frames', () => {
  it('starts on the front camera (switching to the rear camera is part of the challenge)', () => {
    const t = setup(); expect(t.controller.getObservation().phone.mode).toBe('selfie');
    t.run({ type: 'switch_camera', mode: 'rear' }); expect(t.controller.getObservation().phone.mode).toBe('rear');
  });
  it('defaults to Grandma forward, while selfie-camera forward is behind her', () => {
    const a = setup(); a.run({ type: 'move', direction: 'forward', meters: 0.3 }); expect(a.sim.readState().grandma.position.z).toBeCloseTo(1.2);
    const b = setup(); b.run({ type: 'switch_camera', mode: 'selfie' }, { type: 'move', direction: 'forward', meters: 0.3, frame: 'camera' }); expect(b.sim.readState().grandma.position.z).toBeCloseTo(0.6);
  });
  it('turning changes subsequent Grandma-relative movement', () => {
    const t = setup(); t.run({ type: 'turn', direction: 'left', degrees: 90 }, { type: 'move', direction: 'forward', meters: 1 });
    expect(t.sim.readState().grandma.position.x).toBeCloseTo(1); expect(t.sim.readState().grandma.position.z).toBeCloseTo(0.9);
  });
  it('placed phone stays fixed as Grandma moves and requires reach to retrieve', () => {
    const t = setup(); t.run(go('dry_spot'), { type: 'place_phone', target: { id: 'dry_spot' } });
    const fixedYaw = t.sim.readState().phone.fixedYaw;
    t.run(go('pipe_joint'), { type: 'retrieve_phone' }); expect(t.last().code).toBe('OUT_OF_REACH');
    expect(t.sim.readState().phone.fixedYaw).toBe(fixedYaw); expect(t.sim.readState().phone.placement).toBe('dry_spot');
    t.run({ type: 'look', direction: 'left', frame: 'camera' }); expect(t.last().code).toBe('PHONE_NOT_HELD');
    t.run(go('dry_spot'), { type: 'retrieve_phone' }); expect(t.sim.readState().phone.placement).toBe('hand');
  });
  it('cannot retrieve a phone with both hands occupied', () => {
    const t = setup(); t.run(go('dry_spot'), { type: 'place_phone', target: { id: 'dry_spot' } }, ...FIND_WRENCH, grab('hammer'), go('dry_spot'), { type: 'retrieve_phone' });
    expect(t.sim.readState().grandma.held).toEqual(['wrench', 'hammer']);
    expect(t.last().code).toBe('HANDS_FULL');
  });
});

describe('queue, lifecycle and ownership', () => {
  it('does not execute before start; paused sessions reject new actions and freeze water/work', () => {
    const sim = new Simulation(); expect(sim.submitAction({ runId: sim.getObservation().runId, action: { type: 'wait', seconds: 1 } }).code).toBe('NOT_RUNNING');
    sim.advance(60); expect(sim.readState().water).toBe(0);
    const t = setup(); t.send({ type: 'wait', seconds: 10 }); t.sim.advance(2); t.controller.pause(); const s = t.sim.readState();
    t.sim.advance(100); expect(t.sim.readState()).toEqual(s); expect(t.send({ type: 'stand' }).code).toBe('NOT_RUNNING');
    t.controller.resume(); t.sim.advance(8); expect(t.last().status).toBe('completed');
  });
  it('executes a compound instruction sequentially, with no early success', () => {
    const t = setup(); FIND_WRENCH.forEach(a => t.send(a));
    t.sim.advance(0.1); expect(t.sim.readState().grandma.held).toEqual([]);
    expect(t.controller.getObservation().queuedActions).toBe(FIND_WRENCH.length - 1);
    t.sim.advance(12); expect(t.sim.readState().grandma.held).toEqual(['wrench']);
    expect(t.results().map(r => r.code)).toEqual(FIND_WRENCH.map(() => 'OK'));
  });
  it('cancels active repair before its atomic commit and removes queued work', () => {
    const t = setup(); t.run(...FIND_WRENCH, go('pipe_joint'), { type: 'bend' });
    t.send({ type: 'rotate', target: { id: 'pipe_joint' }, direction: 'clockwise' }); t.send({ type: 'wait', seconds: 10 });
    t.sim.advance(2); t.controller.cancelActions(); t.sim.advance(10);
    expect(t.sim.readState().stage).toBe('running'); expect(t.sim.readState().leakRate).toBe(TUNING.initialLeakPerSecond);
    expect(t.results().filter(r => r.status === 'cancelled')).toHaveLength(2);
  });
  it('cancels walking at its current location', () => {
    const t = setup(); t.send(go('pipe_joint')); t.sim.advance(1);
    const p = t.sim.readState().grandma.position; t.controller.cancelActions(); t.sim.advance(5);
    expect(t.sim.readState().grandma.position).toEqual(p); expect(p).not.toEqual({ x: 0, z: 0.9 });
  });
  it('reset cancels old work, resets everything, and rejects delayed old requests', () => {
    const t = setup(); const old = t.controller.getObservation().runId; t.send(go('blue_toolbox')); t.sim.advance(0.1);
    t.controller.reset({ seed: 99 }); t.controller.start();
    expect(t.controller.submitAction({ runId: old, action: { type: 'stand' } }).code).toBe('STALE_RUN');
    const s = t.sim.readState(); expect(s.seed).toBe(99); expect(s.water).toBe(0); expect(s.active).toBeNull(); expect(s.queue).toHaveLength(0);
    expect(s.phone.mode).toBe('selfie'); expect(s.grandma.held).toEqual([]); expect(s.items.wrench.location).toBe('toolbox'); expect(Object.values(s.toolboxes).every(b => !b.open)).toBe(true);
    expect(t.results().some(r => r.runId === old && r.code === 'CANCELLED')).toBe(true);
  });
  it('mutating a request or observation cannot change queued work or simulation', () => {
    const t = setup(); const action: Action = { type: 'wait', seconds: 3 }; t.send(action); action.seconds = 500;
    const o = t.controller.getObservation(); o.grandma.position.z = 999; t.sim.advance(4);
    expect(t.last().status).toBe('completed'); expect(t.sim.readState().grandma.position.z).toBe(0.9);
  });
  it('subscriber mutations occur after complete state changes and unsubscribe works', () => {
    const t = setup(); let hits = 0;
    const unsub = t.controller.subscribe(e => { if (e.type === 'action_result' && e.result.status === 'completed') { hits++; t.controller.reset(); } });
    t.run({ type: 'wait', seconds: 1 }); expect(t.controller.getObservation().stage).toBe('ready');
    unsub(); t.controller.start(); t.run({ type: 'wait', seconds: 1 }); expect(hits).toBe(1);
  });
  it('flood cancels work and emits only one terminal event', () => {
    const t = setup(); t.send({ type: 'wait', seconds: 500 }); t.sim.advance(600); t.sim.advance(30);
    expect(t.events.filter(e => e.type === 'terminal')).toHaveLength(1);
    expect(t.last().code).toBe('CANCELLED'); expect(t.send({ type: 'stand' }).code).toBe('NOT_RUNNING');
  });
  it('has stable results across clock step sizes', () => {
    const a = setup(), b = setup(); runPreset(a.controller, 'wrench'); runPreset(b.controller, 'wrench');
    a.sim.advance(90); for (let i = 0; i < 1800; i++) b.sim.advance(0.05);
    expect(a.sim.readState().water).toBeCloseTo(b.sim.readState().water, 5);
    expect(a.sim.readState().stage).toBe(b.sim.readState().stage);
  });
  it('all preset requests pass runtime schema checks', () => {
    const t = setup(); for (const key of Object.keys(PRESETS)) expect(runPreset(t.controller, key).every(r => r.accepted)).toBe(true);
  });
  it('clock subdivisions do not change repair timing, water, or outcomes', () => {
    const a = setup(), b = setup(), c = setup();
    for (const t of [a, b, c]) runPreset(t.controller, 'wrench');
    a.sim.advance(90);
    for (let i = 0; i < 5400; i++) b.sim.advance(1 / 60);
    for (let i = 0; i < 900; i++) { c.sim.advance(0.017); c.sim.advance(0.083); }
    for (const other of [b, c]) {
      expect(other.sim.readState().stage).toBe('won');
      expect(other.sim.readState().elapsed).toBeCloseTo(a.sim.readState().elapsed, 8);
      expect(other.sim.readState().water).toBeCloseTo(a.sim.readState().water, 8);
    }
  });
  it('a result listener can cancel the next queued action even during a large clock advance', () => {
    const t = setup();
    t.controller.subscribe(event => { if (event.type === 'action_result' && event.result.status === 'completed') t.controller.cancelActions(); });
    t.send({ type: 'wait', seconds: 1 }); t.send({ type: 'move', direction: 'forward', meters: 1 });
    t.sim.advance(10);
    expect(t.sim.readState().grandma.position.z).toBe(0.9);
    expect(t.results().map(r => r.code)).toEqual(['OK', 'CANCELLED']);
  });
});
