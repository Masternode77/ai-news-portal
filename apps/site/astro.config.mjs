// Compute Current rebuild site (ADR-005): server output + Vercel ISR.
// Pages render on demand from the publications data layer; nothing is read at build time,
// so a pipeline failure or an empty database can never break a deploy (P1 / R4).
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

export default defineConfig({
  site: "https://www.computecurrent.com",
  output: "server",
  adapter: vercel({
    isr: {
      expiration: 300,
      exclude: ["/healthz"],
    },
  }),
  build: {
    format: "directory",
  },
});
