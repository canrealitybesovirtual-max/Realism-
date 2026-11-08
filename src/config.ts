/**
 * All gameplay/rendering tunables in one place.
 * Values are chosen for mid-range mobile; tweak here, never inline.
 */
export const CONFIG = {
  render: {
    maxDPR: 1.75,
    fov: 72,
    near: 0.05,
    far: 90,
    clearColor: 0x1a2128,
    fogColor: 0x1a2128,
    fogDensityOutdoor: 0.028,
    fogDensityIndoor: 0.05,
    exposure: 1.6
  },
  player: {
    radius: 0.34,
    eyeHeight: 1.62,
    walkSpeed: 1.45,
    sprintSpeed: 3.6,
    accel: 10,
    maxStamina: 100,
    staminaDrainPerSec: 16,
    staminaRegenPerSec: 11,
    staminaRegenDelay: 1.3,
    lookSensitivity: 0.0032,
    maxPitch: Math.PI / 2 - 0.09,
    strideLength: 0.72,
    bobAmp: 0.028,
    bobSway: 0.016,
    bobRoll: 0.006
  },
  sim: {
    fixedDT: 1 / 60,
    maxFrameTime: 0.1
  },
  flashlight: {
    color: 0xfff0d0,
    maxBattery: 100,
    drainPerSec: 0.5,
    flickerThreshold: 30,
    distance: 32,
    angle: 0.3,
    penumbra: 0.45,
    beamLength: 8,
    beamRadius: 2.2
  },
  postfx: {
    grain: 0.045,
    vignette: 0.45,
    aberration: 0.0016
  },
  audio: {
    masterVolume: 0.5,
    ambientFadeIn: 2.5
  },
  interact: {
    maxRange: 2.6,
    proximityRange: 2.3,
    proximityCos: 0.7,
    hz: 10
  },
  items: {
    batteryRawRefill: 25,
    repairkitRefill: 100,
    medkitHeal: 50
  },
  health: {
    max: 100,
    respawnHp: 40
  },
  enemy: {
    patrolSpeed: 0.9,
    investigateSpeed: 1.35,
    chaseSpeed: 2.6,
    detectRange: 10,
    detectRangeLit: 15,
    contactRange: 1.1,
    contactDamage: 15,
    contactCooldown: 1.4,
    chaseLoseTime: 3.5,
    chaseLoseRange: 13,
    stepHearRange: 16
  },
  tension: {
    spookIntervalMin: 25,
    spookIntervalMax: 55,
    whisperIntervalMin: 9,
    whisperIntervalMax: 22,
    forceFlickerDuration: 1.0
  },
  objective: {
    fuseCount: 3,
    interactRange: 2.2
  },
  save: {
    key: 'fogline.save.v1',
    autosaveInterval: 30
  },
  settings: {
    key: 'fogline.settings.v1',
    sensitivityMin: 0.5,
    sensitivityMax: 2.0,
    defaultSensitivity: 1.0,
    defaultVolume: 0.8
  }
} as const;

export type Config = typeof CONFIG;
