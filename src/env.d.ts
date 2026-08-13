/// <reference types="astro/client" />

declare namespace App {
    interface Locals {
        /** Compte admin de la session courante, null si non authentifié. */
        user: import("./lib/auth").AdminUser | null;
        /** Langue résolue depuis l'URL, avec repli sur la langue par défaut. */
        lang: import("./lib/i18n").Lang;
        /** IP du client, en tenant compte du reverse proxy si TRUST_PROXY=1. */
        clientIp: string;
    }
}

declare module "*.sql?raw" {
    const content: string;
    export default content;
}
