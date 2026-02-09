// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  vite: {
    preview: {
      allowedHosts: true, // Allow all hosts for tunnel testing
    },
    server: {
      allowedHosts: true,
    }
  }
});
