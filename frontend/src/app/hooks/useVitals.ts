import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { RhythmType } from '../components/graphsdata/ECGRhythms';
import { useAudio } from '../context/AudioContext';

export interface VitalsState {
  rhythm: string;
  fcValue: boolean;
  bpm: number;
  isHRDotted: boolean;
  spo2: number;
  isPressureDotted: boolean;
  co2: number;
  resp: number;
  isCO2Dotted: boolean;
  systolic: number;
  diastolic: number;
  pouls: number;
  isRemoteControl: boolean;
  isDefibHRDotted: boolean;
  isDefibPressureDotted: boolean;
  isDefibCO2Dotted: boolean;
  isDefibRemoteControl: boolean;
  isPNIMeasuring: boolean;
  showPNI: boolean;
  pniStepValue: number | null;
  displayedSystolic: number | null;
  displayedDiastolic: number | null;
  bpDisplay?: string;
  isBPDotted: boolean;
  isDefibBPDotted: boolean;
  shockTimestamp: number; 
}

export const useVitals = () => {
  const { subscribeMessage, sessionId, sendMessage, deviceId } = useWebSocket();
  const audio = useAudio();

  const [vitals, setVitals] = useState<VitalsState>({
    rhythm: 'sinusRhythm',
    fcValue: false,
    bpm: 70,
    isHRDotted: true,
    spo2: 98,
    isPressureDotted: true,
    co2: 40,
    resp: 15,
    isCO2Dotted: true,
    systolic: 120,
    diastolic: 80,
    pouls: 70,
    isRemoteControl: true,
    isDefibHRDotted: true,
    isDefibPressureDotted: true,
    isDefibCO2Dotted: true,
    isDefibRemoteControl: true,
    isPNIMeasuring: false,
    showPNI: false,
    pniStepValue: null,
    displayedSystolic: null,
    displayedDiastolic: null,
    isBPDotted: true, // Hidden by default
    isDefibBPDotted: true, 
    shockTimestamp: 0,
  });

  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (!msg) return;

      const rhythmMap: Record<string, string> = {
        'sinusal': 'sinus', 'tachy_a': "tachycardieAtriale", 'tsv': "tsv", 'jonctionnel': "jonctionnel",
        'flutt_a': "flutterAtrial", 'rs_hvg': "sinusHVG", 'rs_hd': "sinusHD", 'rs_hvd': "sinusHVD",
        'fib_a': 'fibrillationAtriale', '1_bav': 'bav1', '2_bav_I': "bav2Type1", '2_bav_II': "bav2Type2",
        '3_bav': 'bav3', 'fv': 'fibrillationVentriculaire', 'FV': 'fibrillationVentriculaire',
        'tv_1': 'tachycardieVentriculaire', 'tv_2': "tvType2", 'tors': "torsade", 'idiov': "idioventriculaire",
        'stim': 'electroEntrainement', 'seq': 'electroEntrainement', 'p_cap': 'electroEntrainement',
        'arret': 'asystole', 'asysto': 'asystole', 'choc': 'choc', 'infarctus': 'infarctus',
      };

      if (msg.type === "sync_state") {
        const patient = msg.patient || {};
        const device = msg.device || {};
        setVitals(prev => {
          const isPNIMeasuring = device.is_pni_measuring !== undefined ? device.is_pni_measuring : prev.isPNIMeasuring;
          const showPNI = device.show_pni !== undefined ? device.show_pni : prev.showPNI;
          const pniStepValue = device.pni_step_value !== undefined ? device.pni_step_value : prev.pniStepValue;
          
          const syst = patient.bloodPressure?.systolic ?? prev.systolic;
          const diast = patient.bloodPressure?.diastolic ?? prev.diastolic;
          
          const displayedSystolic = patient.displayed_bp?.systolic ?? (showPNI ? syst : null);
          const displayedDiastolic = patient.displayed_bp?.diastolic ?? (showPNI ? diast : null);

          return {
              ...prev,
              bpm: patient.heartRate ?? prev.bpm,
              spo2: patient.spo2 ?? prev.spo2,
              co2: patient.co2 ?? prev.co2,
              resp: patient.respiratoryRate ?? prev.resp,
              systolic: syst,
              diastolic: diast,
              displayedSystolic,
              displayedDiastolic,
              isPNIMeasuring,
              showPNI,
              pniStepValue,
              pouls: patient.heartRate ?? prev.pouls,
              rhythm: rhythmMap[patient.rhythmType] || patient.rhythmType || prev.rhythm,
              isHRDotted: device.hrDotted !== undefined ? device.hrDotted : prev.isHRDotted,
              fcValue: device.hrDotted !== undefined ? !device.hrDotted : prev.fcValue,
              isPressureDotted: device.pressureDotted !== undefined ? device.pressureDotted : prev.isPressureDotted,
              isCO2Dotted: device.co2Dotted !== undefined ? device.co2Dotted : prev.isCO2Dotted,
              isBPDotted: device.bpDotted !== undefined ? device.bpDotted : prev.isBPDotted, 
              isRemoteControl: device.isRemoteControl !== undefined ? device.isRemoteControl : prev.isRemoteControl,
              isDefibHRDotted: device.defibHrDotted !== undefined ? device.defibHrDotted : prev.isDefibHRDotted,
              isDefibPressureDotted: device.defibPressureDotted !== undefined ? device.defibPressureDotted : prev.isDefibPressureDotted,
              isDefibCO2Dotted: device.defibCo2Dotted !== undefined ? device.defibCo2Dotted : prev.isDefibCO2Dotted,
              isDefibBPDotted: device.defibBpDotted !== undefined ? device.defibBpDotted : prev.isDefibBPDotted, 
              isDefibRemoteControl: device.isDefibRemoteControl !== undefined ? device.isDefibRemoteControl : prev.isDefibRemoteControl
          };
        });
      } else if (msg.type === "ecg") {
        setVitals(prev => {
          const hr = msg.heartRate ?? msg.bpm ?? prev.bpm;
          return { ...prev, bpm: hr, spo2: msg.spo2 ?? prev.spo2, pouls: hr };
        });
      } else if (msg.type === "rhythm") {
        const canonicalRhythm = rhythmMap[msg.rhythm] || msg.rhythm;
        setVitals(prev => ({ ...prev, rhythm: canonicalRhythm }));
      } else if (msg.type === "co2") {
        setVitals(prev => ({ ...prev, co2: msg.co2 ?? prev.co2 }));
      } else if (msg.type === "pressure") {
        setVitals(prev => ({ ...prev, systolic: msg.systolic ?? prev.systolic, diastolic: msg.diastolic ?? prev.diastolic }));
      } else if (msg.type === "respiration") {
        setVitals(prev => ({ ...prev, resp: msg.respirationRate ?? prev.resp }));
      } else if (msg.type === "HRscope") {
        if (msg.dataType === "defib") {
          setVitals(prev => ({ ...prev, isDefibHRDotted: msg.isDefibHRDotted }));
        } else {
          setVitals(prev => ({ ...prev, isHRDotted: msg.isHRDotted, fcValue: !msg.isHRDotted }));
        }
      } else if (msg.type === "Prscope") {
        if (msg.dataType === "defib") {
          setVitals(prev => ({ ...prev, isDefibPressureDotted: msg.isDefibPressureDotted }));
        } else {
          setVitals(prev => ({ ...prev, isPressureDotted: msg.isPressureDotted }));
        }
      } else if (msg.type === "COscope") {
        if (msg.dataType === "defib") {
          setVitals(prev => ({ ...prev, isDefibCO2Dotted: msg.isDefibCO2Dotted }));
        } else {
          setVitals(prev => ({ ...prev, isCO2Dotted: msg.isCO2Dotted }));
        }
      } else if (msg.isRemoteControl !== undefined && msg.isRemoteControl !== null) {
        if (msg.dataType === "defib") {
          setVitals(prev => ({ ...prev, isDefibRemoteControl: msg.isDefibRemoteControl }));
        } else {
          setVitals(prev => ({ ...prev, isRemoteControl: msg.isRemoteControl }));
        }
      } else if (msg.type === "visibility_state") {
          setVitals(prev => {
            const nextIsBPDotted = msg.bpDotted !== undefined ? msg.bpDotted : prev.isBPDotted;
            const nextIsDefibBPDotted = msg.defibBpDotted !== undefined ? msg.defibBpDotted : prev.isDefibBPDotted;
            const becameVisible = (prev.isBPDotted && !nextIsBPDotted) || (prev.isDefibBPDotted && !nextIsDefibBPDotted);
            
            return {
              ...prev,
              isHRDotted: msg.hrDotted !== undefined ? msg.hrDotted : prev.isHRDotted,
              isPressureDotted: msg.pressureDotted !== undefined ? msg.pressureDotted : prev.isPressureDotted,
              isCO2Dotted: msg.co2Dotted !== undefined ? msg.co2Dotted : prev.isCO2Dotted,
              isBPDotted: nextIsBPDotted, 
              fcValue: msg.hrDotted !== undefined ? !msg.hrDotted : prev.fcValue,
              isDefibHRDotted: msg.defibHrDotted !== undefined ? msg.defibHrDotted : prev.isDefibHRDotted,
              isDefibPressureDotted: msg.defibPressureDotted !== undefined ? msg.defibPressureDotted : prev.isDefibPressureDotted,
              isDefibCO2Dotted: msg.defibCo2Dotted !== undefined ? msg.defibCo2Dotted : prev.isDefibCO2Dotted,
              isDefibBPDotted: nextIsDefibBPDotted, 
              isDefibRemoteControl: msg.isDefibRemoteControl !== undefined ? msg.isDefibRemoteControl : prev.isDefibRemoteControl,
              isRemoteControl: msg.isRemoteControl !== undefined ? msg.isRemoteControl : prev.isRemoteControl,
              ...(becameVisible ? {
                displayedSystolic: null,
                displayedDiastolic: null,
                showPNI: false
              } : {})
            };
          });
      } else if (msg.type === "defibrillator_action") {
        if (msg.action === "pni_start") {
          setVitals(prev => ({
              ...prev,
              displayedSystolic: null, 
              displayedDiastolic: null,
              showPNI: false
          }));
          setCosmeticPni({
            isMeasuring: true,
            stepValue: 160,
            showPNI: false,
          });
        } else if (msg.action === "pni_done") {
          setVitals(prev => ({
              ...prev,
              displayedSystolic: msg.systolic,
              displayedDiastolic: msg.diastolic,
          }));
        } else if (msg.action === "toggle_fc") {
          setVitals(prev => {
            const show_fc = msg.show_fc !== undefined ? msg.show_fc : !prev.fcValue;
            return { ...prev, fcValue: show_fc, isHRDotted: !show_fc };
          });
        } else if (msg.action === "toggle_vitals") {
          setVitals(prev => {
            const show_vitals = msg.show_vitals !== undefined ? msg.show_vitals : prev.isPressureDotted;
            return { ...prev, isPressureDotted: !show_vitals, isCO2Dotted: !show_vitals };
          });
        } else if (msg.action === "shock_delivered" || msg.action == "shockDelivered") {
            setVitals(prev => ({ ...prev, shockTimestamp: Date.now() }));
        } else if (msg.action === "set_display_mode") {
          if (msg.display_mode === "ARRET") {
            setVitals(prev => ({
              ...prev, 
              fcValue: false, 
              isDefibHRDotted: true, 
              isDefibPressureDotted: true, 
              isDefibCO2Dotted: true, 
              isDefibBPDotted: true, 
              isPNIMeasuring: false, 
              pniStepValue: null
            }));
          }
        }
      }
    };

    const unsubscribe = subscribeMessage(handleMessage);
    return () => unsubscribe();
  }, [subscribeMessage]);

  const [cosmeticVitals, setCosmeticVitals] = useState({
    bpm: 70,
    spo2: 98,
    co2: 40,
    resp: 15,
    pouls: 70,
    systolic:120,
    diastolic:80
  });

  const [cosmeticPni, setCosmeticPni] = useState<{
    isMeasuring: boolean;
    stepValue: number | null;
    showPNI: boolean;
  }>({
    isMeasuring: false,
    stepValue: null,
    showPNI: false,
  });

  useEffect(() => {
    if (!cosmeticPni.isMeasuring || cosmeticPni.stepValue === null) return;

    const interval = setInterval(() => {
      setCosmeticPni(prev => {
        if (prev.stepValue === null) return prev;
        if (prev.stepValue <= 20) {
          clearInterval(interval);
          if (audio) {
            audio.playBPDone?.();
          }
          return {
            isMeasuring: false,
            stepValue: null,
            showPNI: true,
          };
        }
        return {
          ...prev,
          stepValue: prev.stepValue - 20,
        };
      });
    }, 300);

    return () => clearInterval(interval);
  }, [cosmeticPni.isMeasuring, cosmeticPni.stepValue, audio]);

 useEffect(() => {
    const interval = setInterval(() => {
      setCosmeticVitals(prev => {
        const pulselessRhythms = ["fibrillationVentriculaire", "asystole", "fv", "asysto", "arret", "choc", "tachy_a", "tachycardieAtriale", "tsv", "fib_a", "fibrillationAtriale", "tv_1", "tachycardieVentriculaire", "tv_2", "tvType2"];
        const isPulsing = !pulselessRhythms.includes(vitals.rhythm) && vitals.bpm >0;

        const targetBpm = vitals.bpm;
        const targetSpo2 = isPulsing ? vitals.spo2 : 0;
        const targetCo2 = isPulsing ? vitals.co2 : 0;
        const targetResp = isPulsing ? vitals.resp : 0;
        const targetPouls = isPulsing ? vitals.pouls : 0;
        const targetSystolic = isPulsing ? (vitals.displayedSystolic ?? vitals.systolic) : 0;
        const targetDiastolic = isPulsing ? (vitals.displayedDiastolic ?? vitals.diastolic) : 0;

        let nextBpm = prev.bpm;
        let nextSpo2 = prev.spo2;
        let nextCo2 = prev.co2;
        let nextResp = prev.resp;
        let nextPouls = prev.pouls;
        let nextSystolic = prev.systolic;
        let nextDiastolic = prev.diastolic;

        if (prev.bpm !== targetBpm) {
          nextBpm = prev.bpm + (targetBpm - prev.bpm) * 0.22;
          if (Math.abs(targetBpm - nextBpm) < 0.1) nextBpm = targetBpm;
        }

        if (prev.spo2 !== targetSpo2) {
          nextSpo2 = prev.spo2 + (targetSpo2 - prev.spo2) * 0.095;
          if (Math.abs(targetSpo2 - nextSpo2) < 0.1) nextSpo2 = targetSpo2;
        }

        if (prev.co2 !== targetCo2) {
          nextCo2 = prev.co2 + (targetCo2 - prev.co2) * 0.16;
          if (Math.abs(targetCo2 - nextCo2) < 0.1) nextCo2 = targetCo2;
        }

        if (prev.resp !== targetResp) {
          nextResp = prev.resp + (targetResp - prev.resp) * 0.095;
          if (Math.abs(targetResp - nextResp) < 0.1) nextResp = targetResp;
        }

        if (prev.pouls !== targetPouls) {
          nextPouls = prev.pouls + (targetPouls - prev.pouls) * 0.22;
          if (Math.abs(targetPouls - nextPouls) < 0.1) nextPouls = targetPouls;
        }

        if (prev.systolic !== targetSystolic) {
          nextSystolic = prev.systolic + (targetSystolic - prev.systolic) * 0.12;
          if (Math.abs(targetSystolic - nextSystolic) < 0.1) nextSystolic = targetSystolic;
        }

        if (prev.diastolic !== targetDiastolic) {
          nextDiastolic = prev.diastolic + (targetDiastolic - prev.diastolic) * 0.12;
          if (Math.abs(targetDiastolic - nextDiastolic) < 0.1) nextDiastolic = targetDiastolic;
        }  

        if (
          nextBpm === prev.bpm &&
          nextSpo2 === prev.spo2 &&
          nextCo2 === prev.co2 &&
          nextResp === prev.resp &&
          nextPouls === prev.pouls &&
          nextSystolic == prev.systolic &&
          nextDiastolic == prev.diastolic
        ) {
          return prev;
        }

        return {
          bpm: nextBpm,
          spo2: nextSpo2,
          co2: nextCo2,
          resp: nextResp,
          pouls: nextPouls,
          diastolic: nextDiastolic,
          systolic: nextSystolic
        };
      });
    }, 500);

    return () => clearInterval(interval);
  }, [vitals.bpm, vitals.spo2, vitals.co2, vitals.resp, vitals.pouls, vitals.rhythm, vitals.diastolic, vitals.systolic, vitals.displayedDiastolic, vitals.displayedSystolic]);

  const logout = useCallback(() => {
    localStorage.removeItem("username");
    window.location.href = "/connect";
  }, []);

  const pulselessRhythms = ["fibrillationVentriculaire", "asystole", "fv", "asysto", "arret","choc", "tachy_a", "tachycardieAtriale","tsv", "fib_a","fibrillationAtriale", "tv_1", "tachycardieVentriculaire","tv_2","tvType2"];
  const hasPulse = !pulselessRhythms.includes(vitals.rhythm) && vitals.bpm > 0;

  let bpDisplay = "--/--";
  if (cosmeticPni.isMeasuring) {
    bpDisplay = cosmeticPni.stepValue !== null ? String(cosmeticPni.stepValue) : "--";
  } else if (vitals.displayedSystolic !== null) {
    bpDisplay = `${vitals.displayedSystolic}/${vitals.displayedDiastolic}`;
  }

  const exportedVitals = {
      ...vitals,
      isPNIMeasuring: cosmeticPni.isMeasuring,
      pniStepValue: cosmeticPni.stepValue,
      showPNI: vitals.showPNI || cosmeticPni.showPNI,
      isPressureDotted: vitals.isPressureDotted,
      isDefibPressureDotted: vitals.isDefibPressureDotted,
      isCO2Dotted: vitals.isCO2Dotted,
      isDefibCO2Dotted: vitals.isDefibCO2Dotted,
      isBPDotted: vitals.isBPDotted, 
      isDefibBPDotted: vitals.isDefibBPDotted,
      co2: !hasPulse ? 0 : vitals.co2,
      resp: !hasPulse ? 0 : vitals.resp,
      spo2: !hasPulse ? 0 : vitals.spo2,
      bpDisplay,
      cosmeticBpm: Math.round(cosmeticVitals.bpm),
      cosmeticSpo2: !hasPulse ? Math.round(cosmeticVitals.spo2) : Math.round(cosmeticVitals.spo2), 
      cosmeticCo2: !hasPulse ? Math.round(cosmeticVitals.co2) : Math.round(cosmeticVitals.co2),
      cosmeticResp: !hasPulse ? Math.round(cosmeticVitals.resp) : Math.round(cosmeticVitals.resp),
      cosmeticPouls: !hasPulse ? 0 : Math.round(cosmeticVitals.pouls),
      shockTimestamp: vitals.shockTimestamp
  };
  const startPNI = useCallback(() => {
    setCosmeticPni({
      isMeasuring: true,
      stepValue: 160,
      showPNI: false,
    });
    sendMessage({ 
      type: "defibrillator_action", 
      action: "start_pni", 
      target_device: deviceId
    });
  }, [sendMessage, deviceId]);

  const isScopeHrAlarm = !exportedVitals.isHRDotted && (exportedVitals.bpm > 120 || exportedVitals.bpm < 50);
  const isScopeSpo2Alarm = !exportedVitals.isPressureDotted && (exportedVitals.spo2 < 90);
  const isScopeCo2Alarm = !exportedVitals.isCO2Dotted && (exportedVitals.co2 > 45 || exportedVitals.co2 < 35);
  const isScopeAlarming = isScopeHrAlarm || isScopeSpo2Alarm || isScopeCo2Alarm;

  const isDefibHrAlarm = !exportedVitals.isDefibHRDotted && (exportedVitals.bpm > 120 || exportedVitals.bpm < 50);
  const isDefibSpo2Alarm = !exportedVitals.isDefibPressureDotted && (exportedVitals.spo2 < 90);
  const isDefibCo2Alarm = !exportedVitals.isDefibCO2Dotted && (exportedVitals.co2 > 45 || exportedVitals.co2 < 35);
  const isDefibAlarming = isDefibHrAlarm || isDefibSpo2Alarm || isDefibCo2Alarm;

  return {
    vitals: exportedVitals, hasPulse, username: sessionId || 'anonymous', logout, startPNI,
    isScopeAlarming, isDefibAlarming,
    isScopeSpo2Alarm, isDefibSpo2Alarm,
    isScopeCo2Alarm,
  };
};