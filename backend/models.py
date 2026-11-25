from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

class DefibrillatorState(BaseModel):
    displayMode: str = "ARRET"
    manualEnergy: int = 0
    lastEvent: Optional[str] = None
    isPacing: bool = False
    pacerFrequency: int = 70
    pacerIntensity: int = 30
    pacerMode: str = "Fixe"
    isSynchro: bool = False
    hrDotted: bool = True
    pressureDotted: bool = True
    co2Dotted: bool = True
    defibHrDotted: bool = True
    defibPressureDotted: bool = True
    defibCo2Dotted: bool = True
    isDefibRemoteControl: bool = True
    shockCount: int = 0

class ScopeState(BaseModel):
    hrDotted: bool = True
    pressureDotted: bool = True
    co2Dotted: bool = True
    isRemoteControl: bool = True
    lastEvent: Optional[str] = None

class GenericDeviceState(BaseModel):
    lastEvent: Optional[str] = None

class BloodPressure(BaseModel):
    systolic: int = 120
    diastolic: int = 80

class PatientState(BaseModel):
    heartRate: int = 70
    rhythmType: str = "sinus"
    spo2: int = 98
    co2: int = 40
    bloodPressure: BloodPressure = Field(default_factory=BloodPressure)
    respiratoryRate: int = 15

class SessionState(BaseModel):
    scenario_id: Optional[str] = None
    current_step: int = 0
    natural_rhythm: str = "sinus"
    device_states: Dict[str, Any] = Field(default_factory=dict)
    patient_state: PatientState = Field(default_factory=PatientState)
    is_complete: bool = False
    show_hints: bool = False
    # Journal de séance (log) : source de vérité côté serveur, partagée par
    # tous les appareils connectés à la session (remplace le sessionStorage
    # côté navigateur, qui n'était pas partagé entre appareils).
    log_full: str = ""
    log_recent: List[str] = Field(default_factory=list)


class ScenarioStep(BaseModel):
    step: int
    description: str
    validation: Dict[str, Any]
    onComplete: Optional[List[Dict[str, Any]]] = None

class Scenario(BaseModel):
    id: str
    title: str
    description: str
    initialState: PatientState
    steps: List[ScenarioStep]