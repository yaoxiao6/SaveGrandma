/** Title screen shown before the call interface. Purely presentational; it never touches the simulation. */
export default function StartScreen({ onStart }: { onStart: () => void }) {
  return <div className="start-screen" role="dialog" aria-modal="true" aria-labelledby="start-title">
    <div className="bubbles" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ left: `${(i * 83) % 100}%`, animationDelay: `${(i * 1.7) % 9}s`, width: `${28 + (i * 37) % 70}px` }} />)}</div>
    <div className="start-card">
      <h1 id="start-title"><span>Help Me,</span><span>Grandma!</span></h1>
      <button className="start-button" aria-label="Start the game" autoFocus onClick={onStart}>Start</button>
    </div>
  </div>;
}
