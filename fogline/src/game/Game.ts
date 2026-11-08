import * as THREE from 'three';
import { CONFIG } from '../config';
import { FpsMeter } from '../utils/Performance';
import { InputManager } from './InputManager';
import { PlayerController } from './PlayerController';
import { Flashlight } from './Flashlight';
import { World } from './World';
import { HUD } from '../ui/HUD';
import { TouchControls } from '../ui/TouchControls';
import { PostFX } from '../render/PostFX';
import { AudioManager } from '../audio/AudioManager';
import { Inventory } from './Inventory';
import { Crafting } from './Crafting';
import { Interaction } from './Interaction';
import { ITEMS } from './items';
import { InventoryPanel } from '../ui/InventoryPanel';
import { CraftingPanel } from '../ui/CraftingPanel';
import { Toast } from '../ui/Toast';
import { TensionDirector } from './TensionDirector';
import { Objective } from './Objective';
import { SaveSystem } from './SaveSystem';
import { SettingsStore } from './Settings';
import { PauseMenu } from '../ui/PauseMenu';
import { EndScreen } from '../ui/EndScreen';
import { DebugOverlay } from '../ui/DebugOverlay';
import { TitleScreen } from '../ui/TitleScreen';
import { QualityManager } from '../render/QualityManager';
import type { ItemId, Recipe, SaveDataV1, SettingsData } from '../types';

type Overlay = 'title' | 'none' | 'inventory' | 'crafting' | 'paused' | 'win' | 'lose';

export class Game {
  readonly world: World;
  readonly player: PlayerController;
  readonly input: InputManager;
  readonly flashlight: Flashlight;
  readonly audio: AudioManager;
  readonly inventory: Inventory;
  readonly crafting: Crafting;
  readonly interaction: Interaction;
  readonly tension: TensionDirector;
  readonly objective: Objective;
  readonly quality: QualityManager;
  readonly camera: THREE.PerspectiveCamera;

  private readonly hud: HUD;
  private readonly touch: TouchControls;
  private readonly postfx: PostFX;
  private readonly inventoryPanel: InventoryPanel;
  private readonly craftingPanel: CraftingPanel;
  private readonly pauseMenu: PauseMenu;
  private readonly endScreen: EndScreen;
  private readonly title: TitleScreen;
  private readonly debug: DebugOverlay;
  private readonly toast: Toast;
  private readonly fps = new FpsMeter();

  private raf = 0;
  private last = 0;
  private acc = 0;
  private hudTimer = 0;
  private running = false;
  private overlay: Overlay = 'title';
  private settings: SettingsData;
  private touchMode: boolean;
  private pauseOpenedAt = 0;
  private playTime = 0;

  private saveCooldown = 0;
  private saveDirty = false;
  private autosaveTimer: number = CONFIG.save.autosaveInterval;

  private readonly tmpDir = new THREE.Vector3();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    uiRoot: HTMLElement
  ) {
    this.world = new World();
    this.player = new PlayerController(this.world.spawn);
    this.player.groundFn = this.world.groundAt;
    this.input = new InputManager();
    this.audio = new AudioManager();
    this.flashlight = new Flashlight(this.world.scene);
    this.tension = new TensionDirector(this.audio, this.flashlight);
    this.objective = new Objective(this.world.scene, this.world.colliders);
    // fuse parts are pickups like any other (the interaction ray sees them)
    this.world.pickups.push(...this.objective.fusePickups);

    this.inventory = new Inventory();
    this.crafting = new Crafting(this.inventory);

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.render.fov,
      window.innerWidth / window.innerHeight,
      CONFIG.render.near,
      CONFIG.render.far
    );

    this.interaction = new Interaction(this.camera, this.world.pickups);
    this.interaction.onTargetChange = () => this.refreshInteractPrompt();
    this.postfx = new PostFX(renderer, this.world.scene, this.camera);

    this.touch = new TouchControls(uiRoot, this.input);
    this.touch.onFlashlightTap = () => this.onFlashlightTap();
    this.touch.onInteractTap = () => this.onInteractTap();

    this.hud = new HUD(uiRoot, {
      onToggleMute: (m) => this.audio.setMuted(m),
      onOpenInventory: () => this.togglePanel('inventory'),
      onOpenCrafting: () => this.togglePanel('crafting'),
      onOpenPause: () => this.openPanel('paused')
    });
    this.toast = new Toast(uiRoot);

    this.inventoryPanel = new InventoryPanel(uiRoot, this.inventory, {
      onClose: () => this.closePanel(),
      onUse: (id) => this.useItem(id)
    });
    this.craftingPanel = new CraftingPanel(uiRoot, this.crafting, {
      onClose: () => this.closePanel(),
      onCraft: (r) => this.craftRecipe(r)
    });
    this.pauseMenu = new PauseMenu(uiRoot, {
      onResume: () => this.closePanel(),
      onRestart: () => {
        this.hardReset();
        if (!this.touchMode) this.input.requestPointerLock();
      },
      onSettingsChange: (s) => this.applySettings(s),
      getSettings: () => this.settings
    });
    this.endScreen = new EndScreen(uiRoot, {
      onRestart: () => this.beginPlay(() => this.hardReset()),
      onLoadSave: () => this.beginPlay(() => this.loadSave())
    });
    this.title = new TitleScreen(uiRoot, {
      onContinue: () => this.beginPlay(() => this.loadSave()),
      onNewGame: () => this.beginPlay(() => this.hardReset())
    });
    this.debug = new DebugOverlay(uiRoot);

    this.quality = new QualityManager();
    this.quality.onApply = () => this.applyQuality();
    this.settings = SettingsStore.load();
    this.applySettings(this.settings, false);

    this.touchMode = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.setTouchMode(this.touchMode);
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' && !this.touchMode) this.setTouchMode(true);
        else if (e.pointerType === 'mouse' && this.touchMode) this.setTouchMode(false);
      },
      { capture: true }
    );

    // ---- gameplay hooks ----
    this.player.onFootstep = (sprinting, indoors) => this.audio.footstep(sprinting, indoors);
    this.objective.onPowerRestored = () => {
      this.toast.show('Power restored. The gate is opening: head north.', 3.2);
      this.audio.powerRestored();
      this.queueSave();
    };
    this.inventory.onChange = () => this.refreshPanels();

    this.syncHud();
    this.hud.setVisible(false);

    // ---- keyboard ----
    window.addEventListener('keydown', (e) => this.onKey(e));

    // desktop: losing pointer lock mid-game (Esc, alt-tab) pauses, like any PC game
    // (only when the lock was really held: a refused or superseded request also fires this event)
    let locked = false;
    document.addEventListener('pointerlockchange', () => {
      const now = !!document.pointerLockElement;
      if (locked && !now && this.overlay === 'none' && !this.touchMode) this.openPanel('paused');
      locked = now;
    });

    // save when the tab is closed or hidden
    window.addEventListener('pagehide', () => this.writeSave());

    this.title.show(SaveSystem.exists());
  }

  // ---------------- lifecycle ----------------

  handleResize(): void {
    this.applyQuality();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.audio.resumeContext();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Tab hidden: stop the loop, silence audio, save right away (the loop that would save is stopped). */
  pause(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.audio.suspendContext();
    this.input.releaseAll();
    this.writeSave();
    if (this.overlay === 'none') this.openPanel('paused');
  }

  resume(): void {
    this.start();
  }

  dispose(): void {
    this.pause();
    this.input.dispose();
    this.audio.dispose();
    this.postfx.dispose();
  }

  /** Title / end-screen buttons: unlock audio (needs the click), then start playing. */
  private beginPlay(setup: () => void): void {
    this.audio.unlock().then(() => this.audio.start()).catch(() => {});
    this.title.hide();
    setup();
    this.hud.setVisible(true);
    if (!this.touchMode) this.input.requestPointerLock();
  }

  private setTouchMode(on: boolean): void {
    this.touchMode = on;
    this.touch.setVisible(on);
    this.hud.setTouchMode(on);
  }

  // ---------------- input ----------------

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    const o = this.overlay;
    if (o === 'title' || o === 'win' || o === 'lose') return;

    switch (e.code) {
      case 'Escape':
        if (this.pauseMenu.settingsOpen) this.pauseMenu.hideSettings();
        else if (o === 'paused') {
          if (performance.now() - this.pauseOpenedAt > 250) this.closePanel();
        } else if (o === 'none') this.openPanel('paused');
        else this.closePanel();
        break;
      case 'KeyE':
        if (o === 'none') this.onInteractTap();
        break;
      case 'KeyF':
        if (o === 'none') this.onFlashlightTap();
        break;
      case 'KeyI':
      case 'Tab':
        e.preventDefault();
        this.togglePanel('inventory');
        break;
      case 'KeyC':
        this.togglePanel('crafting');
        break;
      case 'Backquote':
        this.debug.toggle();
        break;
    }
  }

  // ---------------- settings & quality ----------------

  private applySettings(s: SettingsData, persist = true): void {
    const qualityChanged = !this.settings || this.settings.quality !== s.quality;
    this.settings = s;
    if (persist) SettingsStore.save(s);
    this.audio.setVolume(s.volume);
    this.player.lookScale = s.sensitivity;
    this.player.invertY = s.invertY;
    if (qualityChanged) this.quality.setMode(s.quality);
    this.applyQuality();
  }

  private applyQuality(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const q = this.quality.settings;
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.render.maxDPR) * q.dprScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.postfx.setEnabled(q.postfx);
    this.postfx.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.flashlight.beamEnabled = q.beam;
    this.world.fogScale = q.fogScale;
  }

  // ---------------- save ----------------

  private queueSave(): void {
    this.saveDirty = true;
  }

  private writeSave(): void {
    // never write a dead player or a finished run
    if (this.overlay === 'title' || this.overlay === 'lose' || this.overlay === 'win') return;
    if (this.player.health <= 0) return;
    const pickupsTaken: string[] = [];
    for (const p of this.world.pickups) if (p.taken) pickupsTaken.push(p.mesh.name);

    const data: SaveDataV1 = {
      version: 1,
      player: {
        x: this.player.position.x,
        z: this.player.position.z,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
        health: this.player.health,
        stamina: this.player.stamina
      },
      flashlight: { battery: this.flashlight.battery, on: this.flashlight.isOn },
      inventory: this.inventory.toJSON(),
      objective: { powerRestored: this.objective.powerRestored },
      pickupsTaken,
      savedAt: Date.now()
    };
    SaveSystem.save(data);
    this.saveDirty = false;
  }

  private applySave(data: SaveDataV1): void {
    this.closeAllPanels();
    this.player.setPose(data.player.x, data.player.z, data.player.yaw, data.player.pitch);
    this.player.health = data.player.health > 0 ? Math.min(data.player.health, CONFIG.health.max) : CONFIG.health.respawnHp;
    this.player.stamina = Number.isFinite(data.player.stamina) ? data.player.stamina : CONFIG.player.maxStamina;

    this.flashlight.setBattery(data.flashlight.battery);
    this.flashlight.setOn(data.flashlight.on !== false);

    this.inventory.loadFrom(data.inventory);

    const taken = new Set(data.pickupsTaken);
    for (const p of this.world.pickups) {
      p.taken = taken.has(p.mesh.name);
      p.mesh.visible = !p.taken;
    }
    this.objective.applySave(data.objective.powerRestored);
    this.overlay = 'none';
    this.interaction.forceRefresh();
    this.syncHud();
  }

  private loadSave(): void {
    const data = SaveSystem.load();
    if (!data) {
      this.hardReset();
      return;
    }
    this.endScreen.hide();
    this.applySave(data);
    this.toast.show('Save loaded');
  }

  // ---------------- overlays ----------------

  private togglePanel(kind: 'inventory' | 'crafting'): void {
    if (this.overlay === kind) this.closePanel();
    else if (this.overlay === 'none') this.openPanel(kind);
    else if (this.overlay === 'inventory' || this.overlay === 'crafting') {
      this.closePanel();
      this.openPanel(kind);
    }
  }

  private openPanel(kind: 'inventory' | 'crafting' | 'paused'): void {
    if (this.overlay !== 'none') return;
    this.overlay = kind;
    this.input.releaseAll();
    this.input.enabled = false;
    this.input.exitPointerLock();
    this.hud.setInteractPrompt(null);
    this.touch.setInteract(false);
    if (kind === 'inventory') this.inventoryPanel.open();
    else if (kind === 'crafting') this.craftingPanel.open();
    else {
      this.pauseOpenedAt = performance.now();
      this.pauseMenu.open();
      this.queueSave();
    }
  }

  private closePanel(): void {
    if (this.overlay !== 'inventory' && this.overlay !== 'crafting' && this.overlay !== 'paused') return;
    this.closeAllPanels();
    this.overlay = 'none';
    this.input.enabled = true;
    this.acc = 0;
    if (!this.touchMode) this.input.requestPointerLock();
    this.refreshInteractPrompt();
  }

  private closeAllPanels(): void {
    this.inventoryPanel.close();
    this.craftingPanel.close();
    this.pauseMenu.close();
  }

  private refreshPanels(): void {
    if (this.inventoryPanel.isOpen()) this.inventoryPanel.refresh();
    if (this.craftingPanel.isOpen()) this.craftingPanel.refresh();
  }

  private refreshInteractPrompt(): void {
    if (this.overlay !== 'none') return;
    const t = this.interaction.target;
    if (t) {
      this.hud.setInteractPrompt(`Take ${ITEMS[t.itemId].name}`);
      this.touch.setInteract(true, 'TAKE');
      return;
    }
    const hint = this.objective.getInteractHint(this.player.position);
    if (hint) {
      this.hud.setInteractPrompt(hint);
      this.touch.setInteract(true, 'USE');
      return;
    }
    this.hud.setInteractPrompt(null);
    this.touch.setInteract(false);
  }

  private syncHud(): void {
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setBattery(this.flashlight.battery / CONFIG.flashlight.maxBattery);
    this.hud.setStamina(this.player.stamina / CONFIG.player.maxStamina);
    this.hud.setObjective(this.objective.getObjectiveText());
    this.hud.setInteractPrompt(null);
    this.touch.setInteract(false);
    this.postfx.setHurt(0);
  }

  // ---------------- gameplay ----------------

  private applyDamage(amount: number): void {
    if (this.overlay !== 'none' && this.overlay !== 'inventory' && this.overlay !== 'crafting') return;
    this.player.damage(amount);
    this.hud.flashDamage();
    this.audio.enemyContact();
    if (this.player.health <= 0) this.gameOver();
  }

  private gameOver(): void {
    this.closeAllPanels();
    this.overlay = 'lose';
    this.saveDirty = false;
    this.input.releaseAll();
    this.input.exitPointerLock();
    this.audio.died();
    this.hud.setVisible(false);
    this.toast.clear();
    this.endScreen.show('lose', SaveSystem.exists(), this.playTime);
  }

  private win(): void {
    this.overlay = 'win';
    SaveSystem.clear();
    this.saveDirty = false;
    this.input.releaseAll();
    this.input.exitPointerLock();
    this.audio.win();
    this.hud.setVisible(false);
    this.toast.clear();
    this.endScreen.show('win', false, this.playTime);
  }

  private hardReset(): void {
    SaveSystem.clear();
    this.closeAllPanels();
    this.inventory.clear();
    this.player.respawn(this.world.spawn, CONFIG.health.max);
    this.flashlight.setBattery(CONFIG.flashlight.maxBattery);
    this.flashlight.setOn(true);
    for (const p of this.world.pickups) {
      p.taken = false;
      p.mesh.visible = true;
    }
    this.objective.reset();
    this.endScreen.hide();
    this.overlay = 'none';
    this.input.enabled = true;
    this.playTime = 0;
    this.autosaveTimer = CONFIG.save.autosaveInterval;
    this.interaction.forceRefresh();
    this.syncHud();
    this.hud.setVisible(true);
    this.queueSave();
  }

  private onFlashlightTap(): void {
    if (this.overlay !== 'none') return;
    if (this.flashlight.isDead) {
      this.toast.show('The flashlight is dead. Find a battery.');
      this.audio.denied();
      return;
    }
    if (this.flashlight.toggle()) this.audio.flashlightClick(this.flashlight.isOn);
  }

  private onInteractTap(): void {
    if (this.overlay !== 'none') return;

    // an aimed-at pickup wins over the fuse box
    const t = this.interaction.target;
    if (!t || t.taken) {
      const res = this.objective.tryInteract(this.player.position);
      if (res === 'need_fuses') {
        const need = CONFIG.objective.fuseCount - this.objective.fusesCollected;
        this.toast.show(`The fuse box needs ${need} more part${need === 1 ? '' : 's'}`);
        this.audio.denied();
      }
      if (res !== 'none') {
        this.hud.setObjective(this.objective.getObjectiveText());
        this.refreshInteractPrompt();
      }
      return;
    }

    t.taken = true;
    t.mesh.visible = false;
    if (t.itemId === 'fuse_part') {
      const count = this.objective.addFuse();
      this.toast.show(`Fuse part ${count}/${CONFIG.objective.fuseCount}`);
      this.audio.fuseCollected();
    } else {
      this.inventory.add(t.itemId, 1);
      this.toast.show(`Picked up ${ITEMS[t.itemId].name}`);
      this.audio.itemPickup();
    }
    this.hud.setObjective(this.objective.getObjectiveText());
    this.queueSave();
    this.interaction.forceRefresh();
    this.refreshInteractPrompt();
  }

  private useItem(id: ItemId): void {
    const full = CONFIG.flashlight.maxBattery;
    if (id === 'battery' || id === 'repairkit') {
      if (this.flashlight.battery >= full - 0.5) {
        this.toast.show('The flashlight is already full');
        return;
      }
      if (!this.inventory.remove(id, 1)) return;
      this.flashlight.refill(id === 'battery' ? CONFIG.items.batteryRawRefill : CONFIG.items.repairkitRefill);
      this.flashlight.setOn(true);
      this.toast.show(id === 'battery' ? 'Battery swapped in' : 'Flashlight fully charged');
      this.audio.itemUse();
    } else if (id === 'medkit') {
      if (this.player.health >= this.player.maxHealth) {
        this.toast.show('Health already full');
        return;
      }
      if (!this.inventory.remove('medkit', 1)) return;
      this.player.heal(CONFIG.items.medkitHeal);
      this.toast.show('Wounds dressed');
      this.audio.itemUse();
    }
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.setBattery(this.flashlight.battery / full);
    this.refreshPanels();
    this.queueSave();
  }

  private craftRecipe(recipe: Recipe): void {
    if (this.crafting.craft(recipe)) {
      this.toast.show(`Crafted ${ITEMS[recipe.output.id].name}`);
      this.audio.craftDone();
      this.refreshPanels();
      this.queueSave();
    } else {
      this.toast.show('Not enough materials');
      this.audio.denied();
    }
  }

  // ---------------- main loop ----------------

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);

    const dt = Math.min((now - this.last) / 1000, CONFIG.sim.maxFrameTime);
    this.last = now;
    this.fps.update(dt);
    this.quality.update(dt, this.fps.value);

    const o = this.overlay;
    // the world keeps living behind the bag/craft panels (it is dangerous to rummage
    // in the open); pause, title and end screens freeze it
    const simulate = o === 'none' || o === 'inventory' || o === 'crafting';
    const controlling = o === 'none';

    if (simulate) {
      this.playTime += dt;
      if (controlling) {
        const look = this.input.consumeLook();
        this.player.applyLook(look.x, look.y);
        this.input.sampleKeyboard();
      } else {
        this.input.consumeLook();
        this.input.move.x = 0;
        this.input.move.y = 0;
      }

      this.acc += dt;
      let steps = 0;
      while (this.acc >= CONFIG.sim.fixedDT && steps < 6) {
        this.player.step(CONFIG.sim.fixedDT, this.input, this.world.colliders);
        this.acc -= CONFIG.sim.fixedDT;
        steps++;
      }
      if (steps >= 6) this.acc = 0;

      this.player.applyToCamera(this.camera);
      this.camera.getWorldDirection(this.tmpDir);
      this.flashlight.update(dt, this.camera.position, this.tmpDir, this.camera.quaternion);
      this.world.update(dt, this.player.position);
      this.objective.update(dt);
      this.audio.setIndoors(this.world.isIndoors(this.player.position));

      this.tension.update(dt, Infinity, false);

      if (controlling) {
        this.interaction.update(dt);
        if (this.objective.checkWin(this.player.position)) this.win();
      }

      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) {
        this.autosaveTimer = CONFIG.save.autosaveInterval;
        this.queueSave();
      }

      const hp = this.player.health / this.player.maxHealth;
      this.postfx.setHurt(hp < 0.5 ? (0.5 - hp) * 2 : 0);
    } else {
      this.input.consumeLook();
    }

    this.toast.update(dt);
    this.postfx.render(dt);

    this.saveCooldown -= dt;
    if (this.saveDirty && this.saveCooldown <= 0) {
      this.saveCooldown = 1;
      this.writeSave();
    }

    this.hudTimer += dt;
    if (this.hudTimer >= 0.1) {
      this.hudTimer = 0;
      this.hud.setStamina(this.player.stamina / CONFIG.player.maxStamina);
      this.hud.setBattery(this.flashlight.battery / CONFIG.flashlight.maxBattery);
      this.hud.setHealth(this.player.health, this.player.maxHealth);
      this.hud.setFps(this.fps.value);
      this.touch.setFlashlightState(this.flashlight.isOn, this.flashlight.isDead);
      if (controlling) this.refreshInteractPrompt();
      const info = this.renderer.info.render;
      this.debug.update(this.fps.value, info.calls, info.triangles, this.quality.tier);
    }
  };
}
