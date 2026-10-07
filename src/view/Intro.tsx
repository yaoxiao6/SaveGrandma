import { useEffect, useState } from 'react';
import { ringPhone } from './intro-audio';
import { speak } from '../voice/grandma-voice';

export const GREETING = 'Honey, I’m trapped in the bathroom and it’s flooding in here! Can you help me get out of this pickle?';
export const RULES = [
  'Grandma only does what you tell her.',
  'Stop the water before the room floods.',
  'Say “rear camera” to see the room.',
  'Be specific: “grab the wrench”, “turn the valve clockwise”.',
];
const GREETING_SECONDS = 6;
const RULES_SECONDS = 3;
const FADE_SECONDS = 0.7;

type Phase = 'ringing' | 'greeting' | 'rules' | 'fade-out' | 'fade-in';

export function RulesList({ className }: { className: string }) {
  return <div className={className}><h3>How to save Grandma</h3><ul>{RULES.map(rule => <li key={rule}>{rule}</li>)}</ul></div>;
}

/** Cinematic opening: black screen and ringing, Grandma's greeting, the rules, then a fade into the live call. */
export default function Intro({ onGreeting, onDone, onFinished }: { onGreeting: () => void; onDone: () => void; onFinished: () => void }) {
  const [phase, setPhase] = useState<Phase>('ringing');
  useEffect(() => {
    const ring = ringPhone();
    const timers: number[] = [];
    const at = (seconds: number, fn: () => void) => timers.push(window.setTimeout(fn, seconds * 1000));
    let t = ring.duration + 0.4;
    at(t, () => { setPhase('greeting'); onGreeting(); void speak(GREETING); });
    t += GREETING_SECONDS;
    at(t, () => setPhase('rules'));
    t += RULES_SECONDS;
    at(t, () => setPhase('fade-out'));
    t += FADE_SECONDS;
    at(t, () => { setPhase('fade-in'); onDone(); });
    t += FADE_SECONDS + 0.2;
    at(t, onFinished);
    return () => { ring.stop(); timers.forEach(clearTimeout); };
    // The sequence runs exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'ringing') return <div className="intro-black" aria-label="Phone ringing" />;
  if (phase === 'fade-out') return <div className="intro-black fade-out" />;
  if (phase === 'fade-in') return <div className="intro-black fade-in" />;
  return <div className="intro-layer screen-on">
    {phase === 'greeting' && <div className="speech-bubble"><p>{GREETING}</p></div>}
    {phase === 'rules' && <div className="rules-backdrop"><RulesList className="rules rules-center" /></div>}
  </div>;
}
