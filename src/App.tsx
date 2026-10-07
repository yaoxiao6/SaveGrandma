import { lazy, Suspense, useEffect, useState } from 'react';
import { gameController, simulation } from './game/session';
import type { GameEvent } from './game/types';
import { TUNING } from './game/config';
import Scene from './view/Scene';

const DevPanel = import.meta.env.DEV ? lazy(() => import('./view/DevPanel')) : null;
const isPlayerPreview = new URLSearchParams(location.search).has('player');

export default function App() {
  const [world, setWorld] = useState(() => simulation.readState());
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [speed, setSpeed] = useState(1);
  const [message, setMessage] = useState('Grandma is calling from the bathroom. There’s water on the floor.');
  const developer = !!DevPanel && !isPlayerPreview;
  useEffect(() => gameController.subscribe(event => {
    if (event.type === 'state_changed') setWorld(simulation.readState());
    else if (event.type !== 'action_progress') setEvents(old => [event, ...old].slice(0, 60));
    if (event.type === 'action_result') setMessage(event.result.message);
    if (event.type === 'terminal') setMessage(event.message);
  }), []);
  useEffect(() => {
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      simulation.advance((now - last) / 1000 * (developer ? speed : 1));
      last = now;
    }, 50);
    // A hidden tab pauses the call so browser throttling cannot decide a game.
    const visibility = () => { if (document.hidden) gameController.pause(); last = performance.now(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [speed, developer]);
  const terminal = world.stage === 'won' || world.stage === 'lost';
  const elapsed = `${Math.floor(world.elapsed / 60).toString().padStart(2, '0')}:${Math.floor(world.elapsed % 60).toString().padStart(2, '0')}`;
  const water = Math.round(world.water / TUNING.floodThreshold * 100);
  const observation = gameController.getObservation();

  return <div className={`app ${developer ? 'developer' : 'player'}`}>
    <header className="site-header"><a className="brand" href="/" aria-label="Save Grandma home"><span className="brand-mark">g.</span><span>save grandma<span className="brand-dot">.</span></span></a><div className="header-right"><span className="pill"><span className="dot" /> {developer ? 'Game loop sandbox' : 'Bathroom emergency'}</span><span className="version">DEMO / 01</span></div></header>
    <main>
      <div className="intro"><div><div className="eyebrow">A LITTLE HELP GOES A LONG WAY</div><h1>Stay on the line.</h1><p>A leaky pipe. One phone. You’re Grandma’s lifeline.</p></div><div className="chapter"><span>01</span><div>THE BATHROOM<br /><small>One room, three ways out.</small></div></div></div>
      <div className="workspace">
        <section className="call-column" aria-label="Grandma’s phone call">
          <div className="call-window">
            <div className="call-top"><div className="caller-avatar">G</div><div><strong>Grandma</strong><span>{world.stage === 'ready' ? 'Incoming call' : world.stage === 'paused' ? 'Call paused' : terminal ? 'Call complete' : 'Bathroom · Connected'}</span></div><div className="call-time"><span className={`dot ${world.stage === 'running' ? 'live' : ''}`} />{elapsed}</div></div>
            <div className="camera-view" data-testid="camera-view"><Scene world={world} />
              <div className="camera-label"><span className="camera-icon" />{world.phone.mode === 'selfie' ? 'FRONT CAMERA' : 'REAR CAMERA'}<span> {world.phone.placement === 'hand' ? 'HANDHELD' : 'ON SHELF'}</span></div>
              <div className="camera-corners" />
              {world.stage === 'ready' && <div className="call-overlay"><div className="call-card"><span className="eyebrow">SHE COULD USE A HAND</span><h2>“Oh dear.<br />That’s a lot of water.”</h2><p>Help Grandma find the leak and stop the flood.</p><button className="primary" onClick={() => { setEvents([]); gameController.start(); }}>Answer the call <span>↗</span></button></div></div>}
              {world.stage === 'paused' && <div className="call-overlay"><div className="call-card compact"><span className="eyebrow">TAKE A BREATH</span><h2>Call paused.</h2><p>The water and Grandma’s actions are paused.</p><button className="primary" onClick={() => gameController.resume()}>Resume call ↗</button></div></div>}
              {terminal && <div className="call-overlay"><div className="call-card compact"><span className="eyebrow">{world.stage === 'won' ? 'CRISIS AVERTED' : 'LET’S TRY THAT AGAIN'}</span><h2>{world.stage === 'won' ? 'You saved the day.' : 'A little too much water.'}</h2><p>{world.stage === 'won' ? 'The leak has stopped. Grandma can put the kettle on.' : 'The bathroom flooded before the leak was stopped.'}</p><button className="primary" onClick={() => { gameController.reset(); setEvents([]); setMessage('A fresh call. Grandma is waiting for your help.'); }}>Start a new call ↗</button></div></div>}
            </div>
            <div className="caption" role="status"><span className="caption-label">{developer ? 'SIMULATION' : 'CALL STATUS'}</span><p>{message}</p></div>
            <div className="call-bottom"><span className="voice-status"><span className="wave">ııııı</span> Voice adapter not connected</span>{world.stage === 'running' && <button className="icon-button" aria-label="Pause call" onClick={() => gameController.pause()}>Ⅱ</button>}<span className="connection-note">{developer ? 'Use the developer panel to test actions' : 'Awaiting the team’s voice integration'}</span></div>
          </div>
          <div className="condition-strip"><div><span className="eyebrow">WATER LEVEL</span><div className="water-line"><div className="water-track"><i style={{ width: `${water}%` }} /></div><strong>{water}%</strong></div></div><div><span className="eyebrow">GRANDMA’S STRESS</span><div className={`stress ${observation.stressBand}`}><span className="dot" />{observation.stressBand === 'low' ? 'Keeping calm' : observation.stressBand === 'medium' ? 'Getting worried' : 'Feeling overwhelmed'}</div></div><div><span className="eyebrow">THE PHONE</span><strong className="phone-condition">{world.phone.placement === 'hand' ? 'In her hand' : 'Safely on the shelf'}</strong></div></div>
          <p className="footnote"><span>↳</span> The camera goes where the phone goes. Clear directions make all the difference.</p>
        </section>
        {developer && DevPanel && <Suspense fallback={<aside className="dev-panel">Loading developer controls…</aside>}><DevPanel world={world} events={events} speed={speed} setSpeed={setSpeed} clearEvents={() => setEvents([])} /></Suspense>}
      </div>
    </main><footer><span>A small emergency. A familiar voice.</span><span>SAVE GRANDMA <span className="footer-star">✳</span> FISHATHON PROTOTYPE</span></footer>
  </div>;
}
