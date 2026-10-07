import { describe, expect, it } from 'vitest';
import { createGame } from './controller';
import { createCommandSession, type CommandStep } from './command-session';
import { ACTION_REQUEST_SCHEMA, isActionRequest } from './action-contract';
import { PRESETS } from './presets';

function setup() {
  const { controller, simulation } = createGame(7);
  const session = createCommandSession(controller);
  controller.start();
  return { controller, simulation, session };
}
const wait: CommandStep = { action: { type: 'wait', seconds: 1 } };

describe('Yao’s command-session integration', () => {
  for (const key of ['wrench']) it(`runs the ${key} solution one result at a time`, async () => {
    const t = setup(); const turn = t.session.beginTurn();
    const pending = t.session.submit(turn.token, PRESETS[key].actions.map(action => ({ action })));
    expect(t.controller.getObservation().queuedActions).toBe(1);
    t.simulation.advance(90);
    const outcome = await pending;
    expect(outcome.status).toBe('completed'); expect(outcome.skipped).toBe(0);
    expect(outcome.results).toHaveLength(PRESETS[key].actions.length);
    expect(outcome.stage).toBe('won'); expect(turn.signal.aborted).toBe(true);
    t.session.dispose();
  });
  it('does not execute later steps after a failed prerequisite', async () => {
    const t = setup(); const turn = t.session.beginTurn();
    const pending = t.session.submit(turn.token, [{ action: { type: 'grab', target: { id: 'bucket' } } }, { action: { type: 'move', direction: 'forward', meters: 1 } }]);
    t.simulation.advance(10); const outcome = await pending;
    expect(outcome.status).toBe('stopped'); expect(outcome.code).toBe('OUT_OF_REACH'); expect(outcome.skipped).toBe(1);
    expect(t.simulation.readState().grandma.position.z).toBe(0.9);
  });
  it('stops on a clarification instead of continuing the compound request', async () => {
    const t = setup(); const turn = t.session.beginTurn();
    const pending = t.session.submit(turn.token, [{ action: { type: 'rotate', target: { id: 'pipe_joint' } } }, wait]);
    t.simulation.advance(2); expect((await pending).code).toBe('CLARIFICATION_NEEDED');
    expect(t.controller.getObservation().queuedActions).toBe(0);
  });
  it('stops after a worsened leak even though the rotation completed', async () => {
    const t = setup(); const turn = t.session.beginTurn();
    const pending = t.session.submit(turn.token, [...PRESETS.wrong_way.actions.map(action => ({ action })), wait]);
    t.simulation.advance(20); const outcome = await pending;
    expect(outcome.code).toBe('LEAK_WORSENED'); expect(outcome.status).toBe('stopped'); expect(outcome.skipped).toBe(1);
  });
  it('validates the entire instruction before executing any part', async () => {
    const t = setup(); const turn = t.session.beginTurn();
    const outcome = await t.session.submit(turn.token, [wait, { action: { type: 'teleport' } }] as unknown as CommandStep[]);
    expect(outcome.code).toBe('INVALID_REQUEST'); expect(t.controller.getObservation().queuedActions).toBe(0);
    expect((await t.session.submit(turn.token, [])).code).toBe('INVALID_REQUEST');
  });
  it('deduplicates repeated delivery of one AI turn', async () => {
    const t = setup(); const turn = t.session.beginTurn();
    const a = t.session.submit(turn.token, [wait]);
    const b = t.session.submit(turn.token, [wait]);
    expect(a).toBe(b); expect(t.controller.getObservation().queuedActions).toBe(1);
    t.simulation.advance(2); expect((await a).results).toHaveLength(1);
    expect(t.session.submit(turn.token, [wait])).toBe(a);
  });
  it('barge-in aborts AI work and rejects its late response in the same game run', async () => {
    const t = setup(); const old = t.session.beginTurn(); const next = t.session.beginTurn();
    expect(old.signal.aborted).toBe(true); expect(next.signal.aborted).toBe(false);
    expect((await t.session.submit(old.token, [wait])).code).toBe('STALE_TURN');
    expect(t.controller.getObservation().queuedActions).toBe(0);
  });
  it('barge-in cancels active work and skips unsent steps', async () => {
    const t = setup(); const old = t.session.beginTurn();
    const pending = t.session.submit(old.token, [{ action: { type: 'wait', seconds: 20 } }, wait]);
    t.simulation.advance(1); const next = t.session.beginTurn();
    expect((await pending).status).toBe('cancelled'); expect((await pending).skipped).toBe(1);
    expect(old.signal.aborted).toBe(true); expect(next.token.runId).toBe(old.token.runId);
    expect(t.controller.getObservation().currentAction).toBeNull();
  });
  it('reset invalidates a turn before the provider responds', async () => {
    const t = setup(); const turn = t.session.beginTurn(); t.controller.reset(); t.controller.start();
    expect(turn.signal.aborted).toBe(true);
    expect((await t.session.submit(turn.token, [wait])).code).toBe('STALE_RUN');
  });
  it('reset settles an active sequence without allowing old work into the new run', async () => {
    const t = setup(); const turn = t.session.beginTurn(); const pending = t.session.submit(turn.token, [wait, wait]);
    t.controller.reset(); t.controller.start(); t.simulation.advance(3);
    expect((await pending).status).toBe('cancelled'); expect(t.controller.getObservation().queuedActions).toBe(0);
  });
  it('pause freezes a submitted sequence and resume completes it', async () => {
    const t = setup(); const turn = t.session.beginTurn(); const pending = t.session.submit(turn.token, [wait, wait]);
    t.simulation.advance(0.5); t.controller.pause(); t.simulation.advance(100);
    expect(t.controller.getObservation().currentAction?.progress).toBeCloseTo(0.5);
    t.controller.resume(); t.simulation.advance(2); expect((await pending).results).toHaveLength(2);
  });
  it('rejects new submissions while paused and can retry the same turn after resume', async () => {
    const t = setup(); const turn = t.session.beginTurn(); t.controller.pause();
    expect((await t.session.submit(turn.token, [wait])).code).toBe('NOT_RUNNING');
    t.controller.resume(); const pending = t.session.submit(turn.token, [wait]); t.simulation.advance(2);
    expect((await pending).status).toBe('completed');
  });
  it('does not mix a voice sequence into separately queued developer work', async () => {
    const t = setup(); const turn = t.session.beginTurn();
    t.controller.submitAction({ runId: turn.token.runId, ...wait });
    expect((await t.session.submit(turn.token, [wait])).code).toBe('BUSY');
  });
  it('handles a synchronous cancellation in another action_queued subscriber', async () => {
    const t = setup(); const turn = t.session.beginTurn();
    t.controller.subscribe(event => { if (event.type === 'action_queued') t.controller.cancelActions(); });
    const result = await t.session.submit(turn.token, [wait, wait]);
    expect(result.status).toBe('cancelled'); expect(result.results[0].code).toBe('CANCELLED'); expect(result.skipped).toBe(1);
  });
  it('stops a sequence at a terminal win even if the transcript contains more instructions', async () => {
    const t = setup(); const turn = t.session.beginTurn();
    const pending = t.session.submit(turn.token, [...PRESETS.wrench.actions.map(action => ({ action })), wait]);
    t.simulation.advance(40); const outcome = await pending;
    expect(outcome.stage).toBe('won'); expect(outcome.code).toBe('TERMINAL'); expect(outcome.skipped).toBe(1);
  });
  it('flooding settles pending work and aborts pending provider requests', async () => {
    const t = setup(); const turn = t.session.beginTurn();
    const pending = t.session.submit(turn.token, [{ action: { type: 'wait', seconds: 500 } }, wait]);
    t.simulation.advance(320); expect((await pending).stage).toBe('lost'); expect(turn.signal.aborted).toBe(true);
  });
  it('disposing aborts the pending turn and prevents subsequent submissions', async () => {
    const t = setup(); const turn = t.session.beginTurn(); const pending = t.session.submit(turn.token, [wait]);
    t.session.dispose(); t.session.dispose();
    expect(turn.signal.aborted).toBe(true); expect((await pending).status).toBe('cancelled');
    expect((await t.session.submit(turn.token, [wait])).code).toBe('DISPOSED'); expect(() => t.session.beginTurn()).toThrow();
  });
});

describe('shared input contract', () => {
  it('exports a JSON-serializable schema and accepts every authored preset', () => {
    expect(JSON.parse(JSON.stringify(ACTION_REQUEST_SCHEMA)).$schema).toContain('2020-12');
    for (const preset of Object.values(PRESETS)) for (const action of preset.actions) expect(isActionRequest({ runId: 'current', action })).toBe(true);
  });
  it('does not silently discard unrecognized qualifiers or action fields', () => {
    expect(isActionRequest({ runId: 'x', action: { type: 'wait', seconds: 1, target: { id: 'pipe_joint' } } })).toBe(false);
    expect(isActionRequest({ runId: 'x', action: { type: 'grab', target: { id: 'hammer', qualifiers: { side: 'left' } } } })).toBe(false);
    expect(isActionRequest({ runId: 'x', action: { type: 'wait', seconds: Infinity } })).toBe(false);
  });
});
