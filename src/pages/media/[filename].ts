import type { APIRoute } from "astro";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { get } from "../../lib/db";
import { UPLOADS_DIR } from "../../lib/media";

export const prerender = false;

/**
 * Sert les fichiers du volume d'uploads.
 *
 * Les noms de fichiers sont des UUID générés à l'upload : le contenu d'une
 * URL donnée ne change jamais, d'où le cache immuable d'un an. En production
 * derrière nginx, ce endpoint peut être court-circuité par un `alias` sur le
 * volume (voir nginx.conf), mais il reste fonctionnel sans reverse proxy.
 */
export const GET: APIRoute = async ({ params, request }) => {
    const raw = params.filename;
    if (!raw) return new Response("Not found", { status: 404 });

    // `basename` neutralise toute tentative de traversée de chemin
    // (../, chemins absolus) avant même de toucher au disque.
    const filename = basename(raw);
    if (filename !== raw || filename.startsWith(".")) {
        return new Response("Not found", { status: 404 });
    }

    const media = get<{ mime: string; size: number }>(
        `SELECT mime, size FROM media WHERE filename = ?`,
        filename,
    );
    if (!media) return new Response("Not found", { status: 404 });

    const path = join(UPLOADS_DIR, filename);

    let stats;
    try {
        stats = await stat(path);
    } catch {
        return new Response("Not found", { status: 404 });
    }

    const etag = `"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`;

    if (request.headers.get("if-none-match") === etag) {
        return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    const headers = new Headers({
        "Content-Type": media.mime,
        "Content-Length": String(stats.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
    });

    // Un SVG servi en ligne s'exécute dans l'origine du site : on le force
    // en téléchargement plutôt que d'élargir la surface XSS.
    if (media.mime === "image/svg+xml") {
        headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    }

    if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers });
    }

    const stream = Readable.toWeb(
        createReadStream(path),
    ) as unknown as ReadableStream;

    return new Response(stream, { status: 200, headers });
};

export const HEAD = GET;
