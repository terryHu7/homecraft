import { SWARG_EARTH } from './swarg-gate.js';
export function createSwargSound({ sound }) {
  let context = null, master = null, drone = null, droneGain = null, lastBell = 0;
  let realmMode = false, lastPhrase = 0;
  const bellNotes = [659.25, 783.99, 987.77, 1174.66];
  const pentatonic = [261.63, 293.66, 329.63, 392, 440, 523.25];
  function ensure() {
    if (context) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    context = new Audio(); master = context.createGain(); master.gain.value = 0.32; master.connect(context.destination);
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 530; filter.Q.value = 0.8;
    droneGain = context.createGain(); droneGain.gain.value = 0;
    for (const [frequency, detune] of [[110, -7], [110.9, 6], [164.81, 2]]) {
      const osc = context.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = frequency; osc.detune.value = detune; osc.connect(filter); osc.start();
    }
    filter.connect(droneGain); droneGain.connect(master); drone = { filter, droneGain };
    document.addEventListener('visibilitychange', onVisibility);
  }
  function onVisibility() {
    if (!context) return;
    if (document.hidden) context.suspend();
    else if (sound.on) context.resume();
  }
  function gesture() { ensure(); if (context && sound.on && context.state === 'suspended') context.resume(); }
  function tone(frequency, duration = 1.5, volume = 0.12, type = 'sine', pan = 0) {
    if (!context || !sound.on) return;
    const t = context.currentTime, osc = context.createOscillator(), gain = context.createGain(), panner = context.createStereoPanner();
    osc.type = type; osc.frequency.setValueAtTime(frequency, t);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    panner.pan.value = pan; osc.connect(gain); gain.connect(panner); panner.connect(master); osc.start(t); osc.stop(t + duration + 0.05);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); panner.disconnect(); };
  }
  function transition() {
    gesture(); if (!context || !sound.on) return;
    const t = context.currentTime;
    const noise=context.createBuffer(1,context.sampleRate*2,context.sampleRate);
    const samples=noise.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
    const wind=context.createBufferSource(), air=context.createBiquadFilter(), swell=context.createGain();
    wind.buffer=noise;air.type='bandpass';air.frequency.setValueAtTime(340,t);air.frequency.exponentialRampToValueAtTime(1300,t+1.8);
    swell.gain.setValueAtTime(.001,t);swell.gain.exponentialRampToValueAtTime(.2,t+.9);swell.gain.exponentialRampToValueAtTime(.001,t+2);
    wind.connect(air);air.connect(swell);swell.connect(master);wind.start();
    wind.onended=()=>{wind.disconnect();air.disconnect();swell.disconnect();};
    tone(130.81, 1.7, 0.22, 'sawtooth');
    tone(196, 1.9, 0.12, 'sine');
    const osc = context.createOscillator(), g = context.createGain(); osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t); osc.frequency.exponentialRampToValueAtTime(1760, t + 1.05);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + 1.55); osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }
  function bell() { tone(bellNotes[Math.floor(Math.random() * bellNotes.length)], 3.3, 0.12, 'sine', Math.random() * 1.4 - 0.7); }
  function update(dt, player, inRealm) {
    realmMode = inRealm;
    if (!sound.on || document.hidden) {
      if (droneGain && context) droneGain.gain.setTargetAtTime(0, context.currentTime, 0.25);
      if (master && context) master.gain.setTargetAtTime(0, context.currentTime, 0.08);
      return;
    }
    if (!context) return;
    if (context.state === 'suspended') context.resume();
    master.gain.setTargetAtTime(0.32, context.currentTime, 0.12);
    const d = Math.hypot(player.pos.x - SWARG_EARTH.x, player.pos.z - SWARG_EARTH.z, player.y - SWARG_EARTH.y);
    const earthLevel = Math.max(0, 1 - d / 60);
    const target = inRealm ? 0.045 : earthLevel * 0.19;
    droneGain.gain.setTargetAtTime(target, context.currentTime, 0.7);
    if (context.currentTime - lastBell > (inRealm ? 7 + Math.random() * 8 : 12 + Math.random() * 14)) {
      lastBell = context.currentTime; bell();
    }
    if (inRealm && context.currentTime - lastPhrase > 18 + Math.random() * 15) {
      lastPhrase = context.currentTime;
      const base = pentatonic[Math.floor(Math.random() * pentatonic.length)];
      tone(base, 1.7, 0.075, 'sine', -0.25); setTimeout(() => tone(base * 1.25, 1.5, 0.065, 'sine', 0.25), 700);
      setTimeout(() => tone(base * 1.5, 2.1, 0.07, 'sine', 0), 1450);
    }
  }
  function dispose() {
    document.removeEventListener('visibilitychange', onVisibility);
    if (context) { context.close(); context = null; }
  }
  return { gesture, transition, update, dispose };
}
