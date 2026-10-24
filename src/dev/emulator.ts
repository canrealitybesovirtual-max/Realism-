import { XRDevice, metaQuest3 } from 'iwer';

/**
 * Development-only WebXR emulation (Meta's IWER): installs a virtual Quest 3
 * as navigator.xr so the VR code paths can be exercised in a desktop browser
 * and in automated tests. Loaded only with ?emulate in the URL.
 */
export function installEmulator() {
	const device = new XRDevice(metaQuest3);
	device.installRuntime({ forceInstall: true }); // override any native (non-functional headless) navigator.xr
	device.stereoEnabled = false; // one eye is enough for testing and twice as fast
	(window as unknown as { __iwer: XRDevice }).__iwer = device;
	return device;
}
