"use client";

import React, { useEffect, useRef, useState } from "react";
import { Download, RotateCcw, SendHorizonal } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { useWebSocket } from "../../context/WebSocketContext";
import {
  getStoredLog,
  appendAnnotationToStoredLog,
  LOG_STORAGE_KEY,
} from "../control/Log";

const POLL_INTERVAL_MS = 2000;

export default function LogPage() {
  const { sessionId } = useWebSocket();

  const [fullLog, setFullLog] = useState<string>("");
  const [annotation, setAnnotation] = useState<string>("");
  const [justAdded, setJustAdded] = useState(false);

  const logViewRef = useRef<HTMLPreElement>(null);
  const shouldAutoScroll = useRef(true);

  const refreshFromStorage = () => {
    setFullLog(getStoredLog());
  };

  // Chargement initial + écoute des changements venant d'autres onglets
  useEffect(() => {
    refreshFromStorage();

    const onStorage = (e: StorageEvent) => {
      if (e.key === LOG_STORAGE_KEY) refreshFromStorage();
    };
    window.addEventListener("storage", onStorage);

    const interval = setInterval(refreshFromStorage, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, []);

  // Auto-scroll vers le bas quand le log grandit, sauf si l'utilisateur a
  // remonté manuellement pour relire un passage.
  useEffect(() => {
    const el = logViewRef.current;
    if (el && shouldAutoScroll.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [fullLog]);

  const handleScroll = () => {
    const el = logViewRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScroll.current = distanceFromBottom < 40;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = annotation.trim();
    if (!trimmed) return;

    const { log } = appendAnnotationToStoredLog(trimmed);
    setFullLog(log);
    setAnnotation("");
    shouldAutoScroll.current = true;

    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1000);
  };

  const handleDownload = () => {
    const blob = new Blob([fullLog], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date()
      .toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
      .replace(".", "");
    const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const link = document.createElement("a");
    link.href = url;
    link.download = `LOG du ${dateStr} à ${time}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="font-sans bg-black text-white h-screen max-h-screen overflow-hidden flex flex-col">
      <PageHeader title="Journal de séance" icon="📝" username={sessionId} />

      <div className="flex-1 flex flex-col w-full min-h-0 overflow-hidden p-4 gap-3 max-w-4xl mx-auto">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-zinc-200 text-xs font-bold uppercase tracking-wider m-0">
            Contenu intégral du log
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshFromStorage}
              className="flex items-center gap-1.5 bg-[#1a1a1e] hover:bg-[#232327] text-zinc-300 border border-zinc-700/60 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              title="Rafraîchir depuis le stockage local"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Rafraîchir
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 bg-[#1a1a1e] hover:bg-[#232327] text-cyan-400 border border-cyan-800/60 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              title="Télécharger le log en .txt"
            >
              <Download className="w-3.5 h-3.5" />
              Télécharger
            </button>
          </div>
        </div>

        <pre
          ref={logViewRef}
          onScroll={handleScroll}
          className="flex-1 w-full bg-[#0c0c0d] border border-zinc-800 rounded-lg p-3 overflow-y-auto text-xs font-mono text-zinc-200 whitespace-pre-wrap leading-relaxed"
        >
          {fullLog || "Le log est vide pour l'instant."}
        </pre>

        <form onSubmit={handleSubmit} className="w-full shrink-0">
          <div className="relative flex items-center w-full">
            <input
              type="text"
              placeholder="Annoter dans le log..."
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              className="w-full bg-[#111111] border border-zinc-800 rounded-lg pl-3 pr-24 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/80 transition-colors"
            />
            <button
              type="submit"
              disabled={!annotation.trim()}
              className="absolute right-1.5 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-md bg-cyan-950/80 text-cyan-400 border border-cyan-800 hover:bg-cyan-900/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <SendHorizonal className="w-3 h-3" />
              Ajouter
            </button>
          </div>
          {justAdded && (
            <p className="text-[11px] text-emerald-400 mt-1.5 mb-0">Annotation ajoutée au log ✓</p>
          )}
        </form>
      </div>
    </div>
  );
}