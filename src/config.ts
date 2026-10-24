// Real-world dimensions for the room and workstation, in metres.
// See docs/visual-target.md for the reasoning behind each number.
//
// Coordinate frame: origin on the finished floor at the centre of the room,
// +Y up, -Z is the north wall (desk wall), -X is the west wall (glazing).

export const ROOM = {
	width: 4.4, // along X
	depth: 5.0, // along Z
	height: 2.8,
	wallThickness: 0.2,
	// recessed shadow-gap "skirting": a 15 mm dark reveal at the base of the walls
	shadowGapHeight: 0.015,
	shadowGapDepth: 0.012,
};

export const WINDOW = {
	// floor-to-ceiling glazing in the west wall
	zMin: -1.85,
	zMax: 1.65,
	sill: 0.0,
	head: 2.55,
	frame: 0.05, // aluminium profile face width
	frameDepth: 0.07,
	mullions: 2, // vertical mullions -> 3 panes
	transom: 2.2, // height of the horizontal transom bar
};

export const DOOR = {
	// flush door in the east wall
	zCenter: 1.55,
	width: 0.9,
	height: 2.25,
	thickness: 0.044,
};

export const DESK = {
	width: 1.6,
	depth: 0.75,
	height: 0.735, // top surface
	topThickness: 0.028,
	centerX: -0.15,
	// back edge 25 mm off the wall
	get centerZ() { return -ROOM.depth / 2 + 0.025 + this.depth / 2; },
};

export const EYE_HEIGHT_STANDING = 1.62;
export const EYE_HEIGHT_SEATED = 1.18;

// Exterior lighting: the sun direction is derived from the HDRI so the sun
// patch on the floor agrees with the sun in the view through the window.
export const SUN = {
	// world-space direction *towards* the sun (normalised at use)
	azimuthDeg: 205, // measured from +Z toward +X: low sun raking in from the north-west
	elevationDeg: 16,
	color: 0xfff1df,
	intensity: 5.2,
};
