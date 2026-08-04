import { useRef, useCallback } from "react";

// Clés utilisées dans le localStorage pour que le log de séance survive
// à un rechargement de page et reste accessible depuis n'importe quelle
// autre page de l'app, y compris dans un autre onglet/fenêtre (le
// localStorage est partagé entre tous les onglets du même navigateur,
// contrairement au sessionStorage).
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
        // localStorage indisponible (mode privé, quota, etc.) : on continue
        // silencieusement, le log reste au moins disponible en mémoire.
    }
}

/**
 * Permet de lire le log de séance courant depuis n'importe quelle page,
 * sans passer par le hook startLog() (donc sans dépendre du composant
 * control/page.tsx). Renvoie une chaîne vide si aucun log n'existe encore.
 */
export function getStoredLog(): string {
    return readStorageValue(LOG_STORAGE_KEY) ?? "";
}

/**
 * Idem pour les derniers messages (les mêmes que ceux affichés dans le
 * panneau "logDisplay" du control panel), sous forme de tableau de chaînes.
 */
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

export const startLog = () => {

    const logRef = useRef<string>("");
    const lastMessageLog = useRef<string[]>(['']);
    const initialized = useRef(false);

    const persist = useCallback(() => {
        writeStorageValue(LOG_STORAGE_KEY, logRef.current);
        writeStorageValue(LOG_RECENT_STORAGE_KEY, JSON.stringify(lastMessageLog.current));
    }, []);

    // Initialisation : on tente de reprendre un log déjà en localStorage
    // (rechargement de page, navigation depuis une autre page) ; sinon on
    // démarre un nouveau log, comme avant.
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

        // On repart systématiquement de la version la plus fraîche du
        // localStorage (et pas de logRef.current, potentiellement obsolète)
        // pour ne pas écraser une annotation ajoutée entretemps depuis une
        // autre page/onglet (ex: la page /log).
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

        const blob = new Blob([logRef.current], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
        const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace("_", ":");
        const link = document.createElement("a");
        link.href = url;
        link.download = `LOG du ${dateStr} à ${time}.txt`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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