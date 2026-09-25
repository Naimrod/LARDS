"use client";

import PageHeader from "./PageHeader";

import React, { useState, useRef, useEffect } from "react";
import { useModals } from "../hooks/useModals";
import ScenariosListModal from "./modals/ScenariosListModal";
import { SCENARIOS } from "../data/scenarios";
import { useWebSocket } from "../context/WebSocketContext";
import HelpTooltip from "./HelpTooltip";

function ScaledScopeIframe({ src }: { src: string }) {
  return (
    <iframe 
      src={src}
      title="Scope Preview"
      allow="autoplay"
      className="w-full h-full border-none"
    />
  );
}

interface ControlPanelProps {
  username: string;
  onLogout: () => void;
  onReset: () => void;
  scenarioId: string;
  showHints: boolean;
  onToggleHints: (val: boolean) => void;
  rhythm: string;
  rhythmLabel: string;
  bpm: number;
  spo2: number;
  co2: number;
  systolic: number;
  diastolic: number;
  respiration: number;
  hrDotted: boolean;
  pressureDotted: boolean;
  co2Dotted: boolean;
  bpDotted: boolean;
  hrDefibDotted: boolean;
  pressureDefibDotted: boolean;
  co2DefibDotted: boolean;
  bpDefibDotted: boolean;
  starting: boolean;
  inputLog: string;
  logDisplay : any;
  setRhythm: (val: string) => void;
  setRhythmLabel: (val: string) => void;
  setBpm: (val: number) => void;
  setSpo2: (val: number) => void;
  setCo2: (val: number) => void;
  setSystolic: (val: number) => void;
  setDiastolic: (val: number) => void;
  setRespiration: (val: number) => void;
  onScenarioSelect: (id: string) => void;
  sendECG: () => void;
  sendSpo2: () => void;
  sendCO2: () => void;
  setStart: (val: boolean) => void;
  setInputLog:(e :any) => void;
  sendStart: (val: boolean) => void;
  sendLogDemand: () => void
  sendPressure: () => void;
  sendRespiration: () => void;
  sendRhythm: (value: string, label: string) => void;
  sendHRDotted: (val: boolean) => void;
  sendPressureDotted: (val: boolean) => void;
  sendCO2Dotted: (val: boolean) => void;
  sendBPDotted: (val: boolean) => void;
  sendDefibHRDotted: (val: boolean) => void;
  sendDefibPressureDotted: (val: boolean) => void;
  sendDefibCO2Dotted: (val: boolean) => void;
  sendDefibBPDotted: (val: boolean) => void;
  sendDefibControlMode: (val: boolean) => void;
  isDefibRemoteControl: boolean;
  isRemoteControl: boolean;
  sendControlMode: (val: boolean) => void;
  sendLogInput: (e : any) => void;
}

import * as Slider from "@radix-ui/react-slider";
import * as Accordion from "@radix-ui/react-accordion";
import * as Switch from "@radix-ui/react-switch";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import { ChevronDown, ChevronUp, Search, Check, Wind, Activity, Film, CornerDownLeft, Play, Pause, RotateCcw, Square, Flag } from "lucide-react";

const RHYTHM_CATEGORIES = [
  {
    category: "Rythmes Sinusaux & Supraventriculaires",
    items: [
      { value: "sinusal", label: "Sinusal", img: "../images/rythm_image/Sinus.png" },
      { value: "tachy_a", label: "Tachy A.", img: "../images/rythm_image/tachya.png" },
      { value: "tsv", label: "TSV", img: "../images/rythm_image/TSV.png" },
      { value: "jonctionnel", label: "Jonctionnel", img: "../images/rythm_image/Junctionnel.png" },
      { value: "fib_a", label: "Fibrillation A.", img: "../images/rythm_image/FibA.png" },
      { value: "flutt_a", label: "Flutt A.", img: "../images/rythm_image/FluttA.png" },
    ]
  },
  {
    category: "Troubles de la Conduction (BAV)",
    items: [
      { value: "1_bav", label: "1° BAV", img: "../images/rythm_image/1BAV.png" },
      { value: "2_bav_I", label: "2° BAV I", img: "../images/rythm_image/2BAV1.png" },
      { value: "2_bav_II", label: "2° BAV II", img: "../images/rythm_image/2BAV2.png" },
      { value: "3_bav", label: "3° BAV", img: "../images/rythm_image/3BAV.png" },
    ]
  },
  {
    category: "Rythmes Ventriculaires & Chocs",
    items: [
      { value: "idiov", label: "Idiov.", img: "../images/rythm_image/idiov.png" },
      { value: "tv_1", label: "TV de type 1", img: "../images/rythm_image/TV1.png" },
      { value: "tv_2", label: "TV de type 2", img: "../images/rythm_image/TV2.png" },
      { value: "tors", label: "Torsade", img: "../images/rythm_image/torsade.png" },
      { value: "fv", label: "FV", img: "../images/rythm_image/FV.png" },
    ]
  },
  {
    category: "Hypertrophies & Déviations",
    items: [
      { value: "rs_hvg", label: "RS av. HVG", img: "../images/rythm_image/RSavHVG.png" },
      { value: "rs_hd", label: "RS av. HD", img: "../images/rythm_image/RSavHD.png" },
      { value: "rs_hvd", label: "RS av. HVD", img: "../images/rythm_image/RSavHD.png" },
    ]
  },
  {
    category: "Ischémie",
    items: [
      { value: "infarctus", label: "Infarctus (STEMI)", img: "../images/rythm_image/Sinus.png" },
    ]
  },
  {
    category: "Stimulateurs Cardiaques (Pace)",
    items: [
      { value: "stim", label: "Stimulateur", img: "../images/rythm_image/Stim.png" },
      { value: "seq", label: "Séq. A-V du stimulateur", img: "../images/rythm_image/seqavsti.png" },
      { value: "p_cap", label: "P.capture stimulateur", img: "../images/rythm_image/Pcapsti.png" },
    ]
  },
  {
    category: "Arrêt Cardiaque",
    items: [
      { value: "asysto", label: "Asystolie", img: "../images/rythm_image/Asys.png" },
    ]
  }
];

function RhythmSelect({
  value,
  selectedLabel,
  onRhythmSelect,
}: {
  value: string;
  selectedLabel: string;
  onRhythmSelect: (value: string, label: string) => void;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={(val) => {
        for (const cat of RHYTHM_CATEGORIES) {
          const found = cat.items.find((i) => i.value === val);
          if (found) {
            onRhythmSelect(val, found.label);
            break;
          }
        }
      }}
    >
      <Select.Trigger className="w-full flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 rounded-lg px-3 py-2 text-sm font-bold transition-all cursor-pointer outline-none group text-left">
        <Select.Value placeholder="Choisir un rythme...">
          {selectedLabel || "Choisir un rythme..."}
        </Select.Value>
        <Select.Icon>
          <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0 opacity-70 group-data-[state=open]:rotate-180 transition-transform ml-2" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={5}
          className="w-[var(--radix-select-trigger-width)] max-h-[260px] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-[150] text-zinc-100 overflow-hidden outline-none flex flex-col"
        >
          <Select.ScrollUpButton className="flex items-center justify-center h-6 bg-zinc-900 text-zinc-400 cursor-pointer shrink-0">
            <ChevronUp className="w-4 h-4" />
          </Select.ScrollUpButton>

          <Select.Viewport className="p-1.5 overflow-y-auto max-h-[230px] flex flex-col gap-1">
            {RHYTHM_CATEGORIES.map((cat, catIdx) => (
              <Select.Group key={catIdx} className="mb-1.5">
                <Select.Label className="select-label text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2 py-1 bg-zinc-900/80 rounded mb-1 block">
                  {cat.category}
                </Select.Label>
                {cat.items.map((rItem) => (
                  <Select.Item
                    key={rItem.value}
                    value={rItem.value}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800 data-[highlighted]:bg-zinc-800 cursor-pointer outline-none transition-colors text-xs text-zinc-200 hover:text-white data-[highlighted]:text-white group my-0.5"
                  >
                    <div className="flex items-center gap-2">
                      <Select.ItemIndicator>
                        <Check className="w-3.5 h-3.5" />
                      </Select.ItemIndicator>
                      <Select.ItemText className="font-medium">{rItem.label}</Select.ItemText>
                    </div>
                    {rItem.img && (
                      <img
                        src={rItem.img}
                        alt={rItem.label}
                        className="h-6 object-contain rounded bg-black px-1.5 py-0.5 border border-zinc-800 group-hover:border-zinc-600 transition-colors"
                      />
                    )}
                  </Select.Item>
                ))}
              </Select.Group>
            ))}
          </Select.Viewport>

          <Select.ScrollDownButton className="flex items-center justify-center h-6 bg-zinc-900 text-zinc-400 cursor-pointer shrink-0">
            <ChevronDown className="w-4 h-4" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function ScenarioSelect({
  scenarioId,
  onScenarioSelect,
}: {
  scenarioId: string;
  onScenarioSelect: (id: string) => void;
}) {
  const currentScenario = SCENARIOS.find((s) => s.id === scenarioId);
  const displayTitle = currentScenario ? currentScenario.title : (scenarioId || "Aucun");

  return (
    <Select.Root
      value={scenarioId}
      onValueChange={(val) => onScenarioSelect(val)}
    >
      <Select.Trigger className="w-full flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-bold transition-all cursor-pointer outline-none group text-left">
        <div className="flex items-center gap-2 truncate">
          {currentScenario?.icon && <span className="text-sm shrink-0">{currentScenario.icon}</span>}
          <Select.Value placeholder="Sélectionner un scénario...">
            {displayTitle}
          </Select.Value>
        </div>
        <Select.Icon>
          <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0 opacity-70 group-data-[state=open]:rotate-180 transition-transform ml-2" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={5}
          className="w-[var(--radix-select-trigger-width)] max-h-[260px] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-[150] text-zinc-100 overflow-hidden outline-none flex flex-col"
        >
          <Select.ScrollUpButton className="flex items-center justify-center h-6 bg-zinc-900 text-zinc-400 cursor-pointer shrink-0">
            <ChevronUp className="w-4 h-4" />
          </Select.ScrollUpButton>

          <Select.Viewport className="p-1.5 overflow-y-auto max-h-[230px] flex flex-col gap-1">
            <Select.Item
              value="Aucun"
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800 data-[highlighted]:bg-zinc-800 cursor-pointer outline-none transition-colors text-xs text-zinc-400 hover:text-zinc-200 group my-0.5"
            >
              <div className="flex items-center gap-2">
                <Select.ItemIndicator>
                  <Check className="w-3.5 h-3.5 text-cyan-400" />
                </Select.ItemIndicator>
                <Select.ItemText className="font-medium italic">Aucun scénario</Select.ItemText>
              </div>
            </Select.Item>

            {SCENARIOS.map((scen) => (
              <Select.Item
                key={scen.id}
                value={scen.id}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800 data-[highlighted]:bg-zinc-800 cursor-pointer outline-none transition-colors text-xs text-zinc-200 hover:text-white data-[highlighted]:text-white group my-0.5"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Select.ItemIndicator>
                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  </Select.ItemIndicator>
                  <span className="text-sm shrink-0">{scen.icon}</span>
                  <Select.ItemText className="font-medium truncate">{scen.title}</Select.ItemText>
                </div>
              </Select.Item>
            ))}
          </Select.Viewport>

          <Select.ScrollDownButton className="flex items-center justify-center h-6 bg-zinc-900 text-zinc-400 cursor-pointer shrink-0">
            <ChevronDown className="w-4 h-4" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

// --- Item d'accordéon (pour le Root unique) ---
function AccordionItem({
  value,
  title,
  color,
  children,
  summary,
}: {
  value: string;
  title: string;
  color: string;
  children: React.ReactNode;
  summary?: string;
}) {
  return (
    <Accordion.Item value={value} className="w-full border-l-4 transition-colors" style={{ borderLeftColor: color }}>
      <Accordion.Header className="m-0 p-0 flex">
        <Accordion.Trigger
          className="w-full flex items-center justify-between px-4 py-3.5 border-none cursor-pointer font-bold text-sm text-left gap-2.5 bg-zinc-900/40 hover:bg-zinc-800/60 transition-colors group"
          style={{ color: color }}
        >
          <span>{title}</span>
          <span className="flex items-center gap-3">
            {summary && (
              <span className="font-bold text-xs opacity-90 group-data-[state=open]:hidden" style={{ color: color }}>
                {summary}
              </span>
            )}
            <span className="text-xs opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180">
              ▼
            </span>
          </span>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="p-4 flex flex-col gap-3 bg-[#111111] text-white border-t border-zinc-800/40">
        {children}
      </Accordion.Content>
    </Accordion.Item>
  );
}

// --- Slider avec label intégré (Radix Slider) ---
function SliderRow({
  label,
  value,
  min,
  max,
  color,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  color?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex justify-between items-center text-xs">
        <label className="font-bold" style={{ color: color ?? "#ccc" }}>{label}</label>
        <strong className="font-mono text-sm" style={{ color: color ?? "white", minWidth: "40px", textAlign: "right" }}>
          {value}
        </strong>
      </div>
      <Slider.Root
        className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer"
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
      >
        <Slider.Track className="bg-zinc-800 relative grow rounded-full h-2 overflow-hidden border border-zinc-700">
          <Slider.Range className="absolute h-full rounded-full" style={{ backgroundColor: color ?? "#3b82f6" }} />
        </Slider.Track>
        <Slider.Thumb
          className="block w-4 h-4 bg-white rounded-full shadow-md hover:scale-110 focus:outline-none focus:ring-2 focus:ring-slate-400 transition-transform"
          style={{ borderColor: color ?? "#3b82f6" }}
        />
      </Slider.Root>
    </div>
  );
}

// --- THE INDIVIDUAL CONTROL DEVICE BOX ---
function DeviceBox({ deviceId, type, sessionId, sendMessage, globalProps, subscribeMessage, lastMessage, memory }: any) {
  const shortId = deviceId.split('_')[1] || deviceId;
  
  // Chargement pur depuis la mémoire (par défaut: caché/false si l'appareil est nouveau)
  const devMem = memory?.current[deviceId] || {};
  const [showECG, setShowECG] = useState(devMem.showECG ?? false);
  const [showSpO2, setShowSpO2] = useState(devMem.showSpO2 ?? false);
  const [showCO2, setShowCO2] = useState(devMem.showCO2 ?? false);
  const [showBP, setShowBP] = useState(devMem.showBP ?? false); 

  // On écoute uniquement les VRAIS changements du Master
  const prevHr = useRef(type === "Défib" ? globalProps.hrDefibDotted : globalProps.hrDotted);
  const prevPr = useRef(type === "Défib" ? globalProps.pressureDefibDotted : globalProps.pressureDotted);
  const prevCo2 = useRef(type === "Défib" ? globalProps.co2DefibDotted : globalProps.co2Dotted);
  const prevBp = useRef(type === "Défib" ? globalProps.bpDefibDotted : globalProps.bpDotted);

  useEffect(() => {
    const current = type === "Défib" ? globalProps.hrDefibDotted : globalProps.hrDotted;
    if (current !== prevHr.current) {
      setShowECG(!current);
      if (memory?.current) memory.current[deviceId] = { ...memory.current[deviceId], showECG: !current };
      prevHr.current = current;
    }
  }, [globalProps.hrDotted, globalProps.hrDefibDotted, type, deviceId, memory]);

  useEffect(() => {
    const current = type === "Défib" ? globalProps.pressureDefibDotted : globalProps.pressureDotted;
    if (current !== prevPr.current) {
      setShowSpO2(!current);
      if (memory?.current) memory.current[deviceId] = { ...memory.current[deviceId], showSpO2: !current };
      prevPr.current = current;
    }
  }, [globalProps.pressureDotted, globalProps.pressureDefibDotted, type, deviceId, memory]);

  useEffect(() => {
    const current = type === "Défib" ? globalProps.co2DefibDotted : globalProps.co2Dotted;
    if (current !== prevCo2.current) {
      setShowCO2(!current);
      if (memory?.current) memory.current[deviceId] = { ...memory.current[deviceId], showCO2: !current };
      prevCo2.current = current;
    }
  }, [globalProps.co2Dotted, globalProps.co2DefibDotted, type, deviceId, memory]);

  useEffect(() => {
    const current = type === "Défib" ? globalProps.bpDefibDotted : globalProps.bpDotted;
    if (current !== prevBp.current) {
      setShowBP(!current);
      if (memory?.current) memory.current[deviceId] = { ...memory.current[deviceId], showBP: !current };
      prevBp.current = current;
    }
  }, [globalProps.bpDotted, globalProps.bpDefibDotted, type, deviceId, memory]);

  // INJECTION TACTIQUE (Avec délai pour vaincre la course de vitesse)
  useEffect(() => {
    if (shortId === 'CONTR') return;
    
    const timer = setTimeout(() => {
      const isDefib = (type === "Défib");
      const keyPrefix = isDefib ? 'defib' : '';
      const payload: Record<string, any> = {
        type: "visibility_state",
        target_device: deviceId,
        [`${keyPrefix}hrDotted`]: !showECG,
        [`${keyPrefix}pressureDotted`]: !showSpO2,
        [`${keyPrefix}co2Dotted`]: !showCO2,
        [`${keyPrefix}bpDotted`]: !showBP,
      };
      sendMessage(payload);
    }, 200);

    return () => clearTimeout(timer);
  }, []); // [] = S'exécute strictement à l'apparition de l'appareil !

  // Synchronisation si l'étudiant clique lui-même
  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (!msg) return;

      const target = msg.target_device || msg.source_device;
      if (target && target !== deviceId) return;
      if (type === "Défib" && msg.dataType === "defib") {
        if (msg.type === "HRscope" && msg.isDefibHRDotted !== undefined) setShowECG(!msg.isDefibHRDotted);
        if (msg.type === "Prscope" && msg.isDefibPressureDotted !== undefined) setShowSpO2(!msg.isDefibPressureDotted);
        if (msg.type === "COscope" && msg.isDefibCO2Dotted !== undefined) setShowCO2(!msg.isDefibCO2Dotted);
      }
      if (type !== "Défib" && msg.dataType === "scope") {
        if (msg.type === "HRscope" && msg.isHRDotted !== undefined) setShowECG(!msg.isHRDotted);
        if (msg.type === "Prscope" && msg.isPressureDotted !== undefined) setShowSpO2(!msg.isPressureDotted);
        if (msg.type === "COscope" && msg.isCO2Dotted !== undefined) setShowCO2(!msg.isCO2Dotted);
      }
    };

    const unsubscribe = subscribeMessage ? subscribeMessage(handleMessage) : () => {};
    return () => unsubscribe();
   }, [subscribeMessage, type, deviceId]);

  // Clic manuel du formateur
  const handleVisibilityToggle = (sensor: 'ecg' | 'spo2' | 'co2' | 'bp', isVisible: boolean) => {
    if (sensor === 'ecg') { setShowECG(isVisible); if (memory?.current) memory.current[deviceId] = { ...memory.current[deviceId], showECG: isVisible }; }
    if (sensor === 'spo2') { setShowSpO2(isVisible); if (memory?.current) memory.current[deviceId] = { ...memory.current[deviceId], showSpO2: isVisible }; }
    if (sensor === 'co2') { setShowCO2(isVisible); if (memory?.current) memory.current[deviceId] = { ...memory.current[deviceId], showCO2: isVisible }; }
    if (sensor === 'bp') { setShowBP(isVisible); if (memory?.current) memory.current[deviceId] = { ...memory.current[deviceId], showBP: isVisible }; }

    const isDefib = (type === "Défib");
    const payload: any = { type: "visibility_state", target_device: deviceId, session_id: sessionId };
    const payload2: any = { type: "visibility_state", session_id: sessionId };

    if (isDefib) {
      payload2.target_device = 'defibrillator_CONTR';
      payload.defibHrDotted       = sensor === 'ecg'  ? !isVisible : !showECG;
      payload.defibPressureDotted = sensor === 'spo2' ? !isVisible : !showSpO2;
      payload.defibCo2Dotted      = sensor === 'co2'  ? !isVisible : !showCO2;
      payload.defibBpDotted       = sensor === 'bp'   ? !isVisible : !showBP;
      
      payload2.defibHrDotted       = payload.defibHrDotted;
      payload2.defibPressureDotted = payload.defibPressureDotted;
      payload2.defibCo2Dotted      = payload.defibCo2Dotted;
      payload2.defibBpDotted       = payload.defibBpDotted;
    } else {
      payload2.target_device = 'scope_CONTR';
      payload.hrDotted       = sensor === 'ecg'  ? !isVisible : !showECG;
      payload.pressureDotted = sensor === 'spo2' ? !isVisible : !showSpO2;
      payload.co2Dotted      = sensor === 'co2'  ? !isVisible : !showCO2;
      payload.bpDotted       = sensor === 'bp'   ? !isVisible : !showBP;
      
      payload2.hrDotted       = payload.hrDotted;
      payload2.pressureDotted = payload.pressureDotted;
      payload2.co2Dotted      = payload.co2Dotted;
      payload2.bpDotted       = payload.bpDotted;
    }

    sendMessage(payload);
    sendMessage(payload2);
  };

  const handleForceShutdown = () => {
    sendMessage({ type: "defibrillator_action", action: "set_display_mode", display_mode: "ARRET", target_device: deviceId, session_id: sessionId });
  };

  if (shortId === 'CONTR') return null;

  return (
    <div className="bg-[#09090b] border border-zinc-800 p-3 rounded-xl flex flex-col justify-between h-[88%] gap-2.5 min-w-[320px] shrink-0 shadow-lg transition-colors">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <strong className={`text-sm font-bold ${type === 'Scope' ? 'text-cyan-400' : 'text-red-400'}`}>
            {type === 'Scope' ? 'Scope' : 'Défibrillateur'}
          </strong>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border shadow-sm device-id-badge">
            ID: {shortId}
          </span>
        </div>
      </div>

      <div className="bg-[#141414] p-3 rounded-lg border border-zinc-800/80 flex flex-col gap-2.5">
        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <span>Contrôle de l'affichage</span>
          <HelpTooltip content="Réglez l'affichage côté apprenants lorsque vous avez la main." />
        </div>
        <div className="flex gap-3 text-xs font-semibold text-zinc-200 flex-wrap">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showECG}
              disabled={type === "Défib" ? !globalProps.isDefibRemoteControl : !globalProps.isRemoteControl}
              onChange={(e) => handleVisibilityToggle('ecg', e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer accent-cyan-500 disabled:cursor-not-allowed"
            />
            ECG/FRVA
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSpO2}
              disabled={type === "Défib" ? !globalProps.isDefibRemoteControl : !globalProps.isRemoteControl}
              onChange={(e) => handleVisibilityToggle('spo2', e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer accent-cyan-500 disabled:cursor-not-allowed"
            />
            SpO2/POULS
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCO2}
              disabled={type === "Défib" ? !globalProps.isDefibRemoteControl : !globalProps.isRemoteControl}
              onChange={(e) => handleVisibilityToggle('co2', e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer accent-cyan-500 disabled:cursor-not-allowed"
            />
            CO2
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showBP}
              disabled={type === "Défib" ? !globalProps.isDefibRemoteControl : !globalProps.isRemoteControl}
              onChange={(e) => handleVisibilityToggle('bp', e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer accent-cyan-500 disabled:cursor-not-allowed"
            />
            TA
          </label>
        </div>
      </div>

      {type === "Défib" ? (
        <button onClick={handleForceShutdown} className="w-full bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-700/60 font-bold text-xs py-1.5 rounded-lg transition-all cursor-pointer shadow-sm active:scale-[0.99]">
          Force OFF
        </button>
      ) : (
        <div className="h-[28px]" />
      )}
    </div>
  );
}

// --- RYTHM BUTTON ---
function RythmButton({ value, label, img, onSelect }: { value: string, label: string, img: string, onSelect: (v: string, l: string) => void }) {
  return (
    <button
      onClick={() => onSelect(value, label)}
      className="w-full flex items-center justify-between p-3 rounded-xl bg-[#141414] hover:bg-[#1f1f1f] border border-zinc-800 hover:border-zinc-700 transition-all text-zinc-200 hover:text-white cursor-pointer group text-left"
    >
      <span className="text-sm font-medium">{label}</span>
      {img && (
        <img
          src={img}
          alt={label}
          className="h-7 object-contain rounded bg-black px-2 py-0.5 border border-zinc-800 group-hover:border-zinc-600 transition-colors"
        />
      )}
    </button>
  );
}


export default function ControlPanel(props: ControlPanelProps) {
  const modals = useModals();
  const [isRhythmModalOpen, setIsRhythmModalOpen] = useState(false);
  const [isLiveHardware, setIsLiveHardware] = useState(false);
  const { activeDevices, sendMessage, subscribeMessage, sessionId, lastMessage } = useWebSocket();
  const activeScopes = activeDevices.filter(id => id.startsWith('scope'));
  const activeDefibs = activeDevices.filter(id => id.startsWith('defib'));
  const [devicesSynced, setDevicesSynced] = useState(false);
  // Mémoire de tous les réglages individuels même quand les boîtes sont détruites.
  const individualMemory = useRef<Record<string, any>>({});

  useEffect(() => {
  if (lastMessage?.type === "sync_state" && lastMessage.device_states) {
    Object.entries(lastMessage.device_states).forEach(([devId, devState]: [string, any]) => {
      const isDefib = devId.startsWith('defib');
      individualMemory.current[devId] = {
        showECG: !(isDefib ? devState.defibHrDotted : devState.hrDotted),
        showSpO2: !(isDefib ? devState.defibPressureDotted : devState.pressureDotted),
        showCO2: !(isDefib ? devState.defibCo2Dotted : devState.co2Dotted),
        showBP: !(isDefib ? devState.defibBpDotted : devState.bpDotted),
      };
    });
    setDevicesSynced(true);
  }
}, [lastMessage]);

  const handleRhythmSelect = (value: string, label: string) => {
    props.setRhythm(value);
    props.setRhythmLabel(label);

    if (props.sendRhythm) {
        props.sendRhythm(value, label);
    }

    if (value === "tachy_a") props.setBpm(150);
    else if (value === "fv") props.setBpm(180);
    else if (value === "tsv") props.setBpm(180);
    else if (value === "jonctionnel") props.setBpm(130);
    else if (value === "flutt_a") props.setBpm(120);
    else if (value === "idiov") props.setBpm(35);
    else if (value === "tv_2") props.setBpm(160);
    else if (value === "1_bav") props.setBpm(55);
    else if (value === "2_bav_I") props.setBpm(45);
    else if (value === "2_bav_II") props.setBpm(40);
    else if (value === "3_bav") props.setBpm(35);
    else if (value === "tors") props.setBpm(300);
    else if (value === "tv_1") props.setBpm(170);
    else if (value === "rs_hvg") props.setBpm(75);
    else if (value === "rs_hd") props.setBpm(75);
    else if (value === "rs_hvd") props.setBpm(75);
    else if (value === "arret" || value === "asysto") props.setBpm(0);

    setIsRhythmModalOpen(false);
  };

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [props.logDisplay]);

  const listLog = props.logDisplay.map((logEntry: any, idx: number) => (
    <p key={`${idx}-${logEntry.slice(0, 15)}`} className="m-0 leading-tight whitespace-pre-wrap">
      {logEntry}
    </p>
  ));

  return (
    <div className="font-sans bg-black text-white h-screen max-h-screen overflow-hidden flex flex-col">
      <PageHeader title="Panneau de Contrôle"  username={props.username} onLogout={props.onLogout} />

      <div className="flex-1 flex flex-col lg:flex-row w-full min-h-0 overflow-hidden">
        
        {/* --- COLONNE DE GAUCHE : SCOPE ET CONTROLES CIBLÉS (60%) --- */}
        <div className="w-full lg:w-[60%] flex flex-col p-4 gap-3 border-r border-[#222222] min-w-0 h-full overflow-hidden bg-[#141414] ">
          {/* Scope preview locked to 70% height */}
          <div className="relative w-full h-[70%] bg-black rounded-lg overflow-hidden shrink-0 border border-gray-800 shadow-xl">
            <ScaledScopeIframe src={`/scope?username=${props.username}&id=CONTR`} />
          </div>

          {/* Reserved bottom area for targeted device controls locked to 30% height */}
          <div className="w-full h-[30%] flex flex-col justify-between border-t border-gray-800 pt-2 shrink-0 overflow-hidden">
            <div className="flex justify-between items-center mb-2 shrink-0">
              <h3 className="text-zinc-200 text-xs font-bold uppercase tracking-wider m-0">
                Contrôle Individuel
              </h3>
            
              <div className="flex items-center gap-4">
                <label className="text-zinc-200 text-xs font-bold tracking-wider m-0">
                  Prendre la main
                </label>
                <label className="text-cyan-400 font-bold cursor-pointer flex items-center gap-2 text-xs">
                  <Switch.Root
                    checked={props.isRemoteControl}
                    onCheckedChange={(checked) => props.sendControlMode(checked)}
                    className="w-8 h-4.5 bg-zinc-800 rounded-full relative border border-cyan-500/40 data-[state=checked]:bg-cyan-500/30 outline-none cursor-pointer transition-colors"
                  >
                    <Switch.Thumb className="block w-3.5 h-3.5 bg-cyan-400 rounded-full transition-transform duration-150 translate-x-0.5 data-[state=checked]:translate-x-4 shadow-sm" />
                  </Switch.Root>
                  Scope
                </label>
                <label className="text-red-400 font-bold cursor-pointer flex items-center gap-2 text-xs">
                  <Switch.Root
                    checked={props.isDefibRemoteControl}
                    onCheckedChange={(checked) => props.sendDefibControlMode(checked)}
                    className="w-8 h-4.5 bg-zinc-800 rounded-full relative border border-red-500/40 data-[state=checked]:bg-red-500/30 outline-none cursor-pointer transition-colors"
                  >
                    <Switch.Thumb className="block w-3.5 h-3.5 bg-red-400 rounded-full transition-transform duration-150 translate-x-0.5 data-[state=checked]:translate-x-4 shadow-sm" />
                  </Switch.Root>
                  Défib
                </label>
              </div>
            </div>

            <div className="flex-1 flex items-stretch gap-3 overflow-x-auto py-0 rounded-lg px-3 min-h-[100px]">
              {!devicesSynced || (activeScopes.length < 2 && activeDefibs.length === 0) ? (
                <div className="w-full text-center text-gray-500 italic text-xs py-3">
                  Aucun appareil connecté. En attente des appareils (Scope / Défibrillateur)...
                </div>
              ) : (
                <>
                  {activeScopes.map(deviceId => (
                    <DeviceBox key={deviceId} deviceId={deviceId} type="Scope" sessionId={sessionId} sendMessage={sendMessage}
                      globalProps={props} subscribeMessage={subscribeMessage} memory={individualMemory} />
                  ))}
                  {activeDefibs.map(deviceId => (
                    <DeviceBox key={deviceId} deviceId={deviceId} type="Défib" sessionId={sessionId} sendMessage={sendMessage}
                      globalProps={props} subscribeMessage={subscribeMessage} memory={individualMemory} />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
          
        {/* --- COLONNE DE DROITE : PANNEAU DE CONTRÔLE GLOBAL (40%) --- */}
        <div className="w-full lg:w-[40%] flex flex-col p-4 min-w-0 h-full overflow-y-auto">
          
          <form onSubmit={props.sendLogInput} className="w-full shrink-0 mb-4">  
            <div className="w-full bg-[#111111] border border-gray-800 rounded p-2.5 max-h-[110px] overflow-y-auto flex flex-col gap-1 text-xs font-mono shrink-0 mb-3 shadow-inner">
              {listLog}
              <div ref={logEndRef} />
            </div>          
            <div className="relative flex items-center w-full">
              <input 
                type="text" 
                placeholder="Annoter dans le log..." 
                required 
                value={props.inputLog} 
                onChange={(e) => props.setInputLog(e.target.value)}
                className="w-full bg-[#111111] border border-zinc-800 rounded-lg pl-3 pr-16 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/80 transition-colors"
              />
              <kbd className="absolute right-2 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-zinc-400 bg-[#1a1a1e] border border-zinc-700/60 rounded shadow-sm pointer-events-none select-none">
                Enter ↵
              </kbd>
            </div>
          </form>
          
          <div className="flex-1 flex flex-col gap-2 overflow-hidden" style={{ visibility: props.starting ? 'visible' : 'hidden' }}>
            <Tabs.Root defaultValue="heart" className="w-full flex flex-col flex-1 overflow-hidden">
              <Tabs.List className="flex bg-[#111111] p-1 rounded-xl border border-zinc-800 shrink-0 gap-1 mb-2">
                <Tabs.Trigger
                  value="heart"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-200 data-[state=active]:bg-[#1f1f23] data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm transition-all cursor-pointer outline-none"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Cœur</span>
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="respiration"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-200 data-[state=active]:bg-[#1f1f23] data-[state=active]:text-cyan-400 data-[state=active]:shadow-sm transition-all cursor-pointer outline-none"
                >
                  <Wind className="w-3.5 h-3.5" />
                  <span>Respiration</span>
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="scenario"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-200 data-[state=active]:bg-[#1f1f23] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all cursor-pointer outline-none"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Scénario</span>
                </Tabs.Trigger>
              </Tabs.List>

              <div className="flex-1 overflow-y-auto pr-1">
                <Tabs.Content value="heart" className="flex flex-col gap-3 outline-none">
                  <div className="  p-3.5 border-t border-zinc-800 flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Rythme Cardiaque</div>
                      </div>
                      <RhythmSelect
                        value={props.rhythm}
                        selectedLabel={props.rhythmLabel}
                        onRhythmSelect={handleRhythmSelect}
                      />
                    </div>

                    <SliderRow label="BPM (Fréquence Cardiaque)" value={props.bpm} min={0} max={200} color="#10b981" onChange={props.setBpm} />

                    <button onClick={props.sendECG} className="w-full bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer mt-1">
                      Envoyer Rythme & ECG
                    </button>
                  </div>

                  <div className="  p-3.5 border-t border-zinc-800 flex flex-col gap-3">
                    <div className="text-[10px] font-bold text-[#ff6666] uppercase tracking-wider">Tension artérielle</div>
                    <SliderRow label="Systolique (mmHg)" value={props.systolic} min={0} max={300} color="#ff4444" onChange={props.setSystolic} />
                    <SliderRow label="Diastolique (mmHg)" value={props.diastolic} min={0} max={200} color="#ff8888" onChange={(val) => { props.setDiastolic(val); if (val > props.systolic) props.setSystolic(val); }} />
                    <button onClick={props.sendPressure} className="w-full bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-700/60 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer mt-1">Envoyer Pression</button>
                  </div>
                </Tabs.Content>

                <Tabs.Content value="respiration" className="flex flex-col gap-3 outline-none">
                  <div className="  p-3.5 border-t border-zinc-800 flex flex-col gap-3">
                    <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Oxygénation (SpO2)</div>
                    <SliderRow label="SpO2 (%)" value={props.spo2} min={0} max={100} color="#00cfff" onChange={props.setSpo2} />
                    {props.sendSpo2 && (
                      <button onClick={props.sendSpo2} className="w-full bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-700/60 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer mt-1">Envoyer SpO2</button>
                    )}
                  </div>
                  
                  <div className="  p-3.5 border-t border-zinc-800 flex flex-col gap-3">
                    <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Capnographie</div>
                    <SliderRow label="CO2 mmHg" value={props.co2} min={0} max={100} color="#00cfff" onChange={props.setCo2} />
                    <button onClick={props.sendCO2} className="w-full bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-700/60 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer mt-1">Envoyer CO2</button>
                  </div>
                  
                  <div className="  p-3.5 border-t border-zinc-800 flex flex-col gap-3">
                    <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Fréquence respiratoire</div>
                    <SliderRow label="FRVA (resp/min)" value={props.respiration} min={0} max={60} color="#00cfff" onChange={props.setRespiration} />
                    <button onClick={props.sendRespiration} className="w-full bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-700/60 rounded-lg py-2 text-xs font-bold transition-all cursor-pointer mt-1">Envoyer Respiration</button>
                  </div>
                </Tabs.Content>

                <Tabs.Content value="scenario" className="flex flex-col gap-3 outline-none">
                  <div className=" p-3.5 border-t border-zinc-800 flex flex-col gap-3">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Sélection du Scénario</div>
                    <ScenarioSelect
                      scenarioId={props.scenarioId}
                      onScenarioSelect={props.onScenarioSelect}
                    />

                    {props.scenarioId !== "Aucun" && (
                      <div className="mt-2 pt-2 border-t border-zinc-800 flex justify-between items-center">
                        <label htmlFor="showHintsCheckbox" className="font-bold text-xs cursor-pointer select-none">
                          Afficher les indices
                        </label>
                        <input
                          type="checkbox"
                          id="showHintsCheckbox"
                          checked={props.showHints}
                          onChange={(e) => props.onToggleHints(e.target.checked)}
                          className="w-4 h-4 cursor-pointer accent-cyan-500"
                        />
                      </div>
                    )}
                  </div>
                </Tabs.Content>
              </div>
            </Tabs.Root>
          </div>
          <div className="flex gap-2 mt-3 pt-2 border-t border-zinc-800 shrink-0">
            <button
              onClick={() => props.sendStart(props.starting)}
              className={`flex-1 py-2.5 px-2 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                props.starting
                  ? "bg-red-950/60 hover:bg-red-900/80 text-red-300 border-red-700/60"
                  : "bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-700/60"
              }`}
            >
              {props.starting ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{props.starting ? "Pauser" : "Démarrer"}</span>
            </button>
            <button
              onClick={() => props.onReset()}
              className="flex-1 py-2.5 px-2 rounded-lg font-bold text-xs transition-colors cursor-pointer bg-green-950/40 hover:bg-green-900/60 text-green-300 border border-green-700/50 flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Valeurs défaut</span>
            </button>
            <button
              onClick={() => props.sendLogDemand()}
              className="flex-1 py-2.5 px-2 rounded-lg font-bold text-xs transition-colors cursor-pointer bg-[#222222] hover:bg-[#333333] text-zinc-200 border border-[#444444] flex items-center justify-center gap-1.5"
            >
              <Flag className="w-3.5 h-3.5 text-amber-400" />
              <span>Terminer</span>
            </button>
          </div>
        </div>
      </div>

      <ScenariosListModal
        isOpen={modals.showScenariosListModal}
        onClose={modals.closeScenarioslist}
        onScenarioSelect={(id) => {
          props.onScenarioSelect(id);
          modals.closeScenarioslist();
        }}
      />
    </div>
  );
}