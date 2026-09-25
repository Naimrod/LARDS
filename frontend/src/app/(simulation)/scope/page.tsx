"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useVitals } from '../../hooks/useVitals';
import { AlarmBanner } from '../../components/AlarmBanner';
import { ToggleableValue } from '../../components/ToggleableValue';
import ECGWrapper from '../../components/graphsdata/ECGWrapper';
import PlethWrapper from '../../components/graphsdata/PlethWrapper';
import Co2Wrapper from '../../components/graphsdata/CO2Wrapper';
import { useAudio } from '../../context/AudioContext';
import Link from 'next/link';
import { useWebSocket } from '../../context/WebSocketContext';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

function EditableBound({ 
    value, 
    minLimit, 
    maxLimit, 
    onChange 
}: { 
    value: number, 
    minLimit: number, 
    maxLimit: number, 
    onChange: (val: number) => void 
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [tempVal, setTempVal] = useState(value);

    const validateAndSave = () => {
        let finalVal = tempVal;
        
        if (finalVal < minLimit) finalVal = minLimit;
        if (finalVal > maxLimit) finalVal = maxLimit;
        
        setTempVal(finalVal); 
        setIsEditing(false);
        onChange(finalVal);
    };

    const handleBlur = () => validateAndSave();

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') validateAndSave();
    };

    // Synchronisation si le composant parent met à jour la valeur pendant qu'on n'édite pas
    useEffect(() => {
        setTempVal(value);
    }, [value]);

    if (isEditing) {
        return (
            <input
                type="number"
                value={tempVal}
                min={minLimit}
                max={maxLimit}
                onChange={(e) => setTempVal(Number(e.target.value))}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                autoFocus
                style={{ 
                    width: "45px", 
                    background: "rgba(0,0,0,0.8)", 
                    color: "inherit", 
                    textAlign: "center", 
                    fontSize: "inherit", 
                    fontFamily: "inherit",
                    outline: "none"
                }}
            />
        );
    }

    return (
        <span 
            onClick={() => setIsEditing(true)} 
            style={{ cursor: "pointer", paddingBottom: "2px", color: "inherit" }} 
            title={`Limite: ${minLimit-1} à ${maxLimit}`}
        >
            {value}
        </span>
    );
}

export default function App() {
    const { vitals, hasPulse, username, logout, startPNI, isScopeSpo2Alarm: _unused, isScopeCo2Alarm } = useVitals();
    const { activeDevices, sendMessage, subscribeMessage, sessionId, lastMessage, connectionRejected, rejectionMessage } = useWebSocket();
    const audioService = useAudio();

    useEffect(() => {
        const timer = setTimeout(() => {
            sendMessage({ type: "request_sync" });
        }, 500); // Attendre que le WebSocket soit prêt
        return () => clearTimeout(timer);
    }, [sendMessage]);

    const [showECG, setShowECG] = useState(false);
    const [showPleth, setShowPleth] = useState(false);
    const [showCo2, setShowCo2] = useState(false);
    const [showBP, setShowBP] = useState(false);
    const [showPulse, setShowPulse] = useState(false);
    const [showFRVA, setShowFRVA] = useState(false);
    const [ecgBounds, setEcgBounds] = useState({ max: 130, min: 50 });
    const [spo2Bounds, setSpo2Bounds] = useState({ max: 100, min: 90 });
    const [co2Bounds, setCo2Bounds] = useState({ max: 65, min: 25 });
    const [bpBounds, setBpBounds] = useState({ max: 140, min: 100 });
    const [frvaBounds, setFrvaBounds] = useState({ max: 30, min: 8 });

    const isScopeSpo2Alarm = showPleth && (vitals.cosmeticSpo2 < spo2Bounds.min || vitals.cosmeticBpm === 0);
    const isScopeRespAlarm = showFRVA && (vitals.cosmeticResp < frvaBounds.min || vitals.cosmeticResp >= frvaBounds.max || vitals.cosmeticBpm === 0);

    // PNI Audio Synchronization
    const prevIsPNIMeasuring = useRef(vitals.isPNIMeasuring);
    const prevLastAction = useRef<string | null>(null);

    useEffect(() => {
        if (vitals.isPNIMeasuring && !prevIsPNIMeasuring.current) {
            audioService.playCuffInflation?.();
        } else if (!vitals.isPNIMeasuring && prevIsPNIMeasuring.current) {
            audioService.stopCuffInflation?.();
        }

        if (lastMessage?.type === "defibrillator_action" && lastMessage?.action === "pni_done" && lastMessage?.action !== prevLastAction.current) {
            audioService.playBPDone?.();
        }

        prevIsPNIMeasuring.current = vitals.isPNIMeasuring;
        prevLastAction.current = lastMessage?.action || null;
    }, [vitals.isPNIMeasuring, audioService, lastMessage]);

    useEffect(() => {
        return () => {
            try { audioService.stopCuffInflation?.(); } catch {}
        };
    }, [audioService]);

    
    // SpO2 alarm audio sequence is now managed inside the AlarmBanner component via useAlarms hook

    const prevIsScopeCo2Alarm = useRef(isScopeCo2Alarm);
    useEffect(()=> {
        if (isScopeCo2Alarm && !prevIsScopeCo2Alarm.current) {
            audioService.startSpo2AlarmSequence?.();
        } else if (!isScopeCo2Alarm && prevIsScopeCo2Alarm.current) {
            audioService.stopSpo2AlarmSequence?.();
        }
        prevIsScopeCo2Alarm.current = isScopeCo2Alarm;

        return () => {
            try { audioService.stopSpo2AlarmSequence?.(); } catch {}
        };
    }, [isScopeCo2Alarm, audioService])

    useEffect(() => {
    // Liaison : FRVA -> ECG (BPM)
    if (vitals.isHRDotted !== undefined) {
        const isECGVisible = !vitals.isHRDotted;
        setShowECG(isECGVisible);
        setShowFRVA(isECGVisible); 
    }
    
    // Liaison : Pouls -> SpO2 (Pleth)
    if (vitals.isPressureDotted !== undefined) {
        const isPlethVisible = !vitals.isPressureDotted;
        setShowPleth(isPlethVisible);
        setShowPulse(isPlethVisible);
    }
    
    if (vitals.isCO2Dotted !== undefined) {
        setShowCo2(!vitals.isCO2Dotted); 
    }
    
    if (vitals.isBPDotted !== undefined) {
        setShowBP(!vitals.isBPDotted);
    }
}, [vitals.isHRDotted, vitals.isPressureDotted, vitals.isCO2Dotted, vitals.isBPDotted]);

    useEffect(() => {
        const handleMessage = (msg: any) => {
            if (!msg) return;
            
            if (msg.type === "visibility_state") {
                // Applique la liaison : FRVA -> ECG
                if (msg.hrDotted !== undefined) {
                    const isECGVisible = !msg.hrDotted;
                    setShowECG(isECGVisible);
                    setShowFRVA(isECGVisible);
                }
                
                // Applique la liaison : Pouls -> SpO2
                if (msg.pressureDotted !== undefined) {
                    const isPlethVisible = !msg.pressureDotted;
                    setShowPleth(isPlethVisible);
                    setShowPulse(isPlethVisible);
                }
                
                if (msg.co2Dotted !== undefined) {
                    setShowCo2(!msg.co2Dotted);
                }
                
                if (msg.bpDotted !== undefined) {
                    setShowBP(!msg.bpDotted);
                }
            }
        };

        const unsubscribe = subscribeMessage(handleMessage);
        return () => unsubscribe();
    }, [subscribeMessage]);

    if (connectionRejected) {
        return (
            <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center p-6 text-center font-sans text-zinc-100">
                <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 text-red-400">
                    <ShieldAlert className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-zinc-100 mb-2 tracking-tight">Accès refusé</h2>
                <p className="text-sm text-zinc-400 max-w-xs leading-relaxed mb-8">
                    {rejectionMessage || "Un scope est déjà actif pour cette session."}
                </p>
                <Link
                    href="/connect"
                    className="inline-flex items-center justify-center gap-2 bg-[#18181b] hover:bg-[#27272a] text-zinc-100 font-medium px-6 py-3 rounded-xl border border-zinc-700/80 transition-all duration-150 active:scale-95 text-sm"
                >
                    <ArrowLeft className="w-4 h-4 text-zinc-400" />
                    Retour au menu
                </Link>
            </div>
        );
    }

    return (
        <div className="theme-dark-locked scope-container" data-theme="dark">

            <div className="absolute top-[clamp(45px,6vh,60px)] left-[clamp(10px,2vw,30px)] right-[clamp(10px,2vw,30px)] flex flex-row flex-wrap gap-[clamp(10px,1.5vw,20px)] z-[1000] pointer-events-none">
                {showECG && (
                    <AlarmBanner 
                        rhythmType={vitals.rhythm as any} 
                        showFCValue={showECG} 
                        heartRate={vitals.cosmeticBpm}
                        minBpm={ecgBounds.min}
                        maxBpm={ecgBounds.max}
                        targetHR={vitals.bpm}
                    />
                )}
                <AlarmBanner 
                    type="spo2" 
                    showPleth={showPleth} 
                    cosmeticSpo2={vitals.cosmeticSpo2}
                    minSpo2={spo2Bounds.min}
                    maxSpo2={spo2Bounds.max}
                    heartRate={vitals.cosmeticBpm}
                />
                <AlarmBanner 
                    type="resp" 
                    showResp={showFRVA} 
                    cosmeticResp={vitals.cosmeticResp}
                    minResp={frvaBounds.min}
                    maxResp={frvaBounds.max}
                    heartRate={vitals.cosmeticBpm}
                />
                <AlarmBanner
                    type="bp"
                    showBP={showBP}
                    hasBpReading={vitals.displayedSystolic !== null}
                    systolic={vitals.displayedSystolic ?? 0}
                    minSysto={bpBounds.min}
                    maxSysto={bpBounds.max}
                    heartRate={vitals.cosmeticBpm}
                />
            </div>

            {/* Header hidden — will be redesigned as a less obtrusive overlay
            <div className="scope-patient-bar">
                <span>Patient: <strong>{username}</strong></span>
                <button className="bg-[#333] hover:bg-[#444] active:bg-[#222] text-white border border-[#555] px-[clamp(10px,1.5vw,18px)] py-[clamp(4px,0.8vh,8px)] rounded cursor-pointer text-[clamp(12px,1.6vh,15px)] font-bold transition-colors" onClick={logout}>Logout</button>
            </div>
            */}

            <div className="scope-vital-lane">
                <div
                    className="scope-vital-grid text-[#00ff00]" 
                    onClick={() => { 
                        if (!vitals.isRemoteControl) {
                            const nextVisibility = !showECG;
                            setShowECG(nextVisibility);
                            setShowFRVA(nextVisibility); 
                            sendMessage({ 
                                type: "HRscope", 
                                dataType: "scope", 
                                isHRDotted: !nextVisibility 
                            });
                            sendMessage({ 
                                type: "visibility_state", 
                                target_device: "scope_CONTR", 
                                hrDotted: !nextVisibility 
                            });
                        } 
                    }}
                    style={{ cursor: vitals.isRemoteControl ? 'default' : 'pointer' }}
                >
                    <div className="w-full min-w-0 flex items-center">
                        <ECGWrapper heartRate={vitals.bpm} rhythmType={vitals.rhythm as any} isRevealed={showECG} shockTimestamp={vitals.shockTimestamp}/>
                    </div>
                    <h2 className="scope-bounds text-[#00ff00]">
                        <EditableBound 
                            value={ecgBounds.max} 
                            minLimit={ecgBounds.min + 1} 
                            maxLimit={300}
                            onChange={(v) => setEcgBounds(prev => ({ ...prev, max: v }))} 
                        /><br />
                        <EditableBound 
                            value={ecgBounds.min} 
                            minLimit={0}                 
                            maxLimit={ecgBounds.max - 1}
                            onChange={(v) => setEcgBounds(prev => ({ ...prev, min: v }))} 
                        />
                    </h2>
                    <ToggleableValue value={vitals.cosmeticBpm} className="scope-value text-[#00ff00]" isHidden={!showECG} />
                </div>
            </div>

            <div className="scope-vital-lane">
                <div
                    className={`scope-vital-grid text-[#00fff2]${isScopeSpo2Alarm ? ' animate-spo2-alarm' : ''}`}
                    onClick={() => { 
                        if (!vitals.isRemoteControl) {
                            const nextVisibility = !showPleth;
                            
                            setShowPleth(nextVisibility);
                            setShowPulse(nextVisibility);
                            
                            sendMessage({ 
                                type: "Prscope", 
                                dataType: "scope",
                                isPressureDotted: !nextVisibility
                            });
                            sendMessage({
                                type: "visibility_state",
                                target_device: "scope_CONTR",
                                pressureDotted: !nextVisibility
                            });
                        } 
                    }}
                    style={{ cursor: vitals.isRemoteControl ? 'default' : 'pointer' }}
                >
                    <div className="w-full min-w-0 flex items-center">
                        <PlethWrapper spo2={vitals.spo2} heartRate={vitals.bpm} isRevealed={showPleth} />
                    </div>
                    <h2 className="scope-bounds text-[#00fff2]">
                        <EditableBound 
                            value={spo2Bounds.max} 
                            minLimit={spo2Bounds.min + 1} 
                            maxLimit={100}               
                            onChange={(v) => setSpo2Bounds(prev => ({ ...prev, max: v }))} 
                        /><br />
                        <EditableBound 
                            value={spo2Bounds.min} 
                            minLimit={0} 
                            maxLimit={spo2Bounds.max - 1} 
                            onChange={(v) => setSpo2Bounds(prev => ({ ...prev, min: v }))} 
                        />
                    </h2>
                    <ToggleableValue value={(vitals.cosmeticBpm <= 5 || vitals.cosmeticSpo2 <= 55) ? "--" : `${vitals.cosmeticSpo2}%`} className="scope-value text-[#00fff2]" isHidden={!showPleth} />
                </div>
            </div>

            <div className="scope-vital-lane">
                <div
                    className={`scope-vital-grid text-white${isScopeRespAlarm ? ' animate-co2-alarm' : ''}`}
                    onClick={() => { 
                        if (!vitals.isRemoteControl) {
                            const nextVisibility = !showECG;
                            setShowECG(nextVisibility);
                            setShowFRVA(nextVisibility); 
                            sendMessage({ 
                                type: "HRscope", 
                                dataType: "scope", 
                                isHRDotted: !nextVisibility 
                            });
                            sendMessage({ 
                                type: "visibility_state", 
                                target_device: "scope_CONTR", 
                                hrDotted: !nextVisibility 
                            });
                        } 
                    }}
                    style={{ cursor: vitals.isRemoteControl ? 'default' : 'pointer' }}
                >
                    <div className="w-full min-w-0 flex items-center">
                        <Co2Wrapper 
                        co2={vitals.co2}
                        heartRate={vitals.bpm} 
                        respirationRate={vitals.resp} 
                        isRevealed={showFRVA}
                        />
                    </div>
                    <h2 className="scope-bounds">
                        <EditableBound 
                            value={frvaBounds.max} 
                            minLimit={frvaBounds.min + 1} 
                            maxLimit={100}               
                            onChange={(v) => setFrvaBounds(prev => ({ ...prev, max: v }))} 
                        /><br />
                        <EditableBound 
                            value={frvaBounds.min} 
                            minLimit={0} 
                            maxLimit={frvaBounds.max - 1}
                            onChange={(v) => setFrvaBounds(prev => ({ ...prev, min: v }))} 
                        />
                    </h2>
                    <ToggleableValue value={(vitals.bpm == 0) ? "--" : `${vitals.cosmeticResp}`} className="scope-value" isHidden={!showFRVA}/>
                </div>
            </div>

            <div className="scope-bottom-row">
                <div className="flex flex-col items-center justify-center min-w-[140px] text-[#ff0000]">
                    <h2 className="m-0 mb-[clamp(4px,1vh,10px)] text-[clamp(14px,2.5vh,22px)] font-bold uppercase tracking-wider">TA</h2>
                    <div className="flex gap-[clamp(8px,1.5vw,20px)] items-center justify-center">
                        <h2 className="scope-bounds">
                        <EditableBound 
                            value={bpBounds.max} 
                            minLimit={bpBounds.min + 1} 
                            maxLimit={200}                // Limite absolue TA
                            onChange={(v) => setBpBounds(prev => ({ ...prev, max: v }))} 
                        /><br />
                        <EditableBound 
                            value={bpBounds.min} 
                            minLimit={0} 
                            maxLimit={bpBounds.max - 1} 
                            onChange={(v) => setBpBounds(prev => ({ ...prev, min: v }))} 
                        />
                    </h2>
                    <div 
                    
                    onClick={() => {
                        if (vitals.isRemoteControl) {
                            // Remote Control ON: L'étudiant ne peut pas afficher/cacher, juste mesurer
                            if (showBP) {
                                startPNI();
                            }
                        } else {
                            // Remote Control OFF: Comportement libre
                            if (!showBP) {
                                const nextVisibility = !showBP;
                                setShowBP(nextVisibility);
                                sendMessage({
                                    type: "visibility_state",
                                    bpDotted: !nextVisibility 
                                });
                                sendMessage({
                                type: "visibility_state",
                                target_device: "scope_CONTR",
                                bpDotted: !nextVisibility
                            });
                            }
                            startPNI();
                        }
                    }}
                    style={{ cursor: (!vitals.isRemoteControl || showBP) ? 'pointer' : 'default' }}
                >
                        <ToggleableValue 
                            value={vitals.bpDisplay || "--/--"} 
                            className="scope-value" 
                            isHidden={!hasPulse || (!showBP && !vitals.isPNIMeasuring)} 
                        />
                    </div>
                </div>
                </div>

                <div 
                    className="flex flex-col items-center justify-center min-w-[140px] text-[#ffff00]"
                    onClick={() => {
                        if (!vitals.isRemoteControl) {
                            const nextVisibility = !showPulse;
                            
                            setShowPulse(nextVisibility);
                            setShowPleth(nextVisibility); 
                            
                            sendMessage({ 
                                type: "Prscope", 
                                dataType: "scope",
                                isPressureDotted: !nextVisibility
                            });
                            sendMessage({
                                type: "visibility_state",
                                target_device: "scope_CONTR",
                                pressureDotted: !nextVisibility
                            });
                        }
                    }}
                    style={{ cursor: vitals.isRemoteControl ? 'default' : 'pointer' }}
                >
                    <h2 className="m-0 mb-[clamp(4px,1vh,10px)] text-[clamp(14px,2.5vh,22px)] font-bold uppercase tracking-wider">Pouls</h2>
                <div className="flex gap-[clamp(8px,1.5vw,20px)] items-center justify-center">
                    <h2 className="scope-bounds">
                        <EditableBound 
                            value={ecgBounds.max} 
                            minLimit={ecgBounds.min + 1} 
                            maxLimit={300}
                            onChange={(v) => setEcgBounds(prev => ({ ...prev, max: v }))} 
                        /><br />
                        <EditableBound 
                            value={ecgBounds.min} 
                            minLimit={0}                 
                            maxLimit={ecgBounds.max - 1}
                            onChange={(v) => setEcgBounds(prev => ({ ...prev, min: v }))} 
                        />
                    </h2>
                    
                    
                        <ToggleableValue value={vitals.cosmeticPouls} className="scope-value" isHidden={!hasPulse || !showPulse}/>
                    </div>
                </div>

                <div 
                    className="flex flex-col items-center justify-center min-w-[140px] text-white"
                    onClick={() => {
                        if (!vitals.isRemoteControl) {
                            const nextVisibility = !showCo2;
                            setShowCo2(nextVisibility);
                            sendMessage({ 
                                type: "COscope", 
                                dataType: "scope", 
                                isCO2Dotted: !nextVisibility 
                            });
                            sendMessage({
                                type: "visibility_state",
                                target_device: "scope_CONTR",
                                co2Dotted: !nextVisibility
                            });
                        }
                    }}
                    style={{ cursor: vitals.isRemoteControl ? 'default' : 'pointer' }}
                >
                    <h2 className="m-0 mb-[clamp(4px,1vh,10px)] text-[clamp(14px,2.5vh,22px)] font-bold uppercase tracking-wider">CO2</h2>
                    <div className="flex gap-[clamp(8px,1.5vw,20px)] items-center justify-center">
                        <h2 className="scope-bounds">
                        <EditableBound 
                            value={co2Bounds.max} 
                            minLimit={co2Bounds.min + 1} 
                            maxLimit={150}
                            onChange={(v) => setCo2Bounds(prev => ({ ...prev, max: v }))} 
                        /><br />
                        <EditableBound 
                            value={co2Bounds.min} 
                            minLimit={0}                 
                            maxLimit={co2Bounds.max - 1}
                            onChange={(v) => setCo2Bounds(prev => ({ ...prev, min: v }))} 
                        />
                    </h2>
                        <ToggleableValue value={vitals.cosmeticCo2} className="scope-value" isHidden={!hasPulse || !showCo2}/>
                    </div>
                </div>
            </div>
        </div>
    );
}