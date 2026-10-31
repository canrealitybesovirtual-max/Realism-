# Builds commands.json (the command registry) from the roadmap's Appendix A.
import json, sys
COLORS = {
 "red":"#c0392b","dark red":"#7b1f1a","green":"#2e8b57","dark green":"#1e4d2b","light green":"#8fd18f","blue":"#2c6fbb","dark blue":"#1b3a6b","light blue":"#9cc9ee","sky blue":"#7ec0ee","navy":"#1f2f5a",
 "yellow":"#e8c547","orange":"#e67e22","purple":"#7d4fa0","violet":"#8e6cc0","pink":"#e88fb0","white":"#f4f4f2","black":"#1b1b1d","grey":"#8a8a8e","gray":"#8a8a8e","light grey":"#c9c9cc","light gray":"#c9c9cc",
 "dark grey":"#4a4a4e","dark gray":"#4a4a4e","brown":"#7a4e2d","tan":"#c8a678","beige":"#e3d6bd","cream":"#f2ead8","cyan":"#3fbfcf","teal":"#2a8a8a","turquoise":"#3ec7b6","gold":"#c9a227","silver":"#b9bcc0",
 "maroon":"#6b1e24","olive":"#7a7a35","lime":"#9bd13f","magenta":"#c2398f","lavender":"#b9a8de","mint":"#9fdcc2","peach":"#f2b38f","coral":"#ec7a62","charcoal":"#36393d","walnut":"#5c3d26","oak":"#b08954","warm white":"#ffd9b0","cool white":"#dfe9ff","natural white":"#fff4e6"}
SHAPES_READY = ["box","sphere","cylinder","ramp"]
PROPS = {  # word -> "box"/"sphere"/... (shape), "prop:<library name>", "alias:<name>" (several props), or None (planned)
 "box":"box","boxes":"box","cube":"box","cubes":"box","ball":"sphere","balls":"sphere","sphere":"sphere","spheres":"sphere","cylinder":"cylinder","cylinders":"cylinder","ramp":"ramp","ramps":"ramp","block":"box","blocks":"box"}
def lib(name, *words):
    for w in (name,)+words: PROPS[w] = "prop:"+name
lib("crate","crates","wooden crate","wooden crates")
lib("cardboard box","cardboard boxes","carton","cartons","parcel","parcels")
lib("barrel","barrels","drum","drums","steel drum","steel drums","oil drum","oil drums")
lib("bin","bins","waste bin","waste bins","trash can","trash cans","wastebasket")
lib("chair","chairs","wooden chair","wooden chairs")
lib("table","tables","side table","side tables")
lib("shelf","shelves","bookshelf","bookshelves","bookcase","bookcases")
lib("cushion","cushions","pillow","pillows")
lib("books","book","stack of books")
lib("cone","cones","traffic cone","traffic cones")
lib("barrier","barriers","concrete barrier","concrete barriers","jersey barrier")
lib("tire","tires","tyre","tyres","wheel")
lib("tire stack","tire stacks","tyre stack","tyre stacks","stack of tires","stack of tyres")
lib("hay bale","hay bales","bale","bales","hay")
lib("sign","signs","road sign","road signs")
lib("flag","flags","checkered flag","chequered flag")
lib("wall","walls"); lib("platform","platforms"); lib("pillar","pillars","column","columns"); lib("beam","beams","wooden beam")
lib("stairs","staircase","steps"); lib("arch","arches","archway")
lib("button","buttons","push button"); lib("switch","switches","light switch"); lib("lever","levers")
lib("pressure plate","pressure plates"); lib("trigger zone","trigger zones","trigger box"); lib("spawner","spawners","spawner pad")
lib("domino","dominoes","dominos"); lib("bowling pin","bowling pins","pin","pins"); lib("balloon","balloons")
lib("trampoline pad","trampoline","trampolines","trampoline pads")
# Range: shooting targets (planned; the desk pistol and its attachments were removed with the office props)
TARGET_WORDS = ["paper target","paper targets","target","targets","bullseye","bullseye target","shooting target","silhouette target","silhouette","cardboard target","steel gong","gong","gongs","steel plate","steel target","steel popper","popper","poppers","tin can","tin cans","can","cans","scoreboard","score board"]
PROPS.update({"box stack":"alias:box stack","stack of boxes":"alias:box stack","seesaw":"alias:seesaw","seesaws":"alias:seesaw",
 "pendulum":None,"pendulums":None,"smoke":None,"sparks":None,"dust":None,"capsule":None,"wedge":None})
PROPS.update({w: None for w in TARGET_WORDS})
PROPS_LATER = {**{w: "Shooting targets arrive in the next step." for w in TARGET_WORDS}, "pendulum":"Pendulums need joints, which arrive with the Inspector (Phase 8).","pendulums":"Pendulums need joints, which arrive with the Inspector (Phase 8).",
 "smoke":"Effects (smoke, sparks, dust) are off by default and arrive later.","sparks":"Effects (smoke, sparks, dust) are off by default and arrive later.","dust":"Effects (smoke, sparks, dust) are off by default and arrive later.",
 "capsule":"Capsules arrive with the Inspector's shape settings (Phase 8).","wedge":"Wedges arrive with the Inspector's shape settings (Phase 8)."}
ENUMS = {
 "direction": ["up","down","left","right","forward","forwards","ahead","back","backward","backwards"],
 "arrangement": ["row","line","grid","circle","ring","stack","tower","pyramid"],
 "shape": ["box","cube","sphere","ball","cylinder","ramp","cone","capsule","wedge"],
 "material": ["metal","metallic","steel","black metal","painted metal","diamond plate","wood","wooden","dark wood","crate wood","cardboard","stone","concrete","plaster","fabric","glass","rubber","plastic","ice","neon","hay"],
 "surface": ["wall","walls","floor","ceiling"],
 "onoff": ["on","off"],
 "bodytype": ["static","dynamic","moving"],
 "weight": ["light","medium","heavy"],
 "grip": ["slippery","sticky","grippy"],
 "dimension": ["wider","narrower","taller","shorter","longer","flatter","thinner"],
 "preset": ["heavy metal","bouncy rubber","zero-g","zero g","zero gravity","static lock","ice","wood","stone","foam","glass","balloon"],
 "room": ["rally","snowy mountain rally","mountain","interstate","highway","cqc","cqc loop","close quarters","studio","office"],
 "lighttype": ["lamp","table lamp","light","point light","spotlight","lantern","neon strip"],
 "axis": ["x","y","z","x axis","y axis","z axis"],
 "level": ["low","medium","high"],
 "category": ["spawn","move","shape","look","material","physics","presets","lights","rooms","travel","scene","project","view","help","range","shooting"],
 "fog": ["off","none","light","thin","dense","heavy","thick"],
 "gun": ["glock","glock 17","pistol","1911","m1911","colt","akm","ak","ak47","ak-47","kalashnikov","m4","m4a1","m4a1-s","carbine","awm","awp","sniper","sniper rifle"],
}
PRESETS = {  # Appendix B. mass is x a medium prop (2 kg); gravity null = static
 "heavy metal":{"mass":5,"friction":0.6,"bounce":0.05,"gravity":1.0},
 "bouncy rubber":{"mass":0.5,"friction":0.9,"bounce":0.85,"gravity":1.0},
 "zero-g":{"mass":1,"friction":0.2,"bounce":0.4,"gravity":0},
 "static lock":{"static":True,"friction":0.6,"bounce":0},
 "ice":{"mass":1,"friction":0.02,"bounce":0.1,"gravity":1.0},
 "wood":{"mass":1,"friction":0.5,"bounce":0.2,"gravity":1.0},
 "stone":{"mass":4,"friction":0.7,"bounce":0.05,"gravity":1.0},
 "foam":{"mass":0.2,"friction":0.8,"bounce":0.3,"gravity":1.0},
 "glass":{"mass":1,"friction":0.3,"bounce":0.1,"gravity":1.0},
 "balloon":{"mass":0.05,"friction":0.4,"bounce":0.6,"gravity":-0.1}}
T = lambda **k: k
OBJ = T(type="object")
cmds = []
def c(name, group, phrases, example, reply, blanks=None, cost="Low", editorOnly=False, status="ready", planned=None, defaults=None, undo=True):
    e = dict(name=name, group=group, phrases=phrases, blanks=blanks or {}, example=example, reply=reply, cost=cost, editorOnly=editorOnly, undoable=undo, status=status)
    if planned: e["planned"] = planned
    if defaults: e["defaults"] = defaults
    cmds.append(e)
P7 = "arrives with the prop library (Phase 7)"; P8 = "comes after the Inspector (it needs joints or mesh tools)"
G = "Spawn and delete"
c("add", G, ["add [prop]","create [prop]","spawn [prop]","make new [prop]","put [prop] here"], "add a box", "Added a {prop} on the terrace outside.", {"prop":T(type="prop")})
c("spawn_many", G, ["spawn [n] [prop]","add [n] [prop]","create [n] [prop]","make [n] [prop]"], "spawn 5 balls", "Added {n} {prop}.", {"n":T(type="int",min=1,max=50),"prop":T(type="prop")}, cost="Med")
c("spawn_hand", G, ["spawn [prop] at my hand","add [prop] at my hand","spawn at my hand","give me [prop]"], "spawn a ball at my hand", "Added a {prop} at your hand, ready to throw.", {"prop":T(type="prop")}, defaults={"prop":"ball"})
c("spawn_arranged", G, ["spawn [n] [prop] in [arrangement]","add [n] [prop] in [arrangement]","make [n] [prop] in [arrangement]","spawn [n] [prop] as [arrangement]","stack [n] [prop]"], "spawn 10 boxes in a pyramid", "Added {n} {prop} in a {arrangement}.", {"n":T(type="int",min=1,max=50),"prop":T(type="prop"),"arrangement":T(type="enum",of="arrangement")}, cost="Med", defaults={"arrangement":"stack"})
c("duplicate", G, ["duplicate [target]","copy [target]","duplicate"], "duplicate it", "Made a copy of {target}, with its physics.", {"target":OBJ}, defaults={"target":"it"})
c("clone_n", G, ["clone [target] [n] times","make [n] copies of [target]","copy [target] [n] times"], "clone it 5 times", "Made {n} copies of {target} in a line.", {"target":OBJ,"n":T(type="int",min=1,max=30)}, cost="Med")
c("replace", G, ["replace [target] with [prop]","swap [target] for [prop]","swap [target] with [prop]"], "replace it with a sphere", "Replaced {target} with a {prop}, same place and size.", {"target":OBJ,"prop":T(type="prop")})
c("delete", G, ["delete [target]","remove [target]","get rid of [target]"], "delete it", "Deleted {target}.", {"target":OBJ})
c("delete_all", G, ["delete all [prop]","remove all [prop]","delete every [prop]"], "delete all balls", "Deleted {count} {prop}.", {"prop":T(type="prop")})
c("clear_spawned", G, ["clear spawned","clear everything i added","remove everything i added","clear all props"], "clear spawned", "Removed {count} things you added. The room itself is untouched.")
c("random_props", G, ["random props [n]","add [n] random props","spawn [n] random props","random props"], "random props 8", "Added {n} random props for testing.", {"n":T(type="int",min=1,max=40)}, cost="Med", defaults={"n":"6"})
G = "Move, rotate, scale"
c("move", G, ["move [target] [direction] [distance]","move [target] [direction]","nudge [target] [direction]","nudge [target] [direction] [distance]","push [target] [direction] [distance]"], "move it up 20 cm", "Moved {target} {direction} {distance}.", {"target":OBJ,"direction":T(type="enum",of="direction"),"distance":T(type="length",min=0.001,max=20,unit="cm")}, defaults={"distance":"10 cm"})
c("put_floor", G, ["put [target] on floor","put [target] on ground","drop [target] to floor","put [target] down"], "put it on the floor", "{target} is on the floor.", {"target":OBJ})
c("put_on", G, ["put [target] on [object]","place [target] on [object]","set [target] on [object]","put [target] on top of [object]"], "put the crate on the desk", "{target} is on {object}.", {"target":OBJ,"object":OBJ})
c("center", G, ["center [target]","centre [target]","move [target] to center","move [target] to middle"], "center it", "{target} is in the middle of the room.", {"target":OBJ})
c("rotate", G, ["rotate [target] [angle]","turn [target] [angle]","rotate [target] by [angle]","spin [target] round","rotate [target]","turn [target] around"], "rotate it 45", "Turned {target} {angle}.", {"target":OBJ,"angle":T(type="angle",min=-720,max=720)}, defaults={"angle":"90"})
c("face", G, ["make [target] face [object]","turn [target] to face [object]","point [target] at [object]","face [object]"], "make the crate face the desk", "{target} now faces {object}.", {"target":OBJ,"object":OBJ}, defaults={"target":"it"})
c("flip", G, ["flip [target]","flip [target] over","turn [target] upside down","flip"], "flip it", "Flipped {target}.", {"target":OBJ}, defaults={"target":"it"})
c("upright", G, ["stand [target] upright","make [target] upright","stand upright","straighten [target]"], "stand it upright", "{target} is upright.", {"target":OBJ}, defaults={"target":"it"})
c("scale", G, ["scale [target] [factor]","scale [target] by [factor]","make [target] [factor] bigger","make [target] [factor] size"], "scale it 2x", "Scaled {target} {factor}.", {"target":OBJ,"factor":T(type="factor",min=0.05,max=20)})
c("resize", G, ["make [target] [dimension]","[target] [dimension]"], "make it wider", "Made {target} {dimension}.", {"target":OBJ,"dimension":T(type="enum",of="dimension")})
c("bigger", G, ["make [target] bigger","[target] bigger","bigger","grow [target]"], "bigger", "Made {target} bigger.", {"target":OBJ}, defaults={"target":"it"})
c("smaller", G, ["make [target] smaller","[target] smaller","smaller","shrink [target]"], "smaller", "Made {target} smaller.", {"target":OBJ}, defaults={"target":"it"})
c("reset_size", G, ["reset size","reset size of [target]","reset [target] size","make [target] normal size"], "reset size", "{target} is back to its normal size.", {"target":OBJ}, defaults={"target":"it"})
c("snap_grid", G, ["snap [target] to grid","snap to grid","snap [target]"], "snap to grid", "Snapped {target} to the {grid} grid.", {"target":OBJ}, defaults={"target":"it"})
c("line_up", G, ["line up [target] with [object]","line [target] up with [object]","line up with [object]","align [target] with [object]","align with [object]"], "line it up with the desk", "Lined {target} up with {object}.", {"target":OBJ,"object":OBJ}, defaults={"target":"it"})
G = "Shape"
c("make_shape", G, ["make [target] [shape]","turn [target] into [shape]","change [target] to [shape]","make [target] into [shape]"], "make it a sphere", "{target} is now a {shape}.", {"target":OBJ,"shape":T(type="enum",of="shape")})
c("round_corners", G, ["round corners","round the corners","round [target] corners"], "round the corners", "", status="planned", planned=P8)
c("hollow", G, ["hollow [target]","make [target] hollow","hollow it"], "hollow it", "", status="planned", planned=P8)
c("thickness", G, ["thickness [n]"], "thickness 2", "", {"n":T(type="number",min=0,max=100)}, status="planned", planned=P8)
c("taper", G, ["taper [n]"], "taper 0.5", "", {"n":T(type="number",min=0,max=1)}, status="planned", planned=P8)
c("detail", G, ["detail [level]"], "detail low", "", {"level":T(type="enum",of="level")}, status="planned", planned=P8)
G = "Look and material"
c("paint_surface", G, ["paint [surface] [color]","color [surface] [color]","colour [surface] [color]","make [surface] [color]"], "paint the walls light grey", "Painted the {surface} {color}.", {"surface":T(type="enum",of="surface"),"color":T(type="color")})
c("color", G, ["color [target] [color]","colour [target] [color]","paint [target] [color]","make [target] [color]","[target] [color]"], "color it red", "{target} is now {color}.", {"target":OBJ,"color":T(type="color")})
c("material", G, ["make [target] [material]","turn [target] [material]","make [target] out of [material]","[target] [material]"], "make it metal", "{target} now looks like {material}.", {"target":OBJ,"material":T(type="enum",of="material")})
c("shiny", G, ["make [target] shiny","shiny","make [target] glossy","polish [target]"], "shiny", "{target} is shiny.", {"target":OBJ}, defaults={"target":"it"})
c("matte", G, ["make [target] matte","matte","make [target] matt","make [target] dull"], "matte", "{target} is matte.", {"target":OBJ}, defaults={"target":"it"})
c("transparent", G, ["make [target] [percent] transparent","transparent [percent]","make [target] transparent","[target] transparent [percent]","see through [target]"], "transparent 50%", "{target} is {percent} see-through.", {"target":OBJ,"percent":T(type="percent",min=0,max=95)}, cost="Med", defaults={"target":"it","percent":"50"})
c("opaque", G, ["make [target] solid","make [target] opaque","opaque"], "make it solid", "{target} is solid again.", {"target":OBJ}, defaults={"target":"it"})
c("glow", G, ["glow [target]","make [target] glow","light up [target]"], "glow it", "{target} glows.", {"target":OBJ}, defaults={"target":"it"})
c("no_glow", G, ["stop glow","stop [target] glowing","no glow","unglow [target]"], "stop glow", "{target} no longer glows.", {"target":OBJ}, defaults={"target":"it"})
c("outline", G, ["outline [target]"], "outline it", "{target} is selected and outlined (Editor mode).", {"target":OBJ}, defaults={"target":"it"}, undo=False)
c("hide", G, ["hide [target]","make [target] invisible"], "hide it", "{target} is hidden. Say show {target} to bring it back.", {"target":OBJ})
c("show", G, ["show [target]","unhide [target]","make [target] visible"], "show the crate", "{target} is visible.", {"target":OBJ})
c("reset_look", G, ["reset look","reset [target] look"], "reset look", "{target} looks as it did at the start.", {"target":OBJ}, defaults={"target":"it"})
G = "Physics"
c("gravity_all", G, ["gravity [onoff] everything","gravity [onoff] for everything","turn gravity [onoff]","gravity [onoff]"], "gravity off everything", "Gravity is {onoff} for {count} props.", {"onoff":T(type="enum",of="onoff")})
c("gravity", G, ["gravity [onoff] [target]","turn gravity [onoff] for [target]","[target] gravity [onoff]"], "gravity off it", "Gravity is {onoff} for {target}.", {"onoff":T(type="enum",of="onoff"),"target":OBJ})
c("body", G, ["make [target] [bodytype]","set [target] [bodytype]"], "make it static", "{target} is {bodytype}.", {"target":OBJ,"bodytype":T(type="enum",of="bodytype")})
c("mass", G, ["mass [mass]","set mass [mass]","set mass of [target] to [mass]","[target] mass [mass]"], "mass 5", "{target} weighs {mass}.", {"target":OBJ,"mass":T(type="mass",min=0.01,max=5000)}, defaults={"target":"it"})
c("weight", G, ["make [target] [weight]","[weight]"], "heavy", "{target} is {weight}.", {"target":OBJ,"weight":T(type="enum",of="weight")}, defaults={"target":"it"})
c("bounce", G, ["bounce [ratio]","set bounce [ratio]","[target] bounce [ratio]","make [target] bouncy"], "bounce 0.8", "{target} bounces {ratio}.", {"target":OBJ,"ratio":T(type="ratio",min=0,max=1)}, defaults={"target":"it","ratio":"0.8"})
c("friction", G, ["friction [ratio]","set friction [ratio]","[target] friction [ratio]"], "friction 0.2", "{target} friction {ratio}.", {"target":OBJ,"ratio":T(type="ratio",min=0,max=1)}, defaults={"target":"it"})
c("grip", G, ["make [target] [grip]","[grip]"], "slippery", "{target} is {grip}.", {"target":OBJ,"grip":T(type="enum",of="grip")}, defaults={"target":"it"})
c("spin", G, ["spin [target] [speed]","make [target] spin","spin [target]","spin [speed]"], "spin it 90", "{target} spins at {speed} while the game plays.", {"target":OBJ,"speed":T(type="number",min=-2000,max=2000,unit="deg/s")}, defaults={"target":"it","speed":"90"})
c("stop_spin", G, ["stop spin","stop [target] spinning","stop spinning"], "stop spinning", "{target} no longer spins.", {"target":OBJ}, defaults={"target":"it"})
c("bob", G, ["make [target] float","make [target] bob","bob [target]"], "make it bob", "{target} floats up and down while the game plays.", {"target":OBJ}, defaults={"target":"it"})
c("freeze", G, ["freeze [target]","pin [target]"], "freeze it", "{target} is frozen in place.", {"target":OBJ})
c("unfreeze", G, ["unfreeze [target]","unpin [target]","release [target]"], "unfreeze it", "{target} moves freely again.", {"target":OBJ})
c("freeze_all", G, ["freeze everything","freeze all"], "freeze everything", "Froze {count} props.")
c("unfreeze_all", G, ["unfreeze everything","unfreeze all"], "unfreeze everything", "Released {count} props.")
c("trigger", G, ["make [target] trigger","turn [target] into trigger"], "make it a trigger", "{target} is a trigger zone: it fires enter and exit while the game plays.", {"target":OBJ})
c("throw", G, ["throw [target]"], "throw it", "", status="planned", planned=P7)
c("drag", G, ["drag [n]","air drag [n]"], "drag 0.5", "{target} has drag {n}.", {"n":T(type="number",min=0,max=10)})
c("lock_axis", G, ["lock [axis]"], "lock y axis", "{target} can no longer move along {axis}.", {"axis":T(type="enum",of="axis")})
c("breakable", G, ["make [target] breakable [n]","make [target] breakable"], "make it breakable", "", status="planned", planned=P8)
c("ignore_collisions", G, ["ignore collisions with [target]","make [target] a ghost"], "ignore collisions with it", "{target} now passes through everything.", {"target":OBJ}, defaults={"target":"it"}, cost="Med")
c("grabbable", G, ["grabbable [onoff]"], "grabbable off", "", {"onoff":T(type="enum",of="onoff")}, status="planned", planned=P8)
G = "Presets"
c("preset", G, ["preset [preset]","apply preset [preset]","make [target] preset [preset]","preset [preset] [target]"], "preset heavy metal", "{target}: {preset}.", {"target":OBJ,"preset":T(type="enum",of="preset")}, defaults={"target":"it"})
G = "Lights"
c("lights", G, ["lights [onoff]","turn lights [onoff]","turn [onoff] lights","switch lights [onoff]"], "lights off", "Lights {onoff}.", {"onoff":T(type="enum",of="onoff")})
c("dim", G, ["dim lights","dim","lights dimmer","darker"], "dim the lights", "Dimmed the lights.")
c("brighter", G, ["brighter","lights brighter","brighten lights","brighter lights"], "brighter", "Brightened the lights.")
c("warmer", G, ["warmer","warmer lights","lights warmer","warm light"], "warmer", "The lights are warmer.")
c("cooler", G, ["cooler","cooler lights","lights cooler","cool light","colder"], "cooler", "The lights are cooler.")
c("night", G, ["night mode","night","make it night"], "night mode", "Night mode: darker sky and room.")
c("day", G, ["day mode","day","make it day","daytime"], "day mode", "Day mode.")
c("add_light", G, ["add [lighttype]","create [lighttype]","spawn [lighttype]"], "add a lamp", "Added a {lighttype} on the terrace outside.", {"lighttype":T(type="enum",of="lighttype")})
c("light_color", G, ["light color [color]","light colour [color]","make light [color]","make lights [color]"], "light color warm white", "Light colour {color}.", {"color":T(type="color")})
c("flicker", G, ["flicker [target]","make [target] flicker","flicker"], "flicker it", "{target} flickers while the game plays.", {"target":OBJ}, defaults={"target":"it"})
c("shadows", G, ["shadows [onoff]","turn shadows [onoff]"], "shadows off", "Sun shadows {onoff}.", {"onoff":T(type="enum",of="onoff")}, cost="High")
G = "Rooms and travel"
c("go", G, ["go to [room]","travel to [room]","take me to [room]","open [room]"], "go to rally", "Going to {room}.", {"room":T(type="enum",of="room")}, undo=False)
c("back", G, ["back to studio","back to office","go back","leave","go home"], "back to studio", "Back to the studio.", undo=False)
c("open_door", G, ["open door","go through door"], "open the door", "Opening the door.", undo=False)
c("close_door", G, ["close door","lock door","shut door","keep door shut"], "close the door", "The door is shut.", undo=False)
c("set_door", G, ["set door to [room]","door to [room]","make door go to [room]"], "set the door to interstate", "The door now leads to {room}.", {"room":T(type="enum",of="room")}, undo=False)
c("teleport", G, ["teleport to [object]","go to [object]"], "teleport to the desk", "Moved next to {object}.", {"object":OBJ}, undo=False)
c("recenter", G, ["recenter","re-center","recentre","re center","reset view"], "recenter", "Facing the computer.", undo=False)
G = "Scene and project"
c("fog", G, ["fog [fog]","set fog [fog]","make fog [fog]","[fog] fog"], "fog light", "Fog: {fog}.", {"fog":T(type="enum",of="fog")})
c("undo", G, ["undo","undo that","go back one step"], "undo", "Undid: {label}.", undo=False)
c("redo", G, ["redo","redo that"], "redo", "Redid: {label}.", undo=False)
c("snapshot", G, ["snapshot","take snapshot","save snapshot"], "snapshot", "Saved the scene as {name}.", undo=False)
c("save", G, ["save [name]","save as [name]","save scene as [name]"], "save my room", "Saved the scene as {name}.", {"name":T(type="name")}, undo=False)
c("load", G, ["load [name]","open save [name]"], "load my room", "Loaded {name}: {applied} changes.", {"name":T(type="name")}, cost="Med", undo=False)
c("export", G, ["export","export project","download project"], "export", "Exported {name}.", undo=False)
c("import", G, ["import","import project","open project file"], "import", "Choose a project file.", undo=False)
c("play", G, ["play","start","start game"], "play", "Playing. Stop puts the room back.", undo=False)
c("pause", G, ["pause","pause game"], "pause", "Paused.", undo=False)
c("stop", G, ["stop","stop game"], "stop", "Stopped. The room is back as it was before Play.", undo=False)
c("select", G, ["select [object]","pick [object]","choose [object]"], "select the monitor", "Selected {object}.", {"object":OBJ}, undo=False)
c("select_all", G, ["select all [prop]","select every [prop]"], "select all boxes", "Selected {count} {prop}.", {"prop":T(type="prop")}, undo=False)
c("deselect", G, ["deselect","select nothing","clear selection"], "deselect", "Nothing is selected.", undo=False)
c("group", G, ["group","group them"], "group", "", status="planned", planned=P8)
c("ungroup", G, ["ungroup"], "ungroup", "", status="planned", planned=P8)
c("rename", G, ["rename [target] to [name]","call [target] [name]","name [target] [name]"], "rename it to Big Box", "Renamed {old} to {name}.", {"target":OBJ,"name":T(type="name")})
c("find", G, ["find [object]","where is [object]","show me [object]"], "find the monitor", "Found {object}; it is selected on the Scene tab.", {"object":OBJ}, undo=False)
c("lock", G, ["lock [target]"], "lock it", "{target} is locked against moves.", {"target":OBJ})
c("unlock", G, ["unlock [target]"], "unlock it", "{target} is unlocked.", {"target":OBJ})
c("hide_all", G, ["hide all","hide everything"], "hide all", "Hid {count} things you added.")
c("show_all", G, ["show all","show everything","unhide all"], "show all", "Showing {count} hidden things.")
c("reset_room", G, ["reset room","reset the room"], "reset room", "Say reset room now to remove every change. A backup is kept.", cost="High", undo=False)
c("reset_room_now", G, ["reset room now","reset room confirm","yes reset room"], "reset room now", "Resetting the room. Undo the last import brings it back.", cost="High", undo=False)
G = "View and reading"
c("show_grid", G, ["show grid","grid on"], "show grid", "Grid on (Editor mode only).", editorOnly=True, undo=False)
c("hide_helpers", G, ["hide helpers","hide grid","grid off","names off","colliders off"], "hide helpers", "Grid, names and colliders are off.", editorOnly=True, undo=False)
c("show_names", G, ["show names","names on"], "show names", "Name tags on (Editor mode only).", editorOnly=True, undo=False)
c("show_colliders", G, ["show colliders","colliders on"], "show colliders", "Colliders shown (Editor mode only).", editorOnly=True, undo=False)
c("frame_time", G, ["show frame time","frame time","show fps","performance"], "show frame time", "Opened the Profiler.", undo=False)
c("text_bigger", G, ["text bigger","bigger text","larger text","zoom in"], "text bigger", "UI scale {scale}.", undo=False)
c("text_smaller", G, ["text smaller","smaller text","zoom out"], "text smaller", "UI scale {scale}.", undo=False)
c("contrast", G, ["high contrast [onoff]"], "high contrast on", "", {"onoff":T(type="enum",of="onoff")}, status="planned", planned=P8)
c("look_at", G, ["look at [object]","face [object]"], "look at the monitor", "Facing {object}.", {"object":OBJ}, undo=False)
G = "Range"
c("spawn_gun", G, ["spawn [gun]","give me [gun]","get [gun]","add [gun]","bring out [gun]"], "spawn the AKM", "The {gun} is on the bench by the window lane. Pick it up.", {"gun":T(type="enum",of="gun")}, undo=False)
c("range_setup", G, ["set up range","set up shooting range","build range","build shooting range","make shooting range","shooting range","spawn targets","add targets","put up targets"], "set up a shooting range", "Range set up: {count} targets from 5 to 300 m down the lane through the open window pane.", cost="Med", undo=False)
c("reset_targets", G, ["reset targets","reset range","reset score","stand targets up","clear score"], "reset targets", "Targets are fresh and the score is zero.", undo=False)
c("score", G, ["score","show score","my score","what is my score","how did i do","accuracy"], "what is my score", "{score}", undo=False)
c("clear_guns", G, ["put guns away","remove guns","clear guns","put away guns"], "put the guns away", "Put {count} guns away.", undo=False)
c("start_clays", G, ["start clays","pull","clays on","start trap","start skeet"], "start clays", "", status="planned", planned="arrives with the clay thrower (next range step)")
G = "Help"
c("list", G, ["list commands","what can i say","help","commands","show commands"], "what can I say", "Here is what you can say.", undo=False)
c("list_group", G, ["commands for [category]","help [category]","[category] commands"], "commands for physics", "Commands for {category}.", {"category":T(type="enum",of="category")}, undo=False)
c("favorite", G, ["favorite [command]","favourite [command]"], "favorite add a box", "Pinned {command} to the top of the list.", {"command":T(type="name")}, undo=False)
c("recent", G, ["recent","recent commands","history"], "recent", "Your recent commands.", undo=False)
reg = {"format":"studio-commands","version":3,"note":"Single source of truth for commands (roadmap section 7a). Read by the Commands list, the command runner, the Console help and, later, the Claude backend.",
       "words":{"skip":["a","an","the","please","my","some"],"numbers":{"zero":0,"one":1,"two":2,"three":3,"four":4,"five":5,"six":6,"seven":7,"eight":8,"nine":9,"ten":10,"eleven":11,"twelve":12,"fifteen":15,"twenty":20,"thirty":30,"fifty":50,"half":0.5,"double":2},
                "it":["it","this","that","this one","that one","selected","selection","them"]},
       "colors":COLORS,"props":PROPS,"propsLater":PROPS_LATER,"enums":ENUMS,"presets":PRESETS,"commands":cmds}
json.dump(reg, open(sys.argv[1],"w"), indent=1, ensure_ascii=False)
print(len(cmds),"commands,",sum(1 for x in cmds if x["status"]=="ready"),"ready")
