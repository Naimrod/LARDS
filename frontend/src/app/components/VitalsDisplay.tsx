import React, { useState, useEffect } from 'react';
import type { RhythmType } from './graphsdata/ECGRhythms';
import { useAlarms } from '../hooks/useAlarms';
import { useAudio } from '../context/AudioContext';
import { useWebSocket } from '../context/WebSocketContext';
import { PatientState, DefibState } from '@/types/simulation';

interface VitalsDisplayProps {
  patient: PatientState;
  device: DefibState;
  actions: {
    toggle: (key: 'fc' | 'vitals' | 'pni' | 'spo2' | 'co2') => void;
    startPNIMeasurement: () => void;
  };
  showCountdown?: boolean;
  minBpm?: number;
  maxBpm?: number;
}

const VitalsDisplay: React.FC<VitalsDisplayProps> = ({
  patient,
  device,
  actions,
  showCountdown = true,
  minBpm = 50,
  maxBpm = 120,
}) => {
  const { lastMessage } = useWebSocket();
  const [fibBlink, setFibBlink] = useState(false);
  const audioService = useAudio();

  // Local derived values for cleaner JSX
  const rhythmType = patient.rhythm_type as RhythmType;
  const heartRate = patient.heart_rate;
  const bloodPressure = patient.blood_pressure;
  const displayedSystolic = patient.displayed_bp?.systolic ?? null;
  const displayedDiastolic = patient.displayed_bp?.diastolic ?? null;

  // Cosmetic values for display
  const cosmeticBpm = (patient as any).cosmeticBpm ?? heartRate;
  const cosmeticPulse = (patient as any).cosmeticPulse ?? (patient.pulse ?? heartRate);
  const cosmeticSpo2 = (patient as any).cosmeticSpo2 ?? (patient.spo2 ?? 98);
  const cosmeticCo2 = (patient as any).cosmeticCo2 ?? (patient.co2 ?? 40);
  const cosmeticResp = (patient as any).cosmeticResp ?? (patient.respiratory_rate ?? 30);
  
  const showFCValue = device.show_fc;
  const showVitalSigns = device.show_vitals;
  const showPNIValues = device.show_pni;
  const isPNIMeasuring = patient.is_pni_measuring || device.is_pni_measuring;
  const pniStepValue = patient.pni_step_value ?? device.pni_step_value;
  const showCountdownLogic = showCountdown && isPNIMeasuring;

  const showSpo2 = (device as any).show_spo2;
  const showCo2 = (device as any).show_co2;

  const alarms = useAlarms(rhythmType, showFCValue, cosmeticBpm, false, heartRate, minBpm, maxBpm);

  const spo2Excluded = ['fibrillationVentriculaire', 'tachycardieVentriculaire', 'asystole', 'choc'].includes(rhythmType);
  const isSpo2Alarm = showSpo2 && !spo2Excluded && typeof patient.spo2 === 'number' && patient.spo2 < 90;

  const computeMAP = (sys: number, dia: number, map?: number) => {
    if (typeof map === 'number') return Math.round(map);
    return Math.round(dia + (sys - dia) / 3);
  };

  // Fib Blink Logic
  useEffect(() => {
    const isFib = rhythmType === 'fibrillationVentriculaire' || rhythmType === 'fibrillationAtriale';
    const isAlert = cosmeticBpm < minBpm || cosmeticBpm >= maxBpm || cosmeticBpm == 0;
    if (isFib || isAlert) {
      const i = setInterval(() => setFibBlink((p) => !p), 500);
      return () => clearInterval(i);
    }
  }, [rhythmType, cosmeticBpm, minBpm, maxBpm]);

  // Audio Sync for PNI (Server handles state, client handles sounds)
  const prevIsPNIMeasuring = React.useRef(isPNIMeasuring);
  const prevLastAction = React.useRef<string | null>(null);

  useEffect(() => {
    if (isPNIMeasuring && !prevIsPNIMeasuring.current) {
        audioService.playCuffInflation?.();
    } else if (!isPNIMeasuring && prevIsPNIMeasuring.current) {
        audioService.stopCuffInflation?.();
    }

    if (lastMessage?.type === "defibrillator_action" && lastMessage?.action === "pni_done" && lastMessage?.action !== prevLastAction.current) {
        audioService.playBPDone?.();
    }

    prevIsPNIMeasuring.current = isPNIMeasuring;
    prevLastAction.current = lastMessage?.action || null;
  }, [isPNIMeasuring, audioService, lastMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { audioService.stopCuffInflation?.(); } catch {}
    };
  }, [audioService]);

  // Audio Sync for SpO2 low alarm
  const prevIsSpo2Alarm = React.useRef(isSpo2Alarm);
  useEffect(() => {
    if (isSpo2Alarm && !prevIsSpo2Alarm.current) {
      audioService.startSpo2AlarmSequence?.();
    } else if (!isSpo2Alarm && prevIsSpo2Alarm.current) {
      audioService.stopSpo2AlarmSequence?.();
    }
    prevIsSpo2Alarm.current = isSpo2Alarm;

    return () => {
      try { audioService.stopSpo2AlarmSequence?.(); } catch {}
    };
  }, [isSpo2Alarm, audioService]);

  let valueToDisplay = '--';

if (isPNIMeasuring) {
    // Mesure en cours :
    if (showCountdown) {
        // Mode Scope : on montre le décompte
        valueToDisplay = pniStepValue ? String(pniStepValue) : '--';
    } else {
        // Mode Defib : on force le vide pendant la mesure
        valueToDisplay = '--'; 
    }
} else if (showPNIValues && displayedSystolic !== null) {
    // Mesure finie : on montre le résultat
    valueToDisplay = `${displayedSystolic}/${displayedDiastolic}`;
}

  return (
    <div className="h-1/4 border-b border-gray-600 flex items-center text-sm bg-black px-2">
      {/* FC Section */}
      <div
        className="flex flex-col items-center w-24 cursor-pointer hover:bg-gray-800 p-2 rounded transition-colors"
        onClick={() => actions.toggle('fc')}
      >
        {showFCValue && (rhythmType === 'fibrillationVentriculaire' || rhythmType === 'fibrillationAtriale' || cosmeticBpm < minBpm || cosmeticBpm >= maxBpm) ? (
          <div className="flex items-center justify-center -ml-9">
            <div className={`px-5 py-0.2 ${fibBlink ? 'bg-red-600' : 'bg-white'}`}>
              <span className={`text-xs font-bold ${fibBlink ? 'text-white' : 'text-red-600'}`}>
                {rhythmType === 'fibrillationVentriculaire' ? 'Fib.V' : 
                 (rhythmType === 'fibrillationAtriale' ? 'Fib.A' : 
                  (cosmeticBpm < minBpm ? 'BRADY' : 'TACHY'))}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-row items-center gap-x-2">
            <div className="text-gray-400 text-xs">FC</div>
            <div className="text-gray-400 text-xs">bpm</div>
          </div>
        )}
        <div className="flex flex-row items-center gap-x-2">
          <div className="text-green-400 text-4xl font-bold w-[65px] text-center">
           {showFCValue
            ? (rhythmType === 'fibrillationVentriculaire' ? alarms.heartRate : (rhythmType === 'asystole' ? '0' : cosmeticBpm))
            : '--'}
          </div>
          <div className="flex flex-col items-center w-8">
            <div className="text-green-400 text-xs text-center">{maxBpm}</div>
            <div className="text-green-400 text-xs text-center">{minBpm}</div>
          </div>
        </div>
      </div>

      {/* SpO2 & Pouls Section */}
      <div
        className="flex flex-row items-center gap-4 cursor-pointer hover:bg-gray-800 p-2 rounded transition-colors"
        onClick={() => actions.toggle('spo2')}
      >
        {/* SpO2 */}
        <div className="flex flex-col items-center w-28">
          <div className="flex flex-row items-center gap-x-2">
            <div className="text-blue-400 text-2xl font-bold">SpO2</div>
            <div className="text-blue-400 text-xs">%</div>
          </div>
          <div className="flex flex-row items-center gap-x-2">
            <div className={`text-4xl font-bold min-w-[60px] text-center -mt-2 ${isSpo2Alarm ? 'text-red-500 animate-pulse' : 'text-blue-400'}`}>
              {["fibrillationVentriculaire", "asystole","choc", "tachycardieVentriculaire","tvType2"].includes(rhythmType)
                ? '--'
                : (showSpo2 ? cosmeticSpo2 : '--')}
            </div>
            <div className="flex flex-col items-center w-8">
              <div className="text-blue-400 text-xs">100</div>
              <div className="text-blue-400 text-xs">90</div>
            </div>
          </div>
        </div>

        {/* Pouls */}
        <div className="flex flex-row items-center w-28">
          <div className="flex flex-col items-center">
            <div className="text-blue-400 text-xs">Pouls</div>
            <div className="text-blue-400 text-4xl font-bold min-w-[60px] text-center">
              {["fibrillationVentriculaire", "asystole","choc", "tachycardieVentriculaire","tvType2"].includes(rhythmType)
                ? '--'
                : (showSpo2 ? cosmeticPulse : '--')}
            </div>
          </div>
          <div className="flex flex-col items-center w-8 ml-2">
            <div className="text-blue-400 text-xs mb-2">bpm</div>
            <div className="text-blue-400 text-xs">120</div>
            <div className="text-blue-400 text-xs">50</div>
          </div>
        </div>
      </div>

      {/* PNI Section */}
      <div
        className={`flex flex-col items-center w-45 p-2 rounded transition-colors ${(!(device as any).isRemoteControl || (device as any).show_pni_trainer) ? 'cursor-pointer hover:bg-gray-800' : 'cursor-default opacity-40'}`}
        onClick={() => {
          if (!(device as any).isRemoteControl || (device as any).show_pni_trainer) {
            actions.startPNIMeasurement();
          }
        }}
        role="button"
        title="Prendre la tension"
      >
        <div 
          className={`flex flex-row items-center gap-x-2 ${(device as any).isRemoteControl ? 'cursor-default' : 'cursor-pointer'}`} 
          onClick={(e) => { 
            e.stopPropagation(); 
            if (!(device as any).isRemoteControl) {
              actions.toggle('pni'); 
            }
          }}
        >
          <div className="text-white text-xs font-bold">PNI</div>
          <div className="text-white text-xs font-bold w-12 text-center">
            {isPNIMeasuring ? 'Auto' : 'Manuel'}
          </div>
          <div className="text-white text-xs font-bold">10:20</div>
          <div className="text-white text-xs font-bold">mmHg</div>
        </div>
        <div className="flex flex-row items-center gap-x-1 mt-1">
          
          
          <div className="text-white text-4xl min-w-[100px] text-center">
            {["fibrillationVentriculaire", "asystole","choc", "tachycardieVentriculaire","tvType2"].includes(rhythmType)
            ? '-?-' 
            : isPNIMeasuring 
            ? (showCountdown ? pniStepValue : '--') 
            : (showPNIValues && displayedSystolic !== null 
            ? `${displayedSystolic}/${displayedDiastolic}` 
            : '--')}
          </div>

          <div className="text-white text-xs min-w-[30px] text-center">
            {["fibrillationVentriculaire", "asystole","choc", "tachycardieVentriculaire","tvType2"].includes(rhythmType)
            ? '' 
            : isPNIMeasuring 
            ? `(${pniStepValue})` // Décompte
            : (showPNIValues && displayedSystolic !== null && displayedDiastolic !== null
            ? `(${computeMAP(displayedSystolic, displayedDiastolic)})` 
            : '')}
          </div>

          <div className="flex flex-col items-center w-8">
            <div className="text-white text-xs">MOY</div>
            <div className="text-white text-xs">110</div>
            <div className="text-white text-xs">50</div>
          </div>
        </div>
      </div>

      {/* CO2 & FR Section */}
      <div className="flex flex-row items-center gap-x-6 " onClick={() => actions.toggle('co2')}>
        <div className="flex flex-col items-center w-20">
          <div className="flex flex-row items-center gap-x-1 mb-3">
            <div className="text-white text-xs font-bold">CO2ie</div>
            <div className="text-white text-xs font-bold">mmHg</div>
          </div>
          <div className="flex flex-row items-center">
            <div className="text-yellow-400 text-4xl font-bold min-w-[50px] text-center">
              {["fibrillationVentriculaire", "asystole","choc", "tachycardieVentriculaire","tvType2"].includes(rhythmType) ? '-?-' : (showCo2 ? cosmeticCo2 : '--')}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center w-20">
          <div className="flex flex-row items-center gap-x-1">
            <div className="text-white text-xs font-bold">FR</div>
            <div className="text-white text-xs font-bold">rpm</div>
          </div>
          <div className="flex flex-row items-center">
            <div className="text-yellow-400 text-4xl font-bold min-w-[50px] text-center">
              {["fibrillationVentriculaire", "asystole","choc", "tachycardieVentriculaire","tvType2"].includes(rhythmType) ? '-?-' : (showCo2 ? cosmeticResp : '--')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VitalsDisplay;