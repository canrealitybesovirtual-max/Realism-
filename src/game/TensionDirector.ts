import { CONFIG } from '../config';
import type { AudioManager } from '../audio/AudioManager';
import type { Flashlight } from './Flashlight';

/**
 * Ambient dread: scheduled scares and whispers. Scripted scares only fire when the
 * enemy is far away, so they never confuse the player about the real threat.
 */
export class TensionDirector {
  private spookTimer: number;
  private whisperTimer: number;

  constructor(
    private audio: AudioManager,
    private flashlight: Flashlight
  ) {
    this.spookTimer = this.rand(CONFIG.tension.spookIntervalMin, CONFIG.tension.spookIntervalMax);
    this.whisperTimer = this.rand(CONFIG.tension.whisperIntervalMin, CONFIG.tension.whisperIntervalMax);
  }

  update(dt: number, enemyDistance: number, enemyChasing: boolean): void {
    this.spookTimer -= dt;
    this.whisperTimer -= dt;

    if (this.spookTimer <= 0) {
      this.spookTimer = this.rand(CONFIG.tension.spookIntervalMin, CONFIG.tension.spookIntervalMax);
      if (enemyDistance > 15 && !enemyChasing) {
        this.audio.scareSwell();
        if (this.flashlight.isOn) this.flashlight.forceFlicker(CONFIG.tension.forceFlickerDuration);
      }
    }

    if (this.whisperTimer <= 0) {
      this.whisperTimer = this.rand(CONFIG.tension.whisperIntervalMin, CONFIG.tension.whisperIntervalMax);
      if (enemyDistance > 8 && !enemyChasing) this.audio.whisper();
    }
  }

  private rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }
}
