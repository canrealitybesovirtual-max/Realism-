import { defineConfig } from 'vite';

export default defineConfig({
	base: './', // relative asset URLs so the build runs from any sub-path
	server: { host: true },
	// the main chunk is ~5.5 MB (2 MB gzipped), mostly Rapier's inlined WASM
	build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
	test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
} as any);
