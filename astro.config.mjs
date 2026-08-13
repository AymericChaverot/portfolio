// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
    // SSR : le contenu vient de la base, les pages sont rendues à la demande
    // (avec cache mémoire invalidé à chaque sauvegarde admin).
    output: 'server',
    adapter: node({ mode: 'standalone' }),

    site: process.env.PUBLIC_SITE_URL || 'http://localhost:4321',

    // La protection CSRF est assurée par `isSameOrigin()` dans
    // src/middleware.ts, pas par celle d'Astro.
    //
    // Pourquoi : `checkOrigin` compare l'en-tête Origin à `Astro.url.origin`,
    // or l'adaptateur Node en mode standalone renvoie toujours
    // `http://localhost` quel que soit l'en-tête Host. La comparaison échoue
    // donc systématiquement en production — tous les formulaires renvoient
    // 403 — alors qu'elle ne s'applique même pas en dev, où elle laisse
    // justement passer les requêtes inter-origines.
    //
    // Notre contrôle reconstruit l'origine attendue à partir de Host,
    // X-Forwarded-Host et PUBLIC_SITE_URL : il fonctionne derrière nginx
    // et se comporte de la même façon en dev et en production.
    security: {
        checkOrigin: false,
    },

    image: {
        // Les images uploadées sont servies par /media/... depuis le volume,
        // hors du dossier public : il faut les autoriser explicitement.
        domains: [],
        remotePatterns: [],
    },

    vite: {
        // Cast : les types Vite du projet et ceux embarqués par Astro divergent
        plugins: [/** @type {any} */ (tailwindcss())],
        // node:sqlite est un builtin Node 24, jamais à bundler
        ssr: {
            external: ['node:sqlite'],
        },
    },
});
