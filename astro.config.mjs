// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  vite: {
    // Cast : les types Vite du projet et ceux embarqués par Astro divergent
    plugins: [/** @type {any} */ (tailwindcss())]
  }
});