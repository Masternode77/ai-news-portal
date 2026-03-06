// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  vite: {
    server: {
      allowedHosts: true,
    },
    preview: {
      allowedHosts: true,
    },
  },
});
