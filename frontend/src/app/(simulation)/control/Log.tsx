import { useRef, useState, useCallback } from "react";

export const startLog = () => {
    const logRef = useRef<string>("");
    const [logList, setLogList] = useState<string[]>(() => {
        const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
        const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const header = `Log du ${dateStr} ${time} :\n-------------------`;
        logRef.current = header + "\n\n";
        return [header];
    });

    const appendToLog = useCallback((message: string) => {
        const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const entry = `[${time}] ${message}`;
        logRef.current += entry + "\n\n";

        setLogList((prev) => [...prev, entry]);
    }, []);

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
        const header = `Log du ${dateStr} :\n-------------------`;
        logRef.current = header + "\n\n";
        setLogList([header]);
    }, []);

    return { appendToLog, downloadLogFile, resetLog, logList, lastMessageLog: { current: logList }, logRef };
};