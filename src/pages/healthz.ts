import type { APIRoute } from "astro";
import { get } from "../lib/db";

export const prerender = false;

/**
 * Sonde de santé pour Docker et le reverse proxy.
 *
 * Elle interroge réellement la base : un serveur qui répond mais dont le
 * volume de données n'est pas monté doit être signalé comme défaillant.
 */
export const GET: APIRoute = () => {
    try {
        get(`SELECT 1`);
        return new Response(JSON.stringify({ status: "ok" }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        return new Response(
            JSON.stringify({
                status: "error",
                message: error instanceof Error ? error.message : "unknown",
            }),
            {
                status: 503,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store",
                },
            },
        );
    }
};
