import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Player flashlight: shadowless SpotLight + faint additive cone for a hint of haze,
 * battery drain, low-battery flicker, and a small lag behind the view (it is held, not glued).
 */
export class Flashlight {
  readonly spot: THREE.SpotLight;
  readonly target: THREE.Object3D;
  readonly beam: THREE.Mesh;
  beamEnabled = true;

  private _battery: number;
  private _isOn = true;
  private flickerTimer = 0;
  private currentFlickerMul = 1;
  private forcedFlickerTimer = 0;
  private readonly aim = new THREE.Vector3(0, 0, -1);
  private readonly offset = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private initialised = false;
  private static readonly FORWARD = new THREE.Vector3(0, 0, -1);

  private static readonly BASE_INTENSITY = 46;
  private static readonly BEAM_COLOR = 0xffe6ba;

  constructor(scene: THREE.Scene) {
    this._battery = CONFIG.flashlight.maxBattery;

    this.spot = new THREE.SpotLight(
      CONFIG.flashlight.color,
      Flashlight.BASE_INTENSITY,
      CONFIG.flashlight.distance,
      CONFIG.flashlight.angle,
      CONFIG.flashlight.penumbra,
      1.6
    );
    this.spot.castShadow = false;

    this.target = new THREE.Object3D();
    this.spot.target = this.target;
    scene.add(this.spot);
    scene.add(this.target);

    const len = CONFIG.flashlight.beamLength;
    const rad = CONFIG.flashlight.beamRadius;
    const geo = new THREE.ConeGeometry(rad, len, 16, 1, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, -len / 2);

    // Soft haze cone: brightest at the lens, fading along its length and toward its edges
    // (where the view grazes the surface), so it reads as light in mist, not a solid shape.
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(Flashlight.BEAM_COLOR) },
        uOpacity: { value: 0.05 },
        uLen: { value: len }
      },
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying vec3 vN;
        varying vec3 vV;
        uniform float uLen;
        void main() {
          vAlong = clamp(-position.z / uLen, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlong;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float a = uOpacity * pow(1.0 - vAlong, 2.2) * smoothstep(0.0, 0.8, facing) * smoothstep(0.0, 0.08, vAlong);
          gl_FragColor = vec4(uColor * a, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide
    });
    this.beam = new THREE.Mesh(geo, mat);
    this.beam.frustumCulled = false;
    this.beam.visible = false;
    scene.add(this.beam);
  }

  get battery(): number {
    return this._battery;
  }

  get isOn(): boolean {
    return this._isOn;
  }

  get isDead(): boolean {
    return this._battery <= 0;
  }

  /** 0 = dark, 1 = fully lit (used by enemy perception). */
  get output(): number {
    return this._isOn && this._battery > 0 ? this.currentFlickerMul : 0;
  }

  toggle(): boolean {
    if (this.isDead) return false;
    this._isOn = !this._isOn;
    return true;
  }

  setOn(on: boolean): void {
    this._isOn = on && !this.isDead;
  }

  refill(amount: number): void {
    this._battery = Math.min(CONFIG.flashlight.maxBattery, this._battery + amount);
  }

  setBattery(value: number): void {
    this._battery = Math.max(0, Math.min(CONFIG.flashlight.maxBattery, value));
  }

  forceFlicker(duration: number): void {
    this.forcedFlickerTimer = Math.max(this.forcedFlickerTimer, duration);
  }

  update(dt: number, camPos: THREE.Vector3, camDir: THREE.Vector3, camQuat: THREE.Quaternion): void {
    if (this._isOn && this._battery > 0) {
      this._battery = Math.max(0, this._battery - CONFIG.flashlight.drainPerSec * dt);
    }
    if (this.forcedFlickerTimer > 0) this.forcedFlickerTimer = Math.max(0, this.forcedFlickerTimer - dt);

    const thresh = CONFIG.flashlight.flickerThreshold;
    const lowBattery = this._battery < thresh && this._battery > 0;
    const forced = this.forcedFlickerTimer > 0;

    let mul = 1;
    if (this._isOn && (lowBattery || forced)) {
      const severity = forced ? 0.75 + Math.sin(this.forcedFlickerTimer * 22) * 0.2 : 1 - this._battery / thresh;
      this.flickerTimer -= dt;
      if (this.flickerTimer <= 0) {
        this.flickerTimer = 0.05 + Math.random() * (0.4 - severity * 0.25);
        if (Math.random() < 0.45 + severity * 0.4) {
          this.currentFlickerMul = Math.random() < 0.5 ? 0.08 : 0.5;
        } else {
          this.currentFlickerMul = 1;
        }
      }
      mul = this.currentFlickerMul;
    } else {
      this.currentFlickerMul = 1;
      this.flickerTimer = 0;
    }

    // a weak battery also dims the bulb before it starts to stutter
    const charge = Math.min(1, 0.55 + this._battery / 60);
    const active = this._isOn && this._battery > 0;
    this.spot.intensity = active ? Flashlight.BASE_INTENSITY * mul * charge : 0;

    // held at the right hip-chest, aim trails the view slightly
    if (!this.initialised) {
      this.aim.copy(camDir);
      this.initialised = true;
    }
    const k = 1 - Math.exp(-18 * dt);
    this.aim.lerp(camDir, k).normalize();
    this.offset.set(0.16, -0.18, 0).applyQuaternion(camQuat);
    this.spot.position.copy(camPos).add(this.offset);
    this.target.position.copy(this.spot.position).addScaledVector(this.aim, 12);
    this.target.updateMatrixWorld();

    this.beam.visible = this.beamEnabled && active && mul > 0.35;
    if (this.beam.visible) {
      this.beam.position.copy(this.spot.position);
      this.tmpQ.setFromUnitVectors(Flashlight.FORWARD, this.aim);
      this.beam.quaternion.copy(this.tmpQ);
      (this.beam.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.05 * mul * charge;
    }
  }
}
