/** Rolling average FPS over the last 60 frames (ring buffer, no allocation). */
export class FpsMeter {
  private readonly samples = new Float32Array(60);
  private count = 0;
  private idx = 0;
  private sum = 0;

  update(dt: number): void {
    if (dt <= 0) return;
    this.sum -= this.samples[this.idx];
    this.samples[this.idx] = dt;
    this.sum += dt;
    this.idx = (this.idx + 1) % this.samples.length;
    if (this.count < this.samples.length) this.count++;
  }

  get value(): number {
    return this.count === 0 || this.sum <= 0 ? 0 : Math.round(this.count / this.sum);
  }
}
