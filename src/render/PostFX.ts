import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CONFIG } from '../config';
import { screenFXShader } from './shaders/screenFX.glsl';

/**
 * Scene → OutputPass (tone mapping + sRGB, which render targets skip) → screen FX.
 * When disabled the scene renders straight to the canvas (tone mapped by the renderer).
 */
export class PostFX {
  readonly composer: EffectComposer;
  private readonly pass: ShaderPass;
  private time = 0;
  private enabled = true;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new OutputPass());

    this.pass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uGrain: { value: CONFIG.postfx.grain },
        uVignette: { value: CONFIG.postfx.vignette },
        uAberration: { value: CONFIG.postfx.aberration },
        uHurt: { value: 0 }
      },
      vertexShader: screenFXShader.vertexShader,
      fragmentShader: screenFXShader.fragmentShader
    });
    this.composer.addPass(this.pass);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** 0 = healthy, 1 = near death. */
  setHurt(v: number): void {
    this.pass.uniforms.uHurt.value = v;
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const dpr = this.renderer.getPixelRatio();
    (this.pass.uniforms.uResolution.value as THREE.Vector2).set(w * dpr, h * dpr);
  }

  render(dt: number): void {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.time += dt;
    this.pass.uniforms.uTime.value = this.time;
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
