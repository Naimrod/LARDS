"use client";

import React, { useEffect, useRef, useState } from "react";
import { Download, RotateCcw, SendHorizonal } from "lucide-react";
import PageHeader from "../../components/PageHeader";
import { useWebSocket } from "../../context/WebSocketContext";
import {
  getStoredLog,
  appendAnnotationToStoredLog,
  buildColoredLogHtml,
  LOG_STORAGE_KEY,
} from "../control/Log";

const POLL_INTERVAL_MS = 2000;
const PSEUDO_STORAGE_KEY = "lards_log_pseudo";

export default function LogPage() {
  const { sessionId } = useWebSocket();

  const [fullLog, setFullLog] = useState<string>("");
  const [annotation, setAnnotation] = useState<string>("");
  const [justAdded, setJustAdded] = useState(false);

  // Pseudo de la personne qui écrit sur cette page, pour identifier qui a
  // ajouté quoi dans le log (les évènements automatiques et les
  // annotations tapées depuis la page contrôle portent, eux, le tag fixe
  // "[Télécommande]"). Mémorisé dans le navigateur pour ne pas avoir à le
  // retaper à chaque visite.
  const [pseudo, setPseudo] = useState<string>("");
  const [pseudoInput, setPseudoInput] = useState<string>("");
  const [pseudoLoaded, setPseudoLoaded] = useState(false);

  const logViewRef = useRef<HTMLPreElement>(null);
  const shouldAutoScroll = useRef(true);

  const refreshFromStorage = () => {
    setFullLog(getStoredLog());
  };

  // Chargement initial + écoute des changements venant d'autres onglets
  useEffect(() => {
    refreshFromStorage();

    try {
      const storedPseudo = window.localStorage.getItem(PSEUDO_STORAGE_KEY);
      if (storedPseudo) setPseudo(storedPseudo);
    } catch {
      // localStorage indisponible : on demandera simplement le pseudo à chaque visite
    }
    setPseudoLoaded(true);

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
    if (!pseudo) return; // sécurité : le formulaire est de toute façon désactivé sans pseudo
    const trimmed = annotation.trim();
    if (!trimmed) return;

    const { log } = appendAnnotationToStoredLog(`[${pseudo}] ${trimmed}`);
    setFullLog(log);
    setAnnotation("");
    shouldAutoScroll.current = true;

    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1000);
  };

  const handleSetPseudo = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pseudoInput.trim();
    if (!trimmed) return;
    setPseudo(trimmed);
    try {
      window.localStorage.setItem(PSEUDO_STORAGE_KEY, trimmed);
    } catch {
      // localStorage indisponible : le pseudo restera valable pour cette page tant qu'elle reste ouverte
    }
  };

  const handleChangePseudo = () => {
    setPseudoInput(pseudo);
    setPseudo("");
  };

  const handleDownload = () => {
    const dateStr = new Date()
      .toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
      .replace(".", "");
    const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

    // .txt : toujours fourni, pour rester exploitable partout.
    downloadBlob(new Blob([fullLog], { type: "text/plain;charset=utf-8" }), `${baseName}.txt`);

    // .html : version colorée (un .txt ne peut pas porter de couleur).
    const html = buildColoredLogHtml(fullLog, baseName);
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${baseName}.html`);
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

        <div className="w-full shrink-0">
          {pseudoLoaded && !pseudo ? (
            <form onSubmit={handleSetPseudo} className="w-full">
              <p className="text-[20px] text-zinc-400 mb-1.5">
                Veuillez entrer un pseudonyme.
              </p>
              <div className="relative flex items-center w-full">
                <input
                  type="text"
                  autoFocus
                  placeholder="Ton pseudo..."
                  value={pseudoInput}
                  onChange={(e) => setPseudoInput(e.target.value)}
                  className="w-full bg-[#111111] border border-cyan-800/60 rounded-lg pl-3 pr-24 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/80 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!pseudoInput.trim()}
                  className="absolute right-1.5 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-md bg-cyan-950/80 text-cyan-400 border border-cyan-800 hover:bg-cyan-900/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Valider
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="w-full">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] text-zinc-500 m-0">
                  Tu écris en tant que <span className="text-cyan-400 font-semibold">{pseudo}</span>
                </p>
                <button
                  type="button"
                  onClick={handleChangePseudo}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2 cursor-pointer"
                >
                  Changer de pseudo
                </button>
              </div>
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
          )}
        </div>
      </div>
    </div>
  );
}