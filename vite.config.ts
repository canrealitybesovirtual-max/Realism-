import { defineConfig } from 'vite';
import { studioServer } from './tools/studioServer';

export default defineConfig({
	base: './', // relative asset URLs so the build runs from any sub-path
	server: { host: true, watch: { ignored: ['**/.studio/**'] } },
	// project-file access for the in-world Code app; dev server only
	plugins: [studioServer()],
	// the main chunk is ~5.5 MB (2 MB gzipped), mostly Rapier's inlined WASM
	build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
	test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
} as any);
