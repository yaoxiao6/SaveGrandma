import { isActionRequest } from './action-contract';
import type { Action, GameController, GameEvent, ReasonCode, Result, Stage } from './types';

export type CommandStep = { action: Action; unresolved?: string[] };
export type TurnToken = Readonly<{ runId: string; turnId: string }>;
export type CommandTurn = { token: TurnToken; signal: AbortSignal };
export type CommandOutcome = {
  runId: string; turnId: string;
  status: 'completed' | 'stopped' | 'cancelled' | 'rejected';
  code: ReasonCode | 'STALE_TURN' | 'BUSY' | 'DISPOSED';
  results: Result[]; skipped: number; stage: Stage;
};
type Work = {
  turn: CommandTurn; steps: CommandStep[]; results: Result[]; next: number;
  actionId?: string; submitting: boolean; earlyResults: Result[];
  promise: Promise<CommandOutcome>; resolve: (outcome: CommandOutcome) => void;
  settled: boolean;
};
let sessionSerial = 0;

/** Coordinates structured instructions only. Yao owns speech, interpretation and audio. */
export class CommandSession {
  private readonly sessionId = ++sessionSerial;
  private serial = 0;
  private turn?: CommandTurn;
  private abort?: AbortController;
  private work?: Work;
  private disposed = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly controller: GameController) {
    this.unsubscribe = controller.subscribe(event => this.onEvent(event));
  }

  /** Call at the start of speech, before async STT/LLM work. Supersedes old speech. */
  beginTurn(): CommandTurn {
    if (this.disposed) throw new Error('CommandSession is disposed. Create a new session.');
    this.interrupt();
    this.abort = new AbortController();
    this.turn = {
      token: Object.freeze({ runId: this.controller.getObservation().runId, turnId: `session-${this.sessionId}:turn-${++this.serial}` }),
      signal: this.abort.signal,
    };
    return this.turn;
  }

  /** Duplicate submissions for the same live turn return the original promise. */
  submit(token: TurnToken, steps: readonly CommandStep[]): Promise<CommandOutcome> {
    const reject = (code: CommandOutcome['code']) => Promise.resolve(this.outcome(token, 'rejected', code, [], Array.isArray(steps) ? steps.length : 0));
    if (this.disposed) return reject('DISPOSED');
    if (!token || token.runId !== this.controller.getObservation().runId) return reject('STALE_RUN');
    if (!this.turn || token.turnId !== this.turn.token.turnId || this.turn.signal.aborted) return reject('STALE_TURN');
    if (this.work?.turn.token.turnId === token.turnId) return this.work.promise;
    if (!Array.isArray(steps) || !steps.length || steps.length > 64 || !steps.every(step => {
      if (!step || typeof step !== 'object' || Object.keys(step).some(key => key !== 'action' && key !== 'unresolved')) return false;
      return isActionRequest({ runId: token.runId, ...step });
    })) return reject('INVALID_REQUEST');
    const observation = this.controller.getObservation();
    if (observation.stage !== 'running') return reject('NOT_RUNNING');
    if (observation.currentAction || observation.queuedActions) return reject('BUSY');

    let resolve!: Work['resolve'];
    const promise = new Promise<CommandOutcome>(done => { resolve = done; });
    this.work = { turn: this.turn, steps: structuredClone(steps) as CommandStep[], results: [], next: 0, submitting: false, earlyResults: [], promise, resolve, settled: false };
    this.next(this.work);
    return promise;
  }

  /** Use for barge-in, hang-up and adapter disconnect; also aborts pending AI work. */
  interrupt() {
    this.abort?.abort();
    this.turn = undefined;
    const work = this.work;
    // Game work is a single shared lane; an interruption intentionally clears it.
    this.controller.cancelActions();
    if (work && !work.settled) this.finish(work, 'cancelled', 'CANCELLED');
    if (this.work === work) this.work = undefined;
  }

  dispose() {
    if (this.disposed) return;
    this.interrupt(); this.unsubscribe(); this.disposed = true;
  }

  private outcome(token: TurnToken, status: CommandOutcome['status'], code: CommandOutcome['code'], results: Result[], skipped: number): CommandOutcome {
    return { runId: token?.runId ?? '', turnId: token?.turnId ?? '', status, code, results: structuredClone(results), skipped, stage: this.controller.getObservation().stage };
  }
  private finish(work: Work, status: CommandOutcome['status'], code: CommandOutcome['code']) {
    if (work.settled) return;
    work.settled = true;
    work.resolve(this.outcome(work.turn.token, status, code, work.results, work.steps.length - work.next));
  }
  private next(work: Work) {
    if (work.settled) return;
    if (work.next === work.steps.length) { this.finish(work, 'completed', 'OK'); return; }
    const observation = this.controller.getObservation();
    if (observation.stage === 'won' || observation.stage === 'lost') {
      this.finish(work, observation.stage === 'won' ? 'completed' : 'stopped', 'TERMINAL'); return;
    }
    const step = work.steps[work.next];
    work.submitting = true;
    const accepted = this.controller.submitAction({ runId: work.turn.token.runId, ...step });
    work.submitting = false;
    if (!accepted.accepted) { this.finish(work, 'rejected', accepted.code); return; }
    work.next++;
    work.actionId = accepted.actionId;
    // Other controller subscribers may cancel/reset synchronously on action_queued.
    for (const result of work.earlyResults.splice(0)) this.result(work, result);
  }
  private result(work: Work, result: Result) {
    if (work.settled || result.actionId !== work.actionId) return;
    work.results.push(result); work.actionId = undefined;
    if (result.status !== 'completed' || result.code === 'LEAK_WORSENED') {
      this.finish(work, result.status === 'cancelled' ? 'cancelled' : 'stopped', result.code);
    } else this.next(work);
  }
  private onEvent(event: GameEvent) {
    const work = this.work;
    if (event.type === 'action_result' && work && !work.settled && event.runId === work.turn.token.runId) {
      if (work.submitting) work.earlyResults.push(event.result);
      else this.result(work, event.result);
    }
    if (event.type === 'state_changed' && this.turn && this.controller.getObservation().runId !== this.turn.token.runId) {
      this.abort?.abort(); this.turn = undefined;
      if (work && !work.settled) this.finish(work, 'cancelled', 'STALE_RUN');
    }
    if (event.type === 'terminal' && this.turn?.token.runId === event.runId) {
      this.abort?.abort();
      if (work && !work.settled) this.finish(work, event.outcome === 'won' ? 'completed' : 'stopped', 'TERMINAL');
    }
  }
}

export const createCommandSession = (controller: GameController) => new CommandSession(controller);
