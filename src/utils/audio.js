// Web Audio API Synthesizer with Global Sound Controls
let audioCtx = null;

const SOUND_STORAGE_KEY = 'poker_audio_settings';

const getSettings = () => {
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { muted: false, volume: 0.8 };
};

const saveSettings = (settings) => {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('poker_audio_change', { detail: settings }));
  } catch {}
};

export const isAudioMuted = () => getSettings().muted;

export const toggleAudioMute = () => {
  const current = getSettings();
  const next = { ...current, muted: !current.muted };
  saveSettings(next);
  return next.muted;
};

export const getAudioVolume = () => getSettings().volume;

export const setAudioVolume = (vol) => {
  const clamped = Math.max(0, Math.min(1, vol));
  const current = getSettings();
  saveSettings({ ...current, volume: clamped });
};

export const preloadAudio = async () => {
  // Synthetic web audio
};

export const playSound = (soundName) => {
  try {
    const settings = getSettings();
    if (settings.muted || settings.volume <= 0) return;

    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const masterGain = settings.volume;
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (soundName === 'bet') {
      // High-pitched chip clink
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05);
      gain.gain.setValueAtTime(0.5 * masterGain, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
      osc.start(t);
      osc.stop(t + 0.05);
    } 
    else if (soundName === 'check') {
      // Double tap on felt
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, t);
      gain.gain.setValueAtTime(0.4 * masterGain, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
      osc.start(t);
      osc.stop(t + 0.06);

      // Second tap
      setTimeout(() => {
        if (!audioCtx) return;
        const t2 = audioCtx.currentTime;
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(200, t2);
        gain2.gain.setValueAtTime(0.35 * masterGain, t2);
        gain2.gain.exponentialRampToValueAtTime(0.01, t2 + 0.06);
        osc2.start(t2);
        osc2.stop(t2 + 0.06);
      }, 70);
    }
    else if (soundName === 'turn') {
      // Soft Bell (It's your turn)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      gain.gain.setValueAtTime(0.35 * masterGain, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.45);
    } 
    else if (soundName === 'fold') {
      // Low Thud
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
      gain.gain.setValueAtTime(0.4 * masterGain, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.15);
    } 
    else if (soundName === 'deal') {
      // Quick card slide (sweep)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.09);
      gain.gain.setValueAtTime(0.2 * masterGain, t);
      gain.gain.linearRampToValueAtTime(0.01, t + 0.09);
      osc.start(t);
      osc.stop(t + 0.09);
    }
    else if (soundName === 'win') {
      // Triumphant arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        setTimeout(() => {
          if (!audioCtx) return;
          const nt = audioCtx.currentTime;
          const nosc = audioCtx.createOscillator();
          const ngain = audioCtx.createGain();
          nosc.connect(ngain);
          ngain.connect(audioCtx.destination);
          nosc.type = 'sine';
          nosc.frequency.setValueAtTime(freq, nt);
          ngain.gain.setValueAtTime(0.25 * masterGain, nt);
          ngain.gain.exponentialRampToValueAtTime(0.01, nt + 0.35);
          nosc.start(nt);
          nosc.stop(nt + 0.35);
        }, idx * 80);
      });
    }
    else if (soundName === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, t);
      gain.gain.setValueAtTime(0.15 * masterGain, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);
      osc.start(t);
      osc.stop(t + 0.03);
    }
  } catch (err) {
    console.warn('Audio play failed:', err);
  }
};
