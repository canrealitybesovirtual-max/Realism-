/** Single-pass screen FX (display space): vignette, film grain, subtle chromatic aberration. */
export const screenFXShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2  uResolution;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uHurt;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 center = vUv - 0.5;
      float r2 = dot(center, center);
      vec2 dir = normalize(center + 1e-6);

      float off = uAberration * r2 * (1.0 + uHurt * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + dir * off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - dir * off).b;

      float vig = 1.0 - uVignette * smoothstep(0.10, 0.85, r2 * 2.0);
      col *= vig;

      // low health: colour drains and the edges darken red
      float grey = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(grey), uHurt * 0.55);
      col = mix(col, col * vec3(1.25, 0.55, 0.5), uHurt * smoothstep(0.05, 0.5, r2 * 2.0));

      // grain is stronger in the shadows, like real sensor noise
      float g = hash(floor(vUv * uResolution) + fract(uTime * 13.37) * 91.0) - 0.5;
      col += g * uGrain * (1.2 - grey);

      gl_FragColor = vec4(col, 1.0);
    }
  `
};
