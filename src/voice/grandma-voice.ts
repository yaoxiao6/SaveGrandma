/**
 * Grandma's spoken lines. PLACEHOLDER: uses the browser's speech synthesis so the demo talks.
 * Swap `speak` for the ElevenLabs proxy (POST /api/speak) once the key is on the server.
 * Separate from Yao's voice agent, which handles listening and instruction parsing.
 */
let current: SpeechSynthesisUtterance | null = null;

export function speak(text: string): Promise<void> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve();
  stopSpeaking();
  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92; utterance.pitch = 1.25; utterance.volume = 1;
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v => /en/i.test(v.lang) && /female|samantha|karen|moira|victoria|zira/i.test(v.name)) ?? voices.find(v => /^en/i.test(v.lang));
    if (preferred) utterance.voice = preferred;
    utterance.onend = utterance.onerror = () => { if (current === utterance) current = null; resolve(); };
    current = utterance;
    speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (typeof speechSynthesis === 'undefined') return;
  current = null;
  speechSynthesis.cancel();
}
