import { useRef, useCallback, useEffect, useReducer } from "react";
import { useWebSocket } from "../../context/WebSocketContext";


function formatLogHeader(): string {
    const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
    const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `Log du ${dateStr} ${time} :\n-------------------\n`;
}

export function formatLogLine(message: string): string {
    const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `[${time}] ${message}\n\n`;
}

function pushRecent(recent: string[], line: string): string[] {
    const kept = recent.length >= 5 ? recent.slice(0, 4) : recent.slice();
    return [line, ...kept];
}

/**
 * Hook bas niveau : synchronise le journal de séance avec le backend via le
 * WebSocket partagé de la session (au lieu du sessionStorage local).
 */
export function useSyncedLog() {
    const { sendMessage, lastMessage } = useWebSocket();

    const logRef = useRef<string>("");
    const lastMessageLog = useRef<string[]>([]);
    // Les refs ci-dessus ne déclenchent pas de re-render à elles seules :
    // ce petit compteur force le re-render des composants qui en ont besoin
    // (typiquement la page /log) quand une mise à jour arrive du serveur.
    const [, forceRender] = useReducer((c) => c + 1, 0);

    useEffect(() => {
        const msg = lastMessage as any;
        if (!msg) return;
        if (msg.type === "sync_state" || msg.type === "log_update") {
            let changed = false;
            if (typeof msg.log === "string" && msg.log !== logRef.current) {
                logRef.current = msg.log;
                changed = true;
            }
            if (Array.isArray(msg.log_recent)) {
                lastMessageLog.current = msg.log_recent;
                changed = true;
            }
            if (changed) forceRender();
        }
    }, [lastMessage]);

    // Envoie une ligne déjà formatée (avec horodatage) au backend. Ajoute
    // l'en-tête de séance si le log est actuellement vide (premier appareil
    // à écrire dans la session).
    const appendRawLine = useCallback((rawLine: string) => {
        const toSend = logRef.current ? rawLine : formatLogHeader() + rawLine;

        // Mise à jour optimiste locale : l'auteur voit sa ligne tout de
        // suite, sans attendre l'aller-retour réseau. La valeur envoyée par
        // le serveur (autoritaire) écrasera celle-ci à réception.
        logRef.current += toSend;
        lastMessageLog.current = pushRecent(lastMessageLog.current, rawLine);
        forceRender();

        sendMessage({ type: "log_append", line: toSend });
    }, [sendMessage]);

    const appendToLog = useCallback((message: string) => {
        appendRawLine(formatLogLine(message));
    }, [appendRawLine]);

    const resetLog = useCallback(() => {
        logRef.current = "";
        lastMessageLog.current = [];
        forceRender();
        sendMessage({ type: "log_reset" });
    }, [sendMessage]);

    return { logRef, lastMessageLog, appendToLog, appendRawLine, resetLog };
}

const LOG_COLOR_RULES: Array<{ pattern: RegExp; color: string }> = [
  { pattern: /⚡|choc délivré/i, color: "#f87171" },        // rouge : choc délivré
  { pattern: /défibrillateur|charge|energie|énergie/i, color: "#fb923c" }, // orange : actions défibrillateur
  { pattern: /branché|débranché|non prise|tension prise/i, color: "#facc15" }, // jaune : capteurs (dé)branchés
  { pattern: /patient\s*:/i, color: "#38bdf8" },            // bleu : vitaux / rythme patient
  { pattern: /débitmètre|aspiration/i, color: "#2dd4bf" },  // turquoise : débitmètre / aspiration
  { pattern: /exercice démarré/i, color: "#4ade80" },       // vert : début d'exercice
  { pattern: /^log du /i, color: "#71717a" },               // gris : en-tête du log
];


const LOG_DEFAULT_COLOR = "#4ade80"; // vert : annotation manuelle / texte libre

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function colorForLine(line: string): string {
    for (const rule of LOG_COLOR_RULES) {
        if (rule.pattern.test(line)) return rule.color;
    }
    return LOG_DEFAULT_COLOR;
}


export function buildColoredLogHtml(logText: string, title: string): string {
    const lines = logText.split(/\n\n+/).map((l) => l.trim()).filter(Boolean);
    const rows = lines
        .map((line) => `<div style="color:${colorForLine(line)};">${escapeHtml(line)}</div>`)
        .join("\n");

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { background:#0c0c0d; color:#e4e4e7; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; padding:24px; white-space:pre-wrap; line-height:1.6; font-size:13px; }
  h1 { color:#e4e4e7; font-size:16px; font-weight:700; margin:0 0 16px 0; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${rows}
</body>
</html>`;
}

export const startLog = () => {

    const { logRef, lastMessageLog, appendToLog, resetLog: resetSyncedLog } = useSyncedLog();

    const downloadLogFile = useCallback(() => {

        const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
        const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace("_", ":");
        const baseName = `LOG du ${dateStr} à ${time}`;

        const downloadBlob = (blob: Blob, filename: string) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };

        downloadBlob(new Blob([logRef.current], { type: "text/plain;charset=utf-8" }), `${baseName}.txt`);

        const html = buildColoredLogHtml(logRef.current, baseName);
        downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${baseName}.html`);
    }, []);

    const resetLog = useCallback(() => {
        // Réinitialise le log pour TOUTE la session (tous les appareils) :
        // le backend repart d'un log vide et rediffuse "log_update" à tout
        // le monde ; le prochain appendToLog recréera l'en-tête.
        resetSyncedLog();
    }, [resetSyncedLog]);

    return { appendToLog, downloadLogFile, resetLog, lastMessageLog, logRef };
}