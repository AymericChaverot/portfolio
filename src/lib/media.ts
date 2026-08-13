import { existsSync, mkdirSync } from "node:fs";
import { copyFile, unlink, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { all, get, run } from "./db";
import { invalidateContent } from "./content";

/** Volume persistant des fichiers uploadés (monté par Docker). */
export const UPLOADS_DIR = resolve(
    process.env.UPLOADS_DIR || "./data/uploads",
);

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 Mo

/**
 * Types autorisés. La détection ne se fie pas au champ `type` du client :
 * pour les images, sharp doit réussir à lire le fichier, ce qui écarte
 * un exécutable renommé en .png.
 */
const ALLOWED_IMAGE_MIME = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/avif",
    "image/gif",
    "image/svg+xml",
]);

const EXTENSIONS: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "application/pdf": ".pdf",
};

/** Largeur maximale : au-delà, l'image est redimensionnée à l'upload. */
const MAX_WIDTH = 2000;

export interface MediaRow {
    id: number;
    filename: string;
    original_name: string;
    mime: string;
    size: number;
    width: number | null;
    height: number | null;
    alt: string;
    created_at: string;
}

export function ensureUploadsDir(): void {
    mkdirSync(UPLOADS_DIR, { recursive: true });
}

/** Nom de fichier aléatoire : évite les collisions et la traversée de chemin. */
function safeFilename(mime: string, originalName: string): string {
    const ext =
        EXTENSIONS[mime] ||
        (extname(originalName).match(/^\.[a-z0-9]{1,5}$/i)
            ? extname(originalName).toLowerCase()
            : ".bin");
    return `${randomUUID()}${ext}`;
}

export class UploadError extends Error {}

export interface StoredMedia {
    id: number;
    filename: string;
    width: number | null;
    height: number | null;
}

/**
 * Valide, normalise et enregistre un fichier envoyé depuis l'admin.
 * Les images matricielles trop larges sont réduites, les SVG et PDF sont
 * stockés tels quels.
 */
export async function storeUpload(file: File): Promise<StoredMedia> {
    if (file.size === 0) throw new UploadError("Fichier vide.");
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new UploadError(
            `Fichier trop volumineux (max ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo).`,
        );
    }

    const declared = file.type || "application/octet-stream";
    const isPdf = declared === "application/pdf";

    if (!ALLOWED_IMAGE_MIME.has(declared) && !isPdf) {
        throw new UploadError(`Type de fichier non autorisé : ${declared}`);
    }

    ensureUploadsDir();

    const input = Buffer.from(await file.arrayBuffer());
    // Uint8Array plutôt que Buffer : sharp renvoie un Buffer<ArrayBufferLike>
    // qui n'est pas assignable au Buffer<ArrayBuffer> de Buffer.from.
    let output: Uint8Array = input;
    let width: number | null = null;
    let height: number | null = null;
    let mime = declared;

    const isRaster =
        ALLOWED_IMAGE_MIME.has(declared) && declared !== "image/svg+xml";

    if (isRaster) {
        let image: sharp.Sharp;
        let meta: sharp.Metadata;
        try {
            image = sharp(input, { animated: declared === "image/gif" });
            meta = await image.metadata();
        } catch {
            // sharp refuse le fichier : ce n'est pas une image valide,
            // quel que soit le Content-Type annoncé par le navigateur.
            throw new UploadError("Fichier image illisible ou corrompu.");
        }

        width = meta.width ?? null;
        height = meta.height ?? null;

        if (width && width > MAX_WIDTH && declared !== "image/gif") {
            const resized = image.resize({ width: MAX_WIDTH, withoutEnlargement: true });
            output = await resized.toBuffer();
            const after = await sharp(output).metadata();
            width = after.width ?? width;
            height = after.height ?? height;
        }
    } else if (isPdf) {
        // Contrôle du nombre magique : %PDF-
        if (input.subarray(0, 5).toString("latin1") !== "%PDF-") {
            throw new UploadError("Fichier PDF invalide.");
        }
    } else if (declared === "image/svg+xml") {
        const text = input.toString("utf8");
        // Un SVG est servi tel quel par le navigateur : on refuse ceux qui
        // embarquent du script pour ne pas ouvrir une faille XSS.
        if (/<script|onload\s*=|javascript:/i.test(text)) {
            throw new UploadError(
                "SVG contenant du script refusé. Convertis-le en PNG.",
            );
        }
        mime = "image/svg+xml";
    }

    const filename = safeFilename(mime, file.name);
    await writeFile(join(UPLOADS_DIR, filename), output);

    const result = run(
        `INSERT INTO media (filename, original_name, mime, size, width, height, alt)
         VALUES (?, ?, ?, ?, ?, ?, '{}')`,
        filename,
        file.name.slice(0, 200),
        mime,
        output.length,
        width,
        height,
    );

    invalidateContent();

    return {
        id: Number(result.lastInsertRowid),
        filename,
        width,
        height,
    };
}

export function listMedia(): MediaRow[] {
    return all<MediaRow>(
        `SELECT * FROM media ORDER BY created_at DESC, id DESC`,
    );
}

export function getMedia(id: number): MediaRow | undefined {
    return get<MediaRow>(`SELECT * FROM media WHERE id = ?`, id);
}

/** Nombre de références à un média, pour prévenir avant suppression. */
export function countMediaUsage(id: number): number {
    const row = get<{ n: number }>(
        `SELECT
            (SELECT COUNT(*) FROM projects       WHERE image_id     = ?1) +
            (SELECT COUNT(*) FROM timeline_items WHERE logo_id      = ?1) +
            (SELECT COUNT(*) FROM site_settings  WHERE og_image_id  = ?1) +
            (SELECT COUNT(*) FROM site_settings  WHERE resume_pdf_id = ?1) AS n`,
        id,
    );
    return row?.n ?? 0;
}

export async function deleteMedia(id: number): Promise<void> {
    const media = getMedia(id);
    if (!media) return;

    // Les FK sont en ON DELETE SET NULL : les entités qui l'utilisaient
    // perdent simplement leur image.
    run(`DELETE FROM media WHERE id = ?`, id);

    try {
        await unlink(join(UPLOADS_DIR, media.filename));
    } catch {
        // Fichier déjà absent du volume : la ligne est supprimée, c'est
        // le résultat attendu.
    }

    invalidateContent();
}

export function updateMediaAlt(id: number, altJson: string): void {
    run(`UPDATE media SET alt = ? WHERE id = ?`, altJson, id);
    invalidateContent();
}

// ── Import des images livrées avec le dépôt (utilisé par le seed) ─────────

/** Racines où chercher les images d'origine, selon dev ou production. */
const SEED_ROOTS = [
    process.env.SEED_ASSETS_DIR,
    "./public",
    "./dist/client",
    "./client",
].filter((r): r is string => Boolean(r));

function findSeedAsset(relativePath: string): string | null {
    for (const root of SEED_ROOTS) {
        const candidate = resolve(root, relativePath);
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

/**
 * Copie une image du dépôt dans le volume et l'enregistre en base.
 * Renvoie null si le fichier est introuvable : le seed continue sans image
 * plutôt que d'échouer.
 */
export async function importSeedImage(
    relativePath: string,
    alt = "{}",
): Promise<number | null> {
    const source = findSeedAsset(relativePath);
    if (!source) return null;

    ensureUploadsDir();

    let width: number | null = null;
    let height: number | null = null;
    let mime = "image/png";

    try {
        const meta = await sharp(source).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
        if (meta.format === "jpeg") mime = "image/jpeg";
        else if (meta.format === "webp") mime = "image/webp";
        else if (meta.format === "svg") mime = "image/svg+xml";
    } catch {
        return null;
    }

    const originalName = relativePath.split("/").pop() || relativePath;
    const filename = safeFilename(mime, originalName);
    const target = join(UPLOADS_DIR, filename);

    await copyFile(source, target);

    const { size } = await import("node:fs/promises").then((fs) =>
        fs.stat(target),
    );

    const result = run(
        `INSERT INTO media (filename, original_name, mime, size, width, height, alt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        filename,
        originalName,
        mime,
        size,
        width,
        height,
        alt,
    );

    return Number(result.lastInsertRowid);
}
