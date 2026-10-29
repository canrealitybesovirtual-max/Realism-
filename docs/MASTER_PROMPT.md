# MASTER PROMPT — UPGRADE MY EXISTING GAME TO BODYCAM-LEVEL REALISM (PC + META QUEST VR)

> Saved verbatim from the user's request (2026-10-29). This is the governing brief for all work on the CQC game.
>
> Session notes from the user:
> - Target project: the user's existing **CQC game**, delivered as a zip ("office zip").
> - Claude may run the game; the user will test after changes are made.
> - Take in-game screenshots roughly every 10 minutes while working, as progress checkpoints.

## 1. YOUR ROLE

Act as a senior game-engine programmer, rendering engineer, technical artist, VR/XR specialist, physics programmer, animation engineer, audio engineer, and performance optimization expert.

Your task is to upgrade my EXISTING game to achieve the highest practical level of visual, physical, and audio realism inspired by BODYCAM-style first-person shooters.

My game already exists. I do NOT want you to create a replacement game, start a new project, or rewrite functioning systems unnecessarily.

I want you to improve my original project by carefully modifying, extending, optimizing, and integrating its existing systems.

Treat the current project as the source of truth.

## 2. MOST IMPORTANT RULE: PRESERVE MY EXISTING GAME

Before making changes:

1. Inspect the existing project structure, engine, version, rendering pipeline, scripts, scenes, prefabs, materials, shaders, assets, physics, animation, input, audio, UI, and VR integration.
2. Identify how the current game works and how its systems depend on each other.
3. Locate existing implementations before creating replacements.
4. Identify existing functionality that must remain unchanged.
5. Determine which improvements can be made by modifying existing files and which genuinely require new files.
6. Establish a safe rollback point using version control or a backup where available.
7. Create a prioritized implementation plan based on the actual project, not assumptions.

### Non-negotiable preservation rules

* Do not delete or replace my game.
* Do not create a separate game instead of upgrading mine.
* Do not rewrite the entire project just to add visual effects.
* Do not replace working systems with generic implementations.
* Do not remove existing mechanics, levels, assets, UI, weapons, interactions, or features.
* Do not rename public classes, methods, variables, files, scene nodes, prefabs, or resources without a demonstrated need.
* Do not change existing gameplay behavior unless it is necessary for an explicitly requested improvement.
* Preserve existing save data, input bindings, scene references, asset references, networking, and configuration wherever applicable.
* Avoid introducing dependencies or plugins unless they are necessary and compatible with the current engine.
* Never overwrite original assets destructively when a material variant, non-destructive edit, configuration option, or additional resource can achieve the same result.
* Do not silently change project-wide rendering or physics settings that could affect unrelated systems.
* Keep changes modular, reversible, and compatible with the existing project.
* If a feature already exists, improve it instead of duplicating it.
* If a proposed change risks breaking existing behavior, explain the risk and implement the safest alternative.
* Do not claim a feature works unless you have verified it to the extent possible in the available environment.

If you have file-editing tools, work directly on the existing project and preserve unrelated files. If you cannot access the project files, ask me to provide the relevant files or repository before attempting project-specific modifications.

## 3. FIRST: IDENTIFY THE ACTUAL ENGINE AND CAPABILITIES

My intended targets are:

* Desktop PC.
* Standalone Meta Quest VR.
* A BODYCAM-inspired realistic first-person shooter.
* Advanced-level technical implementation.
* The existing game and its current architecture.

The engine has not yet been confirmed in this prompt. Detect it from the actual project files.

Do not assume I am using Unreal Engine, Unity, Godot, or any other engine.

Determine:

* Engine and version.
* Programming language.
* Rendering pipeline and graphics API.
* Shader/material system.
* Physics engine.
* Animation system.
* Audio system.
* Desktop rendering configuration.
* OpenXR or other VR integration.
* Meta Quest deployment configuration.
* Current rendering features and hardware compatibility.
* Existing build and testing workflow.

Use APIs and rendering features that actually exist in my engine and version.

If the engine cannot support a desired effect directly, explain the limitation and implement the closest practical alternative.

Do not fabricate APIs, settings, plugins, or functions.

## 4. CREATE A NON-DESTRUCTIVE UPGRADE ARCHITECTURE

Prefer extending the current project through modular systems.

Where appropriate, create or extend:

* A platform-aware graphics configuration.
* PC and Quest rendering profiles.
* Reusable physically based materials.
* A camera post-processing configuration.
* Lighting and exposure settings.
* Weapon animation and inertia settings.
* Surface-aware footsteps and impact audio.
* Physics material mappings.
* Environmental detail and damage systems.
* Performance profiling and quality settings.
* VR comfort settings.

These are conceptual responsibilities, not instructions to create duplicate systems when equivalent implementations already exist.

Use the existing architecture whenever possible.

Separate platform-specific rendering from shared gameplay logic.

Keep weapons, physics, animation, interactions, AI, and world behavior consistent across PC and Quest unless a technical constraint requires a documented difference.

Use feature flags or configuration options where they help preserve the original experience and make changes reversible.

## 5. REALISM MASTER LIST

Audit every category below against the existing game.

For each technique, determine whether it is already implemented, needs improvement, is unsuitable for the engine, or should be deferred.

Do not implement every effect blindly. Prioritize improvements that genuinely increase realism.

### A. Camera and image processing

Improve the desktop camera presentation using appropriate combinations of:

* Realistic exposure and highlight handling.
* Natural color grading and white balance.
* Controlled contrast and shadow detail.
* Subtle wide-angle lens characteristics.
* Very restrained vignette.
* Optional sensor noise or film grain.
* Subtle bloom around bright sources.
* Optional lens flare where physically plausible.
* Careful sharpening and antialiasing.
* Appropriate resolution scaling.
* Motion blur only where it improves the desktop experience.
* Depth of field only where appropriate.
* Chromatic aberration only if it contributes meaningfully.
* Consistent rendering and color-management settings.

Do not apply every effect automatically.

First improve lighting, materials, geometry, and exposure. Then add subtle camera effects.

Avoid making the image excessively dark, noisy, blurry, distorted, oversaturated, or artificially cinematic.

Do not imitate camera imperfections at the expense of visibility or gameplay.

### B. Lighting and illumination

Improve:

* Global illumination.
* Indirect lighting.
* Contact shadows.
* Shadow softness.
* Light-source size and falloff.
* Flashlight beams.
* Flashlight hotspots.
* Local light color and temperature.
* Window and doorway illumination.
* Interior-to-exterior exposure transitions.
* Reflections.
* Ambient occlusion or equivalent techniques.
* Light attenuation.
* Volumetric fog and dust where affordable.
* Shadow stability and temporal artifacts.
* Light leaks and other rendering errors.

For PC, use the best supported dynamic or baked lighting approach that fits the hardware target.

For standalone Quest, favor baked lighting, probes, carefully selected dynamic lights, simplified reflections, and inexpensive shadow techniques where appropriate.

Avoid excessive real-time lights and unnecessary shadow casters on Quest.

Keep lighting physically plausible. Darkness should create atmosphere without making navigation or combat unreadable.

### C. Physically based materials

Audit and improve the material library.

Support appropriate physically based parameters, including:

* Base color.
* Roughness.
* Metallic response.
* Normal maps.
* Surface microdetail.
* Ambient and indirect lighting response.
* Transparency when necessary.
* Material-specific wear and damage.

Create or improve reusable materials for:

* Concrete.
* Painted metal.
* Bare metal.
* Wood.
* Plastic.
* Glass.
* Rubber.
* Fabric.
* Leather.
* Dirt and mud.
* Wet surfaces.
* Painted walls.
* Ceramic and tile.
* Weapon finishes.

Add realistic variation in roughness, surface imperfections, scratches, stains, chipped paint, fingerprints where visible, edge wear, and dirt accumulation.

Ensure these details follow plausible real-world material behavior.

Do not make every material shiny or excessively dirty.

Reuse existing textures and materials where appropriate.

Use material variants and shared shader functions rather than duplicating large numbers of unique materials.

### D. Geometry and environmental detail

Improve the environment without rebuilding existing levels unnecessarily.

Prioritize:

* Accurate real-world scale.
* Believable room proportions.
* Detailed close-range objects.
* Correct silhouettes.
* Natural object placement.
* Realistic debris and clutter.
* Environmental storytelling.
* Damaged walls and floors.
* Furniture imperfections.
* Door handles, hinges, switches, and small props.
* Natural transitions between different materials.
* Variation in surface wear.
* Plausible object density.
* Convincing foreground, middle-distance, and background detail.

Use photogrammetry or scanned assets when appropriate and legally available.

Do not assume every asset needs photogrammetry.

Preserve existing maps, layouts, collision, navigation, interactions, and gameplay spaces.

Improve assets in place when possible.

Use geometry for important silhouettes and large physical details, and normal maps or decals for smaller surface details.

### E. Camera, player movement, and body representation

Improve the feeling that the camera belongs to a physical person.

Where compatible with the current game, refine:

* Body movement.
* Weapon inertia.
* Acceleration and deceleration.
* Weapon settling.
* Turning response.
* Hand and arm positioning.
* Foot placement.
* Animation transitions.
* Interaction poses.
* Reload timing.
* Equipment movement.
* Physical contact with objects.
* Body alignment with stairs and slopes.

Avoid exaggerated procedural movement.

On PC, subtle camera movement may be used where it improves the experience.

On VR, preserve direct headset tracking. Do not force the player's head to follow simulated body movement.

Never add forced head bob, artificial head rotation, or camera shake that conflicts with the player's real movements.

Use the weapon, hands, body animation, sound, and environmental response to communicate physical weight instead.

### F. Weapon realism

Preserve existing weapons and their functionality.

Improve the existing systems where possible:

* Weapon handling.
* Hand placement.
* Grip alignment.
* Support-hand positioning.
* Weapon inertia.
* Animation transitions.
* Reload animations.
* Weapon inspection.
* Equipment handling.
* Recoil presentation.
* Weapon sound.
* Muzzle flash.
* Smoke and particles.
* Environmental lighting from weapon effects where supported.
* Physical interaction and collision.
* Surface-specific impact effects.
* Consistent weapon behavior across PC and VR.

Make recoil and weapon motion believable rather than excessive.

Do not introduce gameplay changes that unintentionally alter weapon balance, firing behavior, ammunition, reload mechanics, or existing input bindings.

Keep gameplay logic shared wherever practical, while allowing platform-specific presentation and interaction.

### G. Physics and object interaction

Improve existing physics and interaction systems rather than creating competing replacements.

Audit:

* Mass and inertia.
* Collision shapes.
* Friction and restitution.
* Rigid-body stability.
* Object settling.
* Collision response.
* Physical materials.
* Object grabbing.
* Door opening.
* Handle and switch interactions.
* Drawer movement.
* Loose objects.
* Breakable objects.
* Destruction.
* Debris.
* Cloth or flexible objects where practical.
* Multiplayer synchronization if the game supports networking.

Heavy objects should feel different from lightweight objects.

Objects should not slide, bounce, float, or rotate without a plausible cause.

Keep the number of active physics objects manageable, especially on Quest.

Use simpler collision geometry where possible.

Prefer authored damage states, pooled debris, and selective simulation over expensive universal destruction.

### H. Environmental interaction and surface response

Create a coherent system for matching interactions to the world.

Where supported, use physical material or surface-type data to determine:

* Footstep sounds.
* Impact sounds.
* Bullet impact effects.
* Dust and debris.
* Scratches and damage.
* Material-specific collision response.
* Wetness or surface changes.
* Object interaction feedback.

Ensure the system uses existing material and collision information instead of requiring every asset to be manually duplicated.

Avoid creating expensive particle effects for every minor interaction.

### I. Audio realism

Improve the existing audio architecture.

Support:

* Spatial audio.
* Distance attenuation.
* Occlusion.
* Obstruction.
* Environmental reverb.
* Room-dependent acoustics.
* Surface-specific footsteps.
* Weapon transients and tails.
* Impact sounds.
* Object handling sounds.
* Equipment and clothing sounds.
* Distant ambience.
* Wind and environmental sound.
* Dynamic sound variation.
* Appropriate frequency filtering with distance.
* Realistic transitions between indoor and outdoor spaces.
* Correct positional audio as the VR player turns their head.

Use multiple sound layers where they improve the result.

Avoid excessive reverb, constant noise, repetitive samples, unnecessary simultaneous voices, and excessive loudness.

Keep the audio mix clear and spatially coherent.

On Quest, use supported spatial audio features and optimize voice count and processing cost.

### J. Gameplay presentation and user interface

Preserve the existing UI and all required gameplay information.

Where appropriate, reduce unnecessary interface clutter to reinforce the body-camera presentation.

Improve:

* UI integration with the world.
* Weapon information presentation.
* Interaction feedback.
* Readability.
* Animation timing.
* Environmental feedback.
* Realistic but clear visual effects.
* Consistency between desktop and VR interactions.

Do not remove essential ammunition, health, objective, accessibility, or safety information merely to imitate BODYCAM.

VR interfaces must remain comfortable to read and must not cause eye strain.

### K. AI and environmental behavior

If the game includes AI, improve the believability of existing systems through:

* Plausible reaction timing.
* Coherent movement.
* Appropriate perception.
* Believable animation transitions.
* Spatial awareness.
* Consistent interaction with obstacles.
* Realistic sound and visual reactions.
* Less repetitive behavior.

Preserve existing AI logic, navigation, difficulty, and gameplay balance unless a specific change is required.

Do not introduce unnecessary AI complexity or expensive simulations that do not materially improve the experience.

## 6. META QUEST VR REQUIREMENTS

The standalone Quest version must remain a real VR experience, not merely a desktop game rendered inside a headset.

Respect the current XR framework and platform capabilities.

### Mandatory VR principles

* Preserve native headset tracking.
* Maintain correct stereo rendering.
* Avoid artificial fisheye post-processing.
* Avoid forced camera shake and head bob.
* Avoid ordinary gameplay depth-of-field blur.
* Avoid motion blur that compromises comfort.
* Maintain low motion-to-photon latency.
* Avoid sudden frame-time spikes.
* Maintain correct world scale.
* Prevent near-camera clipping of hands and objects.
* Ensure effects render correctly in both eyes.
* Keep interaction targets comfortable and reachable.
* Support appropriate seated and standing play.
* Provide suitable locomotion and turning comfort options.
* Avoid unwanted movement of the player's head relative to their physical movement.
* Maintain correct spatial audio orientation.
* Preserve the existing VR interaction system.
* Ensure weapon grips and hand poses remain stable.
* Avoid shader compilation or asset loading stutters during gameplay.

Use the target headset's supported refresh rates and rendering capabilities.

Where applicable, investigate fixed foveated rendering, multiview or instanced stereo rendering, supported upscaling, and other engine-specific optimizations.

Verify every feature against the actual engine, graphics API, Quest model, and runtime.

Do not assume a feature supported on desktop is supported in standalone VR.

### VR performance priorities

Optimize in this order:

1. Establish a stable baseline frame rate on the actual headset.
2. Measure CPU and GPU frame times.
3. Identify the true bottleneck.
4. Reduce unnecessary draw calls.
5. Reduce expensive transparent overdraw.
6. Simplify shaders.
7. Optimize dynamic lighting and shadows.
8. Reduce unnecessary geometry and texture memory.
9. Add appropriate mesh LODs.
10. Improve culling and instancing.
11. Tune rendering resolution.
12. Evaluate foveated rendering where supported.
13. Test thermal behavior and long sessions.
14. Retest the busiest combat scenes.

Do not reduce visual quality indiscriminately. Preserve the details that contribute most to perceived realism.

## 7. PC GRAPHICS REQUIREMENTS

The PC version may use more advanced rendering techniques where supported and affordable.

Evaluate:

* Dynamic global illumination.
* Advanced reflections.
* Higher-quality shadowing.
* More detailed geometry.
* Higher texture resolution.
* More complex materials.
* Volumetric effects.
* More detailed particles.
* Additional environmental physics.
* Optional cinematic camera processing.
* Higher-quality antialiasing.
* Resolution scaling.
* GPU-appropriate quality presets.

Choose techniques based on measured performance and actual engine support.

Do not force all players to use maximum-quality settings.

Provide sensible quality presets and preserve existing graphics settings where possible.

Keep PC and Quest visually consistent in art direction, materials, scale, environment design, sound, and gameplay.

## 8. PERFORMANCE AND MEMORY MANAGEMENT

Profile the existing game before optimizing.

Measure:

* CPU time.
* GPU time.
* Frame pacing.
* Draw calls.
* Render passes.
* Shader complexity.
* Texture memory.
* Mesh memory.
* Audio memory and voice count.
* Physics cost.
* Animation cost.
* Particle cost.
* Garbage collection or allocation spikes where applicable.
* Asset streaming.
* Loading time.
* Network performance if multiplayer exists.

Implement improvements only where measurement or clear architectural evidence justifies them.

Use:

* LODs.
* Instancing.
* Culling.
* Texture streaming.
* Texture atlases where appropriate.
* Object pooling.
* Simplified collision meshes.
* Selective physics.
* Reduced shader complexity.
* Appropriate asset compression.
* Quality presets.
* Efficient audio voice management.
* Level streaming where suitable.

Do not optimize blindly or sacrifice important visual details without evaluating their impact.

Test packaged builds on target hardware.

## 9. IMPLEMENTATION WORKFLOW

Work incrementally.

### Phase 1: Audit

Inspect the project and produce a concise report identifying:

* Engine and version.
* Existing architecture.
* Important systems and dependencies.
* Current realism strengths.
* Visual and technical weaknesses.
* Quest compatibility.
* Performance bottlenecks.
* Files likely to require modification.
* Risks and compatibility concerns.

Do not modify project files during the initial audit unless necessary to inspect or safely build the project.

### Phase 2: Plan

Create a prioritized task list with these categories:

* Critical correctness issues.
* High-impact realism improvements.
* VR comfort and compatibility.
* Performance optimization.
* Optional visual polish.
* Future improvements.

For each task, explain the expected benefit, affected files or systems, dependencies, risks, and validation method.

### Phase 3: Establish a baseline

Where the project can be built and run:

* Build the existing PC version.
* Build the existing Quest version.
* Record available performance metrics.
* Test existing controls, gameplay, UI, physics, audio, and interactions.
* Identify current bugs before introducing changes.

Do not claim a baseline has been tested if you cannot run the project or access the target hardware.

### Phase 4: Implement high-value changes

Begin with improvements that are both impactful and low-risk:

1. Fix obvious rendering errors.
2. Improve existing materials.
3. Improve lighting and exposure.
4. Improve close-range environmental detail.
5. Refine existing weapon and hand animations.
6. Improve surface-specific audio.
7. Improve object interaction and physical response.
8. Add carefully selected PC post-processing.
9. Optimize the Quest rendering path.
10. Add optional polish only after validation.

Change a small, coherent group of systems at a time.

Build and test after each significant group of changes.

### Phase 5: Validate

After each change:

* Compile or build the affected project.
* Check logs and errors.
* Confirm asset and scene references remain valid.
* Confirm existing controls still work.
* Confirm existing gameplay remains intact.
* Test the affected visual or physical behavior.
* Test PC and Quest separately where applicable.
* Measure performance when the change affects rendering or simulation.
* Revert or correct changes that introduce regressions.

If you cannot test a feature directly, explain exactly what remains unverified and give me a practical validation procedure.

### Phase 6: Deliver

At the end, provide:

* A summary of modifications.
* The files changed and why.
* Any new files and why they were needed.
* Existing features preserved.
* Performance results, if measured.
* Known limitations.
* Required engine settings.
* Build and deployment instructions.
* Manual testing steps.
* Any remaining work.

Keep a concise change log so every modification can be reviewed and reversed.

## 10. PRIORITIZATION SYSTEM

Rank proposed changes using:

* Visual realism improvement.
* Physical realism improvement.
* Audio improvement.
* VR comfort.
* Performance impact.
* Implementation complexity.
* Risk of breaking existing systems.
* Compatibility with the engine and target hardware.

Prioritize high-impact, low-risk changes.

Do not spend substantial effort on subtle lens effects while the underlying lighting, geometry, materials, or animation remain unrealistic.

Do not add a system merely because it appears on this list.

## 11. STRICT CODING AND EDITING RULES

When modifying existing code:

* Read the complete relevant file before editing.
* Understand its callers and dependencies.
* Preserve unrelated functionality.
* Follow the existing coding style.
* Reuse existing utilities.
* Avoid unnecessary dependencies.
* Avoid duplicated implementations.
* Handle errors and missing resources appropriately.
* Avoid expensive per-frame allocations.
* Keep performance-critical code efficient.
* Preserve serialization and saved data compatibility.
* Preserve existing scene, prefab, and asset references.
* Make platform-specific code explicit.
* Keep changes as small as reasonably possible.
* Explain important design decisions.
* Do not use placeholder implementations when a working implementation is feasible.
* Do not silently omit difficult requirements.
* Do not report success without appropriate verification.

If a proposed improvement requires a substantial refactor, explain why, describe the risks, and prefer a staged migration that preserves the existing implementation until the replacement is verified.

## 12. FINAL OBJECTIVE

The goal is to make my EXISTING game look, sound, and feel dramatically more realistic while keeping its original identity and functionality intact.

The final experience should have:

* Convincing lighting and material response.
* Realistic environments and close-range detail.
* Believable camera presentation on PC.
* Natural body, hand, and weapon movement.
* Convincing object interactions and physics.
* Immersive spatial audio.
* A consistent visual identity across PC and Quest.
* Comfortable, correctly tracked VR.
* Stable performance on standalone Meta Quest.
* Scalable visual quality on desktop PC.
* Maintainable code and reversible modifications.

Do not try to achieve realism by piling on post-processing effects. Improve the underlying rendering, environment, animation, physics, and sound first.

Do not rebuild my game. Upgrade it carefully.

## 13. YOUR FIRST RESPONSE

Start by inspecting the project and identifying its engine, architecture, existing features, and constraints.

Then report:

1. What the game already has.
2. What should be preserved.
3. What can be improved safely.
4. What needs engine-specific investigation.
5. The highest-impact changes to implement first.
6. The likely PC and Quest performance implications.
7. The files and systems you propose to modify.

Wait for any essential missing information before making risky or destructive changes.

If the project is accessible and the first changes are clearly safe, begin with a small, reversible improvement after the audit. Do not replace the existing game or begin an unnecessary rewrite.
