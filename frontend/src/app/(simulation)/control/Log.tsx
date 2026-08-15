import { useRef, useCallback } from "react";


export const LOG_STORAGE_KEY = "lards_log";
export const LOG_RECENT_STORAGE_KEY = "lards_log_recent";

function readStorageValue(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorageValue(key: string, value: string) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
    }
}

export function getStoredLog(): string {
    return readStorageValue(LOG_STORAGE_KEY) ?? "";
}


export function getStoredLogRecent(): string[] {
    const raw = readStorageValue(LOG_RECENT_STORAGE_KEY);
    if (!raw) return [''];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [''];
    } catch {
        return [''];
    }
}

export function appendAnnotationToStoredLog(message: string): { log: string; recent: string[] } {
    const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const line = `[${time}] ${message}\n\n`;

    let currentLog = getStoredLog();
    if (!currentLog) {
        const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
        currentLog = `Log du ${dateStr} ${time} :\n-------------------\n`;
    }
    const newLog = currentLog + line;

    const recent = getStoredLogRecent();
    if (recent.length < 5) {
        recent.reverse();
        recent.push(line);
        recent.reverse();
    } else {
        recent.pop();
        recent.reverse();
        recent.push(line);
        recent.reverse();
    }

    writeStorageValue(LOG_STORAGE_KEY, newLog);
    writeStorageValue(LOG_RECENT_STORAGE_KEY, JSON.stringify(recent));

    return { log: newLog, recent };
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

    const logRef = useRef<string>("");
    const lastMessageLog = useRef<string[]>(['']);
    const initialized = useRef(false);

    const persist = useCallback(() => {
        writeStorageValue(LOG_STORAGE_KEY, logRef.current);
        writeStorageValue(LOG_RECENT_STORAGE_KEY, JSON.stringify(lastMessageLog.current));
    }, []);

    if (!initialized.current) {
        initialized.current = true;
        const storedLog = readStorageValue(LOG_STORAGE_KEY);
        if (storedLog) {
            logRef.current = storedLog;
            lastMessageLog.current = getStoredLogRecent();
        } else {
            const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
            const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            logRef.current = `Log du ${dateStr} ${time} :\n-------------------\n`;
            lastMessageLog.current.push(`Log du ${dateStr} ${time} :\n-------------------\n`);
            persist();
        }
    }

    const appendToLog = useCallback((message: string) => {
        const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const line = `[${time}] ${message}\n\n`;

        const latestLog = readStorageValue(LOG_STORAGE_KEY);
        if (latestLog !== null) logRef.current = latestLog;
        const latestRecent = getStoredLogRecent();
        if (readStorageValue(LOG_RECENT_STORAGE_KEY) !== null) lastMessageLog.current = latestRecent;

        logRef.current += line;
        if (lastMessageLog.current.length < 5) {
            lastMessageLog.current.reverse();
            lastMessageLog.current.push(line);
            lastMessageLog.current.reverse();
        } else {            
            lastMessageLog.current.pop();
            lastMessageLog.current.reverse();
            lastMessageLog.current.push(line);
            lastMessageLog.current.reverse();
        }
        persist();
    }, [persist]);

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
        const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
        logRef.current = `Log du ${dateStr} :\n-------------------\n`;
        while (lastMessageLog.current.length !== 0) {
            lastMessageLog.current.pop()
        }
        lastMessageLog.current.push(`Log du ${dateStr} :\n-------------------\n`)
        persist();
    }, [persist])
    return { appendToLog, downloadLogFile, resetLog, lastMessageLog, logRef};
}