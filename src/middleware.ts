import { defineMiddleware } from "astro:middleware";
import { getDb } from "./lib/db";
import { seed } from "./lib/db/seed";
import { ensureUploadsDir } from "./lib/media";
import { hasAdminUser, resolveSession, SESSION_COOKIE } from "./lib/auth";
import { getSettings } from "./lib/content";
import { DEFAULT_LANG, isLang, toLang, type Lang } from "./lib/i18n";

/**
 * Amorçage : ouverture de la base, création du schéma et import du contenu
 * initial. Exécuté une seule fois par processus, mémorisé dans une promesse
 * pour que des requêtes concurrentes au démarrage ne le lancent pas en double.
 */
let bootstrapPromise: Promise<void> | null = null;

function bootstrap(): Promise<void> {
    if (!bootstrapPromise) {
        bootstrapPromise = (async () => {
            getDb(); // ouvre la connexion et applique le schéma
            ensureUploadsDir();
            await seed();
        })().catch((error) => {
            // Un échec ne doit pas être mémorisé : la prochaine requête
            // retentera plutôt que de servir un site cassé indéfiniment.
            bootstrapPromise = null;
            throw error;
        });
    }
    return bootstrapPromise;
}

/** Chemins de l'admin accessibles sans session. */
const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/admin/setup"]);

/** Méthodes susceptibles de modifier l'état du site. */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Protection CSRF.
 *
 * Remplace `security.checkOrigin` d'Astro, inutilisable ici : ce contrôle
 * compare l'en-tête Origin à `Astro.url.origin`, or l'adaptateur Node en
 * mode standalone renvoie toujours `http://localhost`. En production, la
 * comparaison échoue donc pour toutes les requêtes, y compris légitimes.
 *
 * On reconstruit l'origine attendue à partir des en-têtes réellement
 * disponibles, et on exige que `Origin` (ou à défaut `Referer`) y corresponde.
 * `Astro.url.origin` est volontairement ignoré : accepter `http://localhost`
 * ouvrirait une brèche pour une page servie localement sur la machine du
 * visiteur.
 */
function expectedOrigins(request: Request): Set<string> {
    const expected = new Set<string>();

    // Derrière un reverse proxy, l'hôte public n'est connu que par ces
    // en-têtes : Node ne voit que le port interne.
    if (TRUST_PROXY) {
        const forwardedHost = request.headers.get("x-forwarded-host");
        const forwardedProto = request.headers.get("x-forwarded-proto");
        if (forwardedHost) {
            expected.add(`${forwardedProto || "https"}://${forwardedHost}`);
        }
    }

    const host = request.headers.get("host");
    if (host) {
        expected.add(`https://${host}`);
        expected.add(`http://${host}`);
    }

    if (process.env.PUBLIC_SITE_URL) {
        try {
            expected.add(new URL(process.env.PUBLIC_SITE_URL).origin);
        } catch {
            // Variable mal formée : on ignore, les en-têtes suffisent.
        }
    }

    return expected;
}

function isSameOrigin(request: Request): boolean {
    const expected = expectedOrigins(request);
    if (expected.size === 0) return false;

    const origin = request.headers.get("origin");
    if (origin) return expected.has(origin);

    // Certains clients omettent Origin : on retombe sur Referer.
    const referer = request.headers.get("referer");
    if (referer) {
        try {
            return expected.has(new URL(referer).origin);
        } catch {
            return false;
        }
    }

    // Ni l'un ni l'autre : requête non issue d'un navigateur, on refuse.
    return false;
}

const TRUST_PROXY = process.env.TRUST_PROXY === "1";

function resolveClientIp(request: Request, fallback: string): string {
    if (TRUST_PROXY) {
        const forwarded = request.headers.get("x-forwarded-for");
        if (forwarded) {
            const first = forwarded.split(",")[0]?.trim();
            if (first) return first;
        }
        const real = request.headers.get("x-real-ip");
        if (real) return real.trim();
    }
    return fallback || "unknown";
}

/** Première langue acceptée par le navigateur parmi celles du site. */
function negotiateLang(request: Request, fallback: Lang): Lang {
    const header = request.headers.get("accept-language");
    if (!header) return fallback;

    for (const part of header.split(",")) {
        const code = part.split(";")[0]?.trim().slice(0, 2).toLowerCase();
        if (isLang(code)) return code;
    }
    return fallback;
}

export const onRequest = defineMiddleware(async (context, next) => {
    await bootstrap();

    const { url, cookies, request, locals } = context;
    const pathname = url.pathname;

    // Les assets et l'endpoint média n'ont besoin d'aucun de ces traitements.
    if (pathname.startsWith("/_astro/") || pathname.startsWith("/_image")) {
        return next();
    }

    locals.clientIp = resolveClientIp(request, context.clientAddress ?? "");

    // Barrière CSRF avant toute autre chose : une requête d'écriture d'origine
    // étrangère ne doit même pas atteindre la résolution de session.
    if (UNSAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
        return new Response("Origine de la requête refusée.", {
            status: 403,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    }

    const token = cookies.get(SESSION_COOKIE)?.value;
    locals.user = resolveSession(token);

    // ── Langue ────────────────────────────────────────────────────────────
    const firstSegment = pathname.split("/").filter(Boolean)[0];
    const settingsLang = getSettings(DEFAULT_LANG).defaultLang;
    locals.lang = toLang(firstSegment, settingsLang);

    // ── Racine : redirection vers la langue du visiteur ───────────────────
    if (pathname === "/" || pathname === "") {
        const target = negotiateLang(request, settingsLang);
        return context.redirect(`/${target}`, 302);
    }

    // ── Garde de l'admin ──────────────────────────────────────────────────
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        const adminExists = hasAdminUser();

        // Premier démarrage : tout l'admin renvoie vers la création du compte.
        if (!adminExists) {
            return pathname === "/admin/setup"
                ? next()
                : context.redirect("/admin/setup", 302);
        }

        // Le compte existe : la page de création n'a plus lieu d'être.
        if (pathname === "/admin/setup") {
            return context.redirect("/admin", 302);
        }

        if (!locals.user && !PUBLIC_ADMIN_PATHS.has(pathname)) {
            const next = encodeURIComponent(pathname + url.search);
            return context.redirect(`/admin/login?next=${next}`, 302);
        }

        // Déjà connecté : la page de login redirige vers le tableau de bord.
        if (locals.user && pathname === "/admin/login") {
            return context.redirect("/admin", 302);
        }
    }

    const response = await next();

    // L'admin ne doit jamais être mis en cache par un proxy.
    if (pathname.startsWith("/admin")) {
        response.headers.set("Cache-Control", "no-store, must-revalidate");
    }

    return response;
});
