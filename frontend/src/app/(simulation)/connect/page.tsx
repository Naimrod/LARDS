"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useWebSocket } from '../../context/WebSocketContext';
import PageHeader from '../../components/PageHeader';
import { useTheme } from "../../hooks/useTheme";
import { Sun, Moon, Clock, Copy, Check, QrCode, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import * as Dialog from "@radix-ui/react-dialog";

export default function ConnectPage() {
  const router = useRouter();
  const { sessionId } = useWebSocket();
  const { theme, isTimeLocked, toggleTheme, lockToSystemTime } = useTheme();

  const [usernameInput, setUsernameInput] = useState('');
  const [isClient, setIsClient] = useState(false);
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const storedUser = localStorage.getItem('username');
    setSessionUser(storedUser);
    if (storedUser && typeof window !== "undefined") {
      setShareUrl(`${window.location.origin}/connect?username=${encodeURIComponent(storedUser)}`);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = usernameInput.trim();
    if (cleanUser) {
      localStorage.setItem('username', cleanUser);
      setSessionUser(cleanUser);
      if (typeof window !== "undefined") {
        setShareUrl(`${window.location.origin}/connect?username=${encodeURIComponent(cleanUser)}`);
      }
      router.push(`/connect?username=${encodeURIComponent(cleanUser)}`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    setSessionUser(null);
    setShareUrl("");
    router.push('/connect');
  };

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isClient) {
    return <div className="min-h-screen" style={{ backgroundColor: "var(--bg-app)" }} />;
  }

  // If user is not logged in
  if (!sessionUser || sessionUser === 'anonymous') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 font-sans relative" style={{ backgroundColor: "var(--bg-app)", color: "var(--text-primary)" }}>
        <div className="absolute top-4 right-4 flex items-center gap-1 bg-zinc-900/90 p-1 rounded-lg border border-zinc-800 shadow-md">
          <button
            onClick={toggleTheme}
            aria-label="Changer le thème"
            className="p-1 hover:bg-zinc-800 text-zinc-200 rounded transition-colors cursor-pointer"
            title={theme === "dark" ? "Mode Sombre actif (cliquer pour basculer)" : "Mode Clair actif (cliquer pour basculer)"}
          >
            {theme === "dark" ? <Moon className="w-3.5 h-3.5 text-blue-400" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
          </button>
          <button
            onClick={lockToSystemTime}
            aria-label="Synchroniser avec l'heure système"
            className={`p-1 rounded transition-colors cursor-pointer ${
              isTimeLocked ? "bg-cyan-950/80 text-cyan-400 border border-cyan-800" : "text-zinc-500 hover:text-zinc-300"
            }`}
            title={isTimeLocked ? "Thème synchronisé sur l'heure système (07h-19h Jour, 19h-07h Nuit)" : "Cliquer pour synchroniser sur l'heure système"}
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex flex-col items-center mb-2">
          <Image
            src={theme === "dark" ? "/images/IMG_0407.PNG" : "/images/IMG_0408.PNG"}
            alt="LARDS Logo"
            width={280}
            height={90}
            priority
            className="h-24 sm:h-28 w-auto object-contain transition-all duration-200"
          />
        </div>
        <h1 className="text-3xl font-bold text-center mb-4 text-zinc-100">Bienvenue sur LARDS</h1>
        <div className="p-8 w-full max-w-md mt-2 text-center flex flex-col items-center">
           
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
            <input
              type="text"
              placeholder="Tapez le nom de votre patient"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/80 transition-colors"
              required
            />
            <button
              type="submit"
              className="w-full p-3 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-700/60 font-bold rounded-lg transition-all cursor-pointer shadow-md hover:text-white"
            >
              Démarrer
            </button>
          </form>
        </div>
      </div>
    );
  }

  // If user is logged in, show application dashboard / role selection in a clean grid
  return (
    <div className="flex flex-col min-h-screen font-sans" style={{ backgroundColor: "var(--bg-app)", color: "var(--text-primary)" }}>
      <PageHeader
        title="Sélectionnez votre rôle dans la simulation"
        icon="🏥"
        username={sessionUser}
        onLogout={handleLogout}
        showBackLink={false}
      />

      <div className="p-8 flex-1 flex flex-col justify-center items-center">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl w-full">
          <div onClick={() => router.push(`/control?username=${sessionUser}`)} className="connect-card bg-[#1a1a1a] hover:bg-gray-800 p-6 border border-gray-700 hover:border-cyan-500 rounded-xl cursor-pointer transition-all flex flex-col justify-between group shadow-lg">
            <h2 className="text-xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">🎛️ Panneau de contrôle</h2>
            <p className="text-gray-400 text-sm">Contrôlez manuellement l'état et les constantes vitales du patient.</p>
          </div>

          <div onClick={() => router.push(`/defibrillator?username=${sessionUser}`)} className="connect-card bg-[#1a1a1a] hover:bg-gray-800 p-6 border border-gray-700 hover:border-cyan-500 rounded-xl cursor-pointer transition-all flex flex-col justify-between group shadow-lg">
            <h2 className="text-xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">⚡ Défibrillateur</h2>
            <p className="text-gray-400 text-sm">Simulez des scénarios de défibrillation avec l'Efficia DFM100.</p>
          </div>

          <div onClick={() => router.push(`/scope?username=${sessionUser}`)} className="connect-card bg-[#1a1a1a] hover:bg-gray-800 p-6 border border-gray-700 hover:border-cyan-500 rounded-xl cursor-pointer transition-all flex flex-col justify-between group shadow-lg">
            <h2 className="text-xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">📈 Scope</h2>
            <p className="text-gray-400 text-sm">Visualisez les constantes vitales (ECG, SpO2, CO2, BP) en temps réel.</p>
          </div>

          <div onClick={() => router.push(`/flowmeter?username=${sessionUser}`)} className="connect-card bg-[#1a1a1a] hover:bg-gray-800 p-6 border border-gray-700 hover:border-cyan-500 rounded-xl cursor-pointer transition-all flex flex-col justify-between group shadow-lg">
            <h2 className="text-xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">💨 Débitmètre</h2>
            <p className="text-gray-400 text-sm">Simulez des débitmètres d'oxygène, d'air et l'aspirateur.</p>
          </div>

          <div onClick={() => router.push(`/streamer?username=${sessionUser}`)} className="connect-card bg-[#1a1a1a] hover:bg-gray-800 p-6 border border-gray-700 hover:border-cyan-500 rounded-xl cursor-pointer transition-all flex flex-col justify-between group shadow-lg">
            <h2 className="text-xl font-bold mb-2 group-hover:text-cyan-400 transition-colors">🫀 Streamer ECG</h2>
            <p className="text-gray-400 text-sm">Diffusez les constantes d'un mannequin sur l'application</p>
          </div>

          {/* 6th Card: Partager la session (Triggers Radix Dialog Modal) */}
          <Dialog.Root open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
            <Dialog.Trigger asChild>
              <div className="connect-card bg-[#1a1a1a] hover:bg-gray-800 p-6 border border-gray-700 hover:border-cyan-500 rounded-xl cursor-pointer transition-all flex flex-col justify-between group shadow-lg">
                <div>
                  <h2 className="text-xl font-bold mb-2 group-hover:text-cyan-400 transition-colors flex items-center gap-2">
                    <span>📲</span> <span>Partager la session</span>
                  </h2>
                  <p className="text-gray-400 text-sm">
                    Afficher le QR Code et copier le lien d'accès direct pour inviter des participants.
                  </p>
                </div>
              </div>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 animate-fade-in" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-900 border border-zinc-800 p-6 sm:p-8 rounded-3xl w-[90vw] max-w-md shadow-2xl z-50 flex flex-col items-center text-center modal-content outline-none">
                <Dialog.Close asChild>
                  <button
                    className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800/80 hover:bg-zinc-800 rounded-full border border-zinc-700/60 transition-colors cursor-pointer"
                    aria-label="Fermer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </Dialog.Close>

                <div className="flex items-center gap-2 text-zinc-100 font-bold text-xl mb-1">
                  <QrCode className="w-6 h-6 text-cyan-400" />
                  <span>Partager la session</span>
                </div>
                <p className="text-xs text-zinc-400 mb-5 max-w-xs leading-relaxed">
                  Scannez ce QR Code avec un mobile ou une tablette pour rejoindre directement la simulation.
                </p>

                <div className="p-4 bg-white rounded-2xl shadow-xl border border-zinc-200 mb-5">
                  {shareUrl ? (
                    <QRCodeSVG
                      value={shareUrl}
                      size={200}
                      level="H"
                      includeMargin={false}
                    />
                  ) : (
                    <div className="w-[200px] h-[200px] bg-zinc-100 animate-pulse rounded-xl" />
                  )}
                </div>

                <div className="w-full flex items-center justify-between bg-zinc-950 px-3.5 py-2 rounded-xl border border-zinc-800 mb-4 text-xs font-mono text-zinc-300 shadow-inner">
                  <span className="text-zinc-500 font-sans font-semibold">Session :</span>
                  <span className="font-bold text-cyan-400 text-sm truncate max-w-[200px]">{sessionUser}</span>
                </div>

                <button
                  onClick={handleCopyLink}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2 border shadow-md active:scale-95 ${
                    copied
                      ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/60"
                      : "bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border-cyan-700/60 hover:text-white"
                  }`}
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? "Lien copié dans le presse-papier !" : "Copier le lien de la session"}</span>
                </button>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </div>
  );
}