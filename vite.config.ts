import { defineConfig } from 'vite';

export default defineConfig({
	server: { host: true },
	// the main chunk is ~5.5 MB (2 MB gzipped), mostly Rapier's inlined WASM
	build: { target: 'es2022', chunkSizeWarningLimit: 6000 },
	test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
} as any);
