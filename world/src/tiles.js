// Google Photorealistic 3D Tiles: the photo-scanned city, streamed live. Optional: it needs the
// player's own Google Maps Platform API key (Map Tiles API enabled), entered on the start card
// and kept in this browser only (localStorage world.gkey). Google's terms do not allow the
// tiles to be stored or baked, so this streams every time; the baked view stays the default.
// G switches between the baked view and Google's tiles.
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin, GLTFExtensionsPlugin, TilesFadePlugin } from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const keyStore = {
  get: () => { try { return localStorage.getItem('world.gkey') || ''; } catch (e) { return ''; } },
  set: (k) => { try { if (k) localStorage.setItem('world.gkey', k); else localStorage.removeItem('world.gkey'); } catch (e) { /* private mode */ } },
};

// lat0 / lon0: the city frame origin; grid: street grid angle (deg); streetH: ellipsoid height
// of the street there (NAVD88 street + geoid separation); anchor / aptCenter as in the manifest
export function createTiles(scene, camera, renderer, frame) {
  const key = keyStore.get();
  if (!key) return null;
  const tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true }));
  const draco = new DRACOLoader().setDecoderPath('./vendor/three/examples/jsm/libs/draco/gltf/');
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
  tiles.registerPlugin(new TilesFadePlugin());
  tiles.errorTarget = frame.quest ? 24 : 10;
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);

  // ECEF -> east-north-up at the origin -> game frame (grid turned, y up, apartment at its spot)
  const enu = new THREE.Matrix4();
  tiles.ellipsoid.getEastNorthUpFrame(THREE.MathUtils.degToRad(frame.lat0), THREE.MathUtils.degToRad(frame.lon0), frame.streetH, enu);
  const a = THREE.MathUtils.degToRad(frame.gridDeg), ca = Math.cos(a), sa = Math.sin(a);
  // (e, n, u) -> (x = e cos a - n sin a, y = u, z = -(e sin a + n cos a))
  const R = new THREE.Matrix4().set(ca, -sa, 0, 0, 0, 0, 1, 0, -sa, -ca, 0, 0, 0, 0, 0, 1);
  const T = new THREE.Matrix4().makeTranslation(frame.aptCenter[0] - frame.anchor[0], -frame.street, frame.aptCenter[1] - frame.anchor[1]);
  const M = T.multiply(R).multiply(enu.clone().invert());
  tiles.group.matrixAutoUpdate = false;
  tiles.group.matrix.copy(M);
  tiles.group.updateMatrixWorld(true);
  tiles.group.visible = false;
  scene.add(tiles.group);

  // Google's attribution must stay on screen while the tiles show
  const att = document.createElement('div');
  att.style.cssText = 'position:fixed;left:8px;bottom:6px;font:11px system-ui;color:#fff;text-shadow:0 0 3px #000;pointer-events:none;display:none';
  document.body.appendChild(att);
  let attT = 0;
  return {
    tiles,
    get on() { return tiles.group.visible; },
    set on(v) { tiles.group.visible = v; att.style.display = v ? '' : 'none'; },
    update(cam, dt) {
      if (!tiles.group.visible) return;
      tiles.setCamera(cam);
      tiles.setResolutionFromRenderer(cam, renderer);
      cam.updateMatrixWorld();
      tiles.update();
      attT -= dt;
      if (attT <= 0) { attT = 1; att.textContent = 'Google · ' + tiles.getAttributions().map((x) => x.value).filter((v) => typeof v === 'string').join(' · '); }
    },
  };
}
