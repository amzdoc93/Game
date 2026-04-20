// Centralized quality settings. Toggle with Q or via #quality button.
// LOW_QUALITY_MODE disables SSAO, Bloom, soft shadows, grass density, etc.

const STORAGE_KEY = 'game.quality';

function detectDefault() {
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const lowMem = (navigator.deviceMemory || 8) <= 4;
  const lowCores = (navigator.hardwareConcurrency || 8) <= 4;
  return (isMobile || lowMem || lowCores) ? 'low' : 'high';
}

const saved = localStorage.getItem(STORAGE_KEY);
let current = saved === 'low' || saved === 'high' ? saved : detectDefault();

export const Quality = {
  get mode() { return current; },
  get low() { return current === 'low'; },
  get high() { return current === 'high'; },

  set(mode) {
    current = mode === 'low' ? 'low' : 'high';
    localStorage.setItem(STORAGE_KEY, current);
    listeners.forEach(fn => fn(current));
  },

  toggle() { this.set(current === 'low' ? 'high' : 'low'); },

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  // Derived settings
  get shadowMapSize()     { return current === 'low' ? 1024 : 2048; }
  ,get shadowType()       { return current === 'low' ? 'basic' : 'pcfsoft'; }
  ,get pixelRatioCap()    { return current === 'low' ? 1.0 : Math.min(window.devicePixelRatio, 2.0); }
  ,get postprocess()      { return current === 'high'; }
  ,get ssao()             { return current === 'high'; }
  ,get bloom()            { return current === 'high'; }
  ,get grassCount()       { return current === 'low' ? 2500 : 15000; }
  ,get treeShadows()      { return current === 'high'; }
  ,get envMapResolution() { return current === 'low' ? 128 : 256; }
  ,get drawDistance()     { return current === 'low' ? 180 : 320; }
};

const listeners = new Set();
