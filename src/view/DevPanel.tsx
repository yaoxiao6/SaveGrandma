import { useState } from 'react';
import type { WorldState } from '../game/controller';
import { gameCommands, gameController } from '../game/session';
import { OBJECTS, ids, TUNING } from '../game/config';
import { PRESETS, runPreset } from '../game/presets';
import type { Action, Direction, Frame, GameEvent, ItemId, ObjectId, Target } from '../game/types';

const names: Record<Action['type'], string> = { look: 'Look', turn: 'Turn', move: 'Walk a distance', move_to: 'Walk to an object', switch_camera: 'Switch camera', place_phone: 'Place phone', retrieve_phone: 'Retrieve phone', bend: 'Bend down', stand: 'Stand up', grab: 'Pick up object', place: 'Put down item', rotate: 'Rotate fitting', apply_patch: 'Apply patch', secure_patch: 'Secure clamp', wait: 'Wait' };
export default function DevPanel({ world, events, speed, setSpeed, clearEvents }: { world: WorldState; events: GameEvent[]; speed: number; setSpeed: (n: number) => void; clearEvents: () => void }) {
  const [tab, setTab] = useState<'actions' | 'state' | 'events'>('actions');
  const [kind, setKind] = useState<Action['type']>('switch_camera');
  const [targetId, setTargetId] = useState<ObjectId>('supply_valve');
  const [item, setItem] = useState<ItemId>('wrench');
  const [direction, setDirection] = useState<Direction>('forward');
  const [lookDirection, setLookDirection] = useState<Direction | 'up' | 'down'>('forward');
  const [turnDirection, setTurnDirection] = useState<'left' | 'right'>('left');
  const [rotation, setRotation] = useState<'clockwise' | 'counterclockwise' | ''>('clockwise');
  const [frame, setFrame] = useState<Frame>('grandma');
  const [amount, setAmount] = useState(1);
  const [degrees, setDegrees] = useState(45);
  const [mode, setMode] = useState<'selfie' | 'rear'>('rear');
  const [ambiguous, setAmbiguous] = useState(false);
  const [description, setDescription] = useState('fitting');
  const [color, setColor] = useState('');
  const [unresolved, setUnresolved] = useState('');
  const [seed, setSeed] = useState(7);
  const [preset, setPreset] = useState('valve');
  const [safeSequence, setSafeSequence] = useState(true);
  const [feedback, setFeedback] = useState('Send structured actions through the public controller.');
  const hasTarget = ['move_to', 'place_phone', 'grab', 'place', 'rotate', 'apply_patch', 'secure_patch'].includes(kind);
  const running = world.stage === 'running';
  const send = () => {
    const target: Target = ambiguous ? { description, qualifiers: color ? { color } : undefined } : { id: targetId };
    let action: Action;
    switch (kind) {
      case 'look': action = { type: kind, direction: lookDirection, degrees, frame }; break;
      case 'turn': action = { type: kind, direction: turnDirection, degrees, frame }; break;
      case 'move': action = { type: kind, direction, meters: amount, frame }; break;
      case 'switch_camera': action = { type: kind, mode }; break;
      case 'wait': action = { type: kind, seconds: amount }; break;
      case 'rotate': action = { type: kind, target, direction: rotation || undefined }; break;
      case 'place': action = { type: kind, target, item }; break;
      case 'grab': case 'move_to': case 'place_phone': case 'apply_patch': case 'secure_patch': action = { type: kind, target }; break;
      default: action = { type: kind };
    }
    const result = gameController.submitAction({ runId: world.runId, action, unresolved: unresolved.split(',').map(x => x.trim()).filter(Boolean) });
    setFeedback(`${result.code} · ${result.message}`);
  };
  const reset = () => { gameController.reset({ seed }); clearEvents(); setFeedback('Session reset. Start the call or run a preset.'); };
  const playPreset = () => {
    clearEvents();
    if (!safeSequence) {
      const results = runPreset(gameController, preset, seed);
      setFeedback(`Queued ${results.filter(r => r.accepted).length} actions in a new run.`);
      return;
    }
    gameController.reset({ seed }); gameController.start();
    const turn = gameCommands.beginTurn();
    setFeedback('Running through Yao’s command-session interface. Stops at the first issue.');
    void gameCommands.submit(turn.token, PRESETS[preset].actions.map(action => ({ action }))).then(result => {
      if (gameController.getObservation().runId === result.runId) setFeedback(`${result.code} · ${result.results.length} results, ${result.skipped} steps skipped.`);
    });
  };
  return <aside className="dev-panel" aria-label="Developer panel">
    <div className="panel-title"><div><span className="eyebrow">FOR THE TEAM</span><h2>Developer console</h2></div><span className="dev-badge">DEV</span></div>
    <div className="tabs" role="tablist" aria-label="Developer views">{(['actions', 'state', 'events'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}{t === 'events' && <span>{events.length}</span>}</button>)}</div>
    <div className="panel-body">
      <div className="session-row"><span><i className={`dot ${running ? 'live' : ''}`} />{world.stage.toUpperCase()}</span><span>{world.queue.length} QUEUED</span></div>
      {world.active && <div className="active-action"><span>{names[world.active.request.action.type]} <small>{Math.round(world.active.elapsed / world.active.duration * 100)}%</small></span><div className="progress"><i style={{ width: `${world.active.elapsed / world.active.duration * 100}%` }} /></div></div>}
      <div className="session-buttons"><button onClick={() => world.stage === 'ready' ? gameController.start() : world.stage === 'paused' ? gameController.resume() : gameController.pause()} disabled={world.stage === 'won' || world.stage === 'lost'}>{running ? 'Pause' : world.stage === 'ready' ? 'Start' : 'Resume'}</button><button onClick={() => gameCommands.interrupt()}>Cancel actions</button><button onClick={reset}>Reset</button></div>
      {tab === 'actions' && <>
        <div className="section-label">01 <span>SCENARIO PRESETS</span></div>
        <label>Scripted scenario<select value={preset} onChange={e => setPreset(e.target.value)}>{Object.entries(PRESETS).map(([key, p]) => <option key={key} value={key}>{p.name}</option>)}</select></label>
        <p className="help-text">{PRESETS[preset].description}</p>
        <div className="two-fields"><label>Random seed<input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} /></label><label>Simulation speed<select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1× · Real time</option><option value={3}>3×</option><option value={10}>10×</option></select></label></div>
        <label className="checkbox"><input type="checkbox" checked={safeSequence} onChange={e => setSafeSequence(e.target.checked)} /> Stop the sequence on the first issue</label>
        <button className="preset-button" onClick={playPreset}>Run preset <span>↗</span></button>
        <div className="section-label">02 <span>INDIVIDUAL ACTION</span></div>
        <label>Action<select value={kind} onChange={e => setKind(e.target.value as Action['type'])}>{Object.entries(names).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        {hasTarget && <><label>Target<select value={targetId} onChange={e => setTargetId(e.target.value as ObjectId)} disabled={ambiguous}>{ids.map(id => <option key={id} value={id}>{OBJECTS[id].name}</option>)}</select></label><label className="checkbox"><input type="checkbox" checked={ambiguous} onChange={e => setAmbiguous(e.target.checked)} /> Use an ambiguous description</label>{ambiguous && <div className="two-fields"><label>Description<input value={description} onChange={e => setDescription(e.target.value)} placeholder="fitting / tool" /></label><label>Color qualifier<input value={color} onChange={e => setColor(e.target.value)} placeholder="optional" /></label></div>}</>}
        {kind === 'place' && <label>Held item<select value={item} onChange={e => setItem(e.target.value as ItemId)}>{['wrench', 'patch', 'clamp', 'towels', 'bucket'].map(id => <option key={id}>{id}</option>)}</select></label>}
        {kind === 'switch_camera' && <label>Camera<select value={mode} onChange={e => setMode(e.target.value as 'selfie' | 'rear')}><option value="rear">Rear · See the room</option><option value="selfie">Front · See Grandma</option></select></label>}
        {kind === 'rotate' && <label>Rotation<select value={rotation} onChange={e => setRotation(e.target.value as typeof rotation)}><option value="clockwise">Clockwise</option><option value="counterclockwise">Counterclockwise</option><option value="">Unspecified · Ask for clarification</option></select></label>}
        {kind === 'move' && <label>Direction<select value={direction} onChange={e => setDirection(e.target.value as Direction)}>{['forward', 'backward', 'left', 'right'].map(d => <option key={d}>{d}</option>)}</select></label>}
        {kind === 'look' && <label>Look direction<select value={lookDirection} onChange={e => setLookDirection(e.target.value as typeof lookDirection)}>{['forward', 'backward', 'left', 'right', 'up', 'down'].map(d => <option key={d}>{d}</option>)}</select></label>}
        {kind === 'turn' && <label>Turn direction<select value={turnDirection} onChange={e => setTurnDirection(e.target.value as typeof turnDirection)}><option>left</option><option>right</option></select></label>}
        {['move', 'look', 'turn'].includes(kind) && <label>Direction frame<select value={frame} onChange={e => setFrame(e.target.value as Frame)}><option value="grandma">Grandma’s perspective (default)</option><option value="camera">Phone camera’s perspective</option></select></label>}
        {['look', 'turn'].includes(kind) && <label>Degrees<input type="number" min={1} max={180} value={degrees} onChange={e => setDegrees(Number(e.target.value))} /></label>}
        {['move', 'wait'].includes(kind) && <label>{kind === 'move' ? 'Distance (meters)' : 'Duration (seconds)'}<input type="number" min={0.1} max={kind === 'move' ? 5 : 600} step={0.1} value={amount} onChange={e => setAmount(Number(e.target.value))} /></label>}
        <details><summary>Unresolved details</summary><label>Comma-separated fields<input value={unresolved} onChange={e => setUnresolved(e.target.value)} placeholder="target, direction" /></label></details>
        <button className="primary send" onClick={send} disabled={!running}>Queue action <span>→</span></button><p className="feedback" role="status">{feedback}</p>
      </>}
      {tab === 'state' && <>
        <div className="section-label">01 <span>ROOM MAP · DEVELOPER ONLY</span></div>
        <svg viewBox="-3 -0.1 6 6" className="room-map" role="img" aria-label="Developer room map with Grandma and object positions"><rect x={-2.8} y={0.1} width={5.6} height={5.5} rx={0.1} fill="#e4e9df" stroke="#a6b39c" strokeWidth={0.04} />{ids.map(id => <g key={id}><circle cx={OBJECTS[id].position.x} cy={5.6 - OBJECTS[id].position.z} r={0.09} fill={id === 'supply_valve' ? '#bd6552' : '#779485'} /><text x={OBJECTS[id].position.x} y={5.43 - OBJECTS[id].position.z} fontSize={0.14} textAnchor="middle">{id.replaceAll('_', ' ')}</text></g>)}<circle cx={world.grandma.position.x} cy={5.6 - world.grandma.position.z} r={0.13} fill="#d6914c" /></svg>
        <dl className="diagnostics"><dt>Run</dt><dd>{world.runId}</dd><dt>Posture</dt><dd>{world.grandma.posture}</dd><dt>Held items</dt><dd>{world.grandma.held.join(', ') || 'None'}</dd><dt>Leak / second</dt><dd>{world.leakRate.toFixed(3)}</dd><dt>Flood threshold</dt><dd>{world.water.toFixed(1)} / {TUNING.floodThreshold}</dd><dt>Bucket capacity left</dt><dd>{world.bucketRemaining.toFixed(1)}</dd><dt>Towel capacity left</dt><dd>{world.towelRemaining.toFixed(1)}</dd><dt>Patch attached</dt><dd>{world.patchApplied ? 'Yes' : 'No'}</dd></dl>
        <details><summary>Public observation (voice-safe)</summary><pre>{JSON.stringify(gameController.getObservation(), null, 2)}</pre></details>
      </>}
      {tab === 'events' && <><div className="section-label">01 <span>CONTROLLER EVENTS · NEWEST FIRST</span></div>{!events.length && <p className="help-text">Action results and misunderstandings will appear here.</p>}<ol className="events">{events.map((event, i) => <li key={`${event.runId}-${i}`} className={event.type === 'action_result' && event.result.status !== 'completed' ? 'event-warning' : ''}><span>{event.type.replaceAll('_', ' ')}</span>{event.type === 'action_result' ? <><strong>{event.result.code}</strong><p>{event.result.message}</p><small>{event.result.actionId}</small></> : event.type === 'action_queued' ? <p>{event.action.type} <small>{event.actionId}</small></p> : event.type === 'misunderstanding' ? <p>Selected {event.selectedTarget} at {event.stressBand} stress.</p> : event.type === 'terminal' ? <p>{event.message}</p> : null}</li>)}</ol></>}
    </div><div className="panel-footer">Development only · Excluded from production builds</div>
  </aside>;
}
