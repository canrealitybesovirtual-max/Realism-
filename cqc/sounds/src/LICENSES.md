# Sound sources and licences (cqc/sounds/src)

## Bullet impacts (`impact/`, cut by `tools/cut_impact_sfx.py` into `cqc/sounds/imp*.mp3`)

All recordings below are real recordings (no synthesis). Licence texts: CC0 1.0 https://creativecommons.org/publicdomain/zero/1.0/ ,
CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ (full text in `impact/oculus/LICENSE.txt`), Kenney's CC0 text in `impact/kenney/LICENSE.txt`.

### impact/ntm/ (CC0 1.0)
Single hits already cut from freesound.org recordings (mono, normalised) by the NTM Reimagined Arms project,
https://github.com/ACupOfChicory/NTM-Reimagined-Arms (src/main/resources/assets/ntmgunfeel/sounds/bullet/hit/; their
CREDITS.txt is kept here as `impact/ntm/CREDITS.txt`). Only the files whose source that list gives as CC0 were taken:

| file | freesound source | author | licence |
| --- | --- | --- | --- |
| concrete1, concrete2 | https://freesound.org/s/321478/ "Concrete Hit 2" | dslrguide | CC0 |
| concrete3 | https://freesound.org/s/321477/ "Concrete Hit" | dslrguide | CC0 |
| concrete4 | https://freesound.org/s/702860/ "ROCKImpt_Brick25_InMotionAudio_FREESampleSunday.wav" | InMotionAudio | CC0 |
| stone1 | https://freesound.org/s/843547/ "ROCK_IMPACT_GALETS_OUTDOORS_260128 48" | kevinklang | CC0 |
| dirt1, dirt2 | https://freesound.org/s/319222/ , https://freesound.org/s/319229/ "Single Rock hit Dirt" | worthahep88 | CC0 |
| dirt3 | https://freesound.org/s/789388/ "Bullet impact ground (subsonic) SFX" | modusmogulus | CC0 |
| gravel2-5 | https://freesound.org/s/179341/ "Gravel Impacts and Falls.wav" | lolamadeus | CC0 |
| metal1-6 | https://freesound.org/s/182263/ "Foley bullet hit metal 02.wav" | martian | CC0 |
| steel1, steel3 | https://freesound.org/s/675951/ "S31-15 Shooting gallery; hitting metal targets.wav" | craigsmith | CC0 |
| wood4 | https://freesound.org/s/66396/ "wood_hit.wav" | 110110010 | CC0 |
| wood5 | https://freesound.org/s/506718/ "Wooden Hit" | jackyyang09 | CC0 |

### impact/wd/ (CC0 1.0)
Multi-take files from https://github.com/webdevcody/survive-the-night-fps (client/audio/samples/, whose CREDITS.md says each
source was checked as CC0 on its freesound page):

| file | freesound source | author |
| --- | --- | --- |
| hit_bullet.ogg | https://freesound.org/people/u1769092/sounds/423301/ "VisceralBulletImpacts.wav" | u1769092 |
| imp_glass.ogg | https://freesound.org/people/dasebr/sounds/212698/ , https://freesound.org/people/221Beimesche/sounds/336425/ , https://freesound.org/people/gladkiy/sounds/276939/ (breaking glass) | dasebr, 221Beimesche, gladkiy |
| fs_water.ogg | https://freesound.org/people/macdaddyno1/sounds/321594/ , https://freesound.org/people/ryansitz/sounds/342932/ , https://freesound.org/people/rosenberg3/sounds/627004/ (wading in shallow water) | macdaddyno1, ryansitz, rosenberg3 |

### impact/kenney/ (CC0 1.0)
Kenney "Impact Sounds" 1.0, https://kenney.nl/assets/impact-sounds (copy from https://github.com/Boyquotes/kenney-impact-sounds-for-godot,
licence file kept): impact_glass_light_000/002/004, impact_glass_medium_001, impact_wood_light_002, impact_wood_medium_002,
impact_plank_medium_000, impact_generic_light_000/002, impact_soft_medium_001.

### impact/oculus/ (CC BY 4.0: credit required)
"Oculus Audio Pack 01" by Oculus VR, LLC (https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/), licensed under
CC BY 4.0, files renamed to UCS names (copy from https://github.com/facebookincubator/Meta-open-sound, corpora/oculus-audio-pack):
OBJBag_CanvasCaseDrop_OS_01, PAPRImpt_PaperBallDrop_OS_01 (the cardboard hits). Credited in docs/RELEASE_NOTES.md.

### The user's own upload
`m4_mag_table_drop_174058.mp3` (freesound 174058 pjkasinski3, licence not verified): its first table hit is one layer of impWod5.

### Notes
- freesound.org could not be reached from the build machine, so the CC0 status comes from the two projects' credit files, not
  from the freesound pages themselves; the licence of those repositories' own code was not readable (GitHub API refused). The
  edits they made (cutting, mono, level) add nothing copyrightable to a CC0 recording. Check the freesound pages before a release.
- Other files in this folder are the user's uploads (see CLAUDE.md "CQC step 99", "101", "115"); their licences are not verified.
