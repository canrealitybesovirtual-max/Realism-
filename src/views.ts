// Fixed inspection viewpoints used by the screenshot harness and for manual
// review. Positions are real eye heights (standing 1.62 m, seated 1.18 m).
export interface View { pos: [number, number, number]; target: [number, number, number]; fov?: number; }

export const VIEWS: Record<string, View> = {
	// entering from the door, standing
	door: { pos: [1.75, 1.62, 1.55], target: [-0.6, 1.05, -1.6], fov: 70 },
	// seated at the desk, looking at the monitor
	seated: { pos: [-0.15, 1.18, -1.05], target: [-0.15, 1.08, -2.4], fov: 70 },
	// standing behind the chair, over-the-shoulder
	shoulder: { pos: [0.55, 1.62, -0.35], target: [-0.35, 0.85, -2.2], fov: 65 },
	// from the far corner, whole room incl. glazing
	corner: { pos: [1.85, 1.62, 2.25], target: [-1.2, 1.0, -1.0], fov: 75 },
	// looking out through the window
	window: { pos: [0.6, 1.62, 0.4], target: [-2.5, 1.3, 0.2], fov: 70 },
	// close-up of the desk surface and peripherals
	deskClose: { pos: [0.25, 1.15, -1.25], target: [-0.25, 0.74, -2.0], fov: 55 },
	cornerZoom: { pos: [1.4, 1.5, -1.6], target: [2.2, 1.5, -2.5], fov: 30 },
	// east wall: sideboard and print
	credenza: { pos: [-0.6, 1.62, 1.0], target: [2.2, 0.95, -0.55], fov: 65 },
	// low angle near floor, checks contact shadows and floor reflections
	low: { pos: [1.2, 0.45, 0.6], target: [-0.6, 0.35, -1.9], fov: 70 },
};
