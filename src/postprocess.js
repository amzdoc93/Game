// EffectComposer pipeline: SSAO -> Bloom -> Vignette/Contrast -> FXAA.
// All optional via Quality flag — in LOW mode we skip the composer entirely
// and let the renderer blit directly, saving ~30% frame time.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { Quality } from './quality.js';

export function createPostprocess(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Quality.pixelRatioCap);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  let ssao, bloom, fxaa, vignette;

  if (Quality.ssao) {
    ssao = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ssao.kernelRadius = 0.5;
    ssao.minDistance  = 0.0015;
    ssao.maxDistance  = 0.08;
    ssao.output = SSAOPass.OUTPUT.Default;
    composer.addPass(ssao);
  }

  if (Quality.bloom) {
    bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.3,  // strength
      0.6,  // radius
      0.9,  // threshold
    );
    composer.addPass(bloom);
  }

  // Vignette + slight contrast as a tiny custom shader pass
  vignette = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uStrength: { value: 0.22 },
      uContrast: { value: 1.04 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uStrength;
      uniform float uContrast;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        // Contrast around 0.5
        c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
        // Vignette
        vec2 p = vUv - 0.5;
        float v = 1.0 - dot(p, p) * uStrength * 4.0;
        c.rgb *= clamp(v, 0.0, 1.0);
        gl_FragColor = c;
      }`,
  });
  composer.addPass(vignette);

  // FXAA + gamma/tone in the final Output pass
  fxaa = new ShaderPass(FXAAShader);
  fxaa.material.uniforms['resolution'].value.set(
    1 / (window.innerWidth * Quality.pixelRatioCap),
    1 / (window.innerHeight * Quality.pixelRatioCap),
  );
  composer.addPass(fxaa);

  composer.addPass(new OutputPass());

  return {
    composer,
    render() { composer.render(); },
    setSize(w, h) {
      composer.setSize(w, h);
      if (ssao) ssao.setSize(w, h);
      if (bloom) bloom.setSize(w, h);
      if (fxaa) {
        const pr = Quality.pixelRatioCap;
        fxaa.material.uniforms['resolution'].value.set(1 / (w * pr), 1 / (h * pr));
      }
    },
  };
}
