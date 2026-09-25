import json
import asyncio
import os
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse

# Import Pydantic models for session and device states
from models import SessionState, DefibrillatorState, ScopeState, GenericDeviceState, Scenario

#-------MODELS-------------------------
class SessionData(BaseModel):
    username: str

#-------SCENARIO MANAGER-------------------------
class ScenarioManager:
    PROPERTY_MAPPING = {
        "isSynchroMode": "isSynchro",
        "pulse": "heartRate",
        "heart_rate": "heartRate",
        "mode": "displayMode",
        "display_mode": "displayMode"
    }

    def __init__(self, manager: 'ConnectionManager'):
        self.manager = manager
        self.scenarios: Dict[str, Any] = {}
        self.session_states: Dict[str, Dict[str, Any]] = {} # session_id -> state
        self.transition_tasks: Dict[str, asyncio.Task] = {} # session_id -> Task
        self.load_scenarios()

    def load_scenarios(self):
        base_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "scenarios")
        if not os.path.exists(base_path):
            print(f"Warning: Scenario path {base_path} not found.")
            return

        for filename in os.listdir(base_path):
            if filename.endswith(".json"):
                try:
                    with open(os.path.join(base_path, filename), "r") as f:
                        scenario_data = json.load(f)
                        # Authoritative validation via Pydantic model
                        validated_scenario = Scenario.model_validate(scenario_data)
                        self.scenarios[validated_scenario.id] = validated_scenario.model_dump()
                except Exception as e:
                    print(f"Failed to load/validate scenario {filename}: {e}")
        print(f"Loaded {len(self.scenarios)} scenarios.")

    def get_session_state(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self.session_states:
            self.session_states[session_id] = SessionState().model_dump()
        return self.session_states[session_id]

    def get_device_state(self, session_id: str, device_id: str) -> Dict[str, Any]:
        state = self.get_session_state(session_id)
        if "device_states" not in state:
            state["device_states"] = {}
            
        if device_id not in state["device_states"]:
            device_type = "defibrillator"  # default fallback
            if "_" in device_id:
                parts = device_id.split("_", 1)
                if parts[0] in ["defibrillator", "scope", "control", "dashboard"]:
                    device_type = parts[0]
            elif device_id.startswith("defibrillator"):
                device_type = "defibrillator"
            elif device_id.startswith("scope"):
                device_type = "scope"
            elif device_id.startswith("control"):
                device_type = "control"
            elif device_id.startswith("dashboard"):
                device_type = "dashboard"

            # Création de l'état de base
            if device_type == "defibrillator":
                new_state = DefibrillatorState().model_dump()
            elif device_type == "scope":
                new_state = ScopeState().model_dump()
            else:
                new_state = GenericDeviceState().model_dump()

            for k in ["hrDotted", "pressureDotted", "co2Dotted", "bpDotted", 
                      "defibHrDotted", "defibPressureDotted", "defibCo2Dotted", "defibBpDotted"]:
                new_state[k] = True

            state["device_states"][device_id] = new_state

            dev_state = state["device_states"][device_id]
            # Only propagate remote control modes globally, not visibility settings (those are per-device)
            propagate_keys = ["isRemoteControl", "isDefibRemoteControl"]
            
            # Propagate only remote control modes from ANY existing device to maintain consistency
            for existing_id, existing_state in state["device_states"].items():
                if existing_id != device_id: 
                    for k in propagate_keys:
                        if k in existing_state and existing_state[k] is not None:
                            dev_state[k] = existing_state[k]
        return state["device_states"][device_id]

    def get_state_value(self, session_id: str, property_name: str, device_id: Optional[str] = None):
        state = self.get_session_state(session_id)
        mapped_prop = self.PROPERTY_MAPPING.get(property_name, property_name)
        
        
        if device_id:
            dev_state = state.get("device_states", {}).get(device_id)
            if dev_state and mapped_prop in dev_state:
                return dev_state[mapped_prop]
                
      
        last_dev_id = state.get("last_updated_device")
        if last_dev_id:
            dev_state = state.get("device_states", {}).get(last_dev_id)
            if dev_state and mapped_prop in dev_state:
                return dev_state[mapped_prop]
                
       
        val = state.get("patient_state", {}).get(mapped_prop)
        if val is not None: return val
        
        
        for dev_state in state.get("device_states", {}).values():
            if mapped_prop in dev_state:
                return dev_state[mapped_prop]
        return None

    async def start_scenario(self, session_id: str, scenario_id: str):
        if scenario_id not in self.scenarios: return
        scenario = self.scenarios[scenario_id]
        state = self.get_session_state(session_id)
        state.update({
            "scenario_id": scenario_id,
            "current_step": 0,
            "is_complete": False,
            "show_hints": False
        })
        state["patient_state"] = scenario.get("initialState", {}).copy()
        state["natural_rhythm"] = state["patient_state"].get("rhythmType", "sinus")

        steps = scenario.get("steps", [])
        first_step = steps[0] if steps else {}
        await self.manager.broadcast({
            "type": "scenario",
            "action": "start",
            "scenario_id": scenario_id,
            "title": scenario["title"],
            "step_description": first_step.get("description", ""),
            "total_steps": len(steps),
            "show_hints": False
        }, session_id)

        await self.apply_vitals_update(session_id, state["patient_state"])
        await self.check_step_advancement(session_id)

    async def stop_scenario(self, session_id: str):
        if session_id in self.session_states:
            self.session_states[session_id]["scenario_id"] = None
            self.session_states[session_id]["show_hints"] = False
            self.session_states[session_id]["is_complete"] = False
            self.session_states[session_id]["current_step"] = 0
        await self.manager.broadcast({"type": "scenario", "action": "stop"}, session_id)

    async def toggle_hints(self, session_id: str, show_hints: bool):
        state = self.get_session_state(session_id)
        state["show_hints"] = show_hints
        await self.manager.broadcast({
            "type": "scenario",
            "action": "toggle_hints",
            "show_hints": show_hints
        }, session_id)
        # Trigger vitals update to broadcast full sync_state
        await self.apply_vitals_update(session_id, {})


    async def update_device_state(self, session_id: str, device_id: str, updates: Dict[str, Any]):
        state = self.get_session_state(session_id)
        dev_state = self.get_device_state(session_id, device_id)
        dev_state.update(updates)
        state["last_updated_device"] = device_id

        await self.check_physiology_rules(session_id, device_id, updates.get("lastEvent"))
        await self.check_step_advancement(session_id)
    
        if "lastEvent" in updates:
            dev_state["lastEvent"] = None

    async def run_pni_cycle(self, session_id: str, target_device: str = None):
        state = self.get_session_state(session_id)
        patient = state.setdefault("patient_state", {})

        def update_local_pni_device(updates: Dict[str, Any]):
            if target_device:
                dev_state = state.setdefault("device_states", {}).setdefault(target_device, {})
                dev_state.update(updates)
            else:
                for dev_id, dev_state in state.get("device_states", {}).items():
                    if dev_id.startswith("defibrillator") or dev_id.startswith("scope"):
                        dev_state.update(updates)

        # Update the server state immediately
        bp = patient.get("bloodPressure", {"systolic": 120, "diastolic": 80})
        sys_val = bp.get("systolic", 120)
        dia_val = bp.get("diastolic", 80)
        patient["displayed_bp"] = {"systolic": sys_val, "diastolic": dia_val}
        
        update_local_pni_device({"is_pni_measuring": False, "show_pni": True, "pni_step_value": None})
        await self.apply_vitals_update_sync_state(session_id)

        # Broadcast start of PNI to trigger the client-side cosmetic loop
        await self.manager.broadcast({
            "type": "defibrillator_action", 
            "action": "pni_start", 
            "is_pni_measuring": True, 
            "target_device": target_device
        }, session_id)

        # Broadcast done immediately to deliver final values
        await self.manager.broadcast({
            "type": "defibrillator_action", 
            "action": "pni_done", 
            "is_pni_measuring": False, 
            "show_pni": True,
            "systolic": sys_val,    
            "diastolic": dia_val,  
            "target_device": target_device
        }, session_id)

    async def check_physiology_rules(self, session_id: str, device_id: str, last_event: Optional[str]):
        state = self.get_session_state(session_id)
        device = self.get_device_state(session_id, device_id)
        
        # SHOCK PHYSICS (Transient)
        if last_event == "shockDelivered":
            await self.apply_vitals_update(session_id, {
                "rhythmType": "choc"
            })
            return

        # PACING PHYSICS
        pacer_events = ["toggle_pacing", "set_pacer_frequency", "set_pacer_intensity", "set_pacer_mode", "set_display_mode"]
        if last_event in pacer_events and device.get("isPacing") and device.get("pacerIntensity", 0) >= 90:
            pacer_bpm = device.get("pacerFrequency", 70)
            await self.apply_vitals_update(session_id, {"rhythmType": "electroEntrainement", "heartRate": pacer_bpm})

    async def update_patient_state(self, session_id: str, updates: Dict[str, Any]):
        await self.apply_vitals_update(session_id, updates)
        await self.check_step_advancement(session_id)

    def is_step_met(self, validation: Dict[str, Any], session_id: str) -> bool:
        if "all_of" in validation: return all(self.check_condition(c, session_id) for c in validation["all_of"])
        if "any_of" in validation: return any(self.check_condition(c, session_id) for c in validation["any_of"])
        return self.check_condition(validation, session_id)

    def check_condition(self, condition: Dict[str, Any], session_id: str) -> bool:
        c_type = condition.get("type")
        target_device = condition.get("deviceId")
        
        if c_type == "stateChange":
            prop = condition.get("property")
            expected = condition.get("value")
            actual = self.get_state_value(session_id, prop, target_device)
            if actual is None:
                return False
            
            operator = condition.get("operator", "==")
            if operator in [">=", "<=", ">", "<"]:
                try:
                    act_num = float(actual)
                    exp_num = float(expected)
                    if operator == ">=": return act_num >= exp_num
                    if operator == "<=": return act_num <= exp_num
                    if operator == ">": return act_num > exp_num
                    if operator == "<": return act_num < exp_num
                except (ValueError, TypeError):
                    return False
            
                def to_bool(v):
                    if isinstance(v, bool): return v
                    return str(v).lower() in ["true", "1", "yes"]
                return to_bool(actual) == to_bool(expected)
            
            return str(actual).strip().lower() == str(expected).strip().lower()
            
        elif c_type == "event":
            state = self.get_session_state(session_id)
            expected_event = str(condition.get("eventName", "")).strip().lower()
            
            def check_event(dev_state):
                return str(dev_state.get("lastEvent", "")).strip().lower() == expected_event

            if target_device:
                dev_state = state.get("device_states", {}).get(target_device)
                if dev_state:
                    return check_event(dev_state)
            else:
                last_dev_id = state.get("last_updated_device")
                if last_dev_id:
                    dev_state = state.get("device_states", {}).get(last_dev_id)
                    if dev_state and check_event(dev_state):
                        return True
                # Scan de sécurité sur tous les appareils
                for dev_state in state.get("device_states", {}).values():
                    if check_event(dev_state):
                        return True
                        
        return False
        
    async def check_step_advancement(self, session_id: str):
        state = self.get_session_state(session_id)
        if not state["scenario_id"] or state["is_complete"]: return
        scenario = self.scenarios.get(state["scenario_id"])
        steps = scenario.get("steps", [])
        curr_idx = state["current_step"]
        if curr_idx >= len(steps): return
        step = steps[curr_idx]
        
        if self.is_step_met(step["validation"], session_id):
            state["current_step"] += 1

            for dev_state in state.get("device_states", {}).values():
                dev_state["lastEvent"] = None

            if step.get("onComplete"): 
                asyncio.create_task(self.run_on_complete_actions(session_id, step["onComplete"]))
            
            if state["current_step"] >= len(steps):
                state["is_complete"] = True
                await self.manager.broadcast({
                    "type": "scenario", 
                    "action": "complete", 
                    "scenario_id": scenario["id"]
                }, session_id)
                
            else:
                next_step = steps[state["current_step"]]
                await self.manager.broadcast({
                    "type": "scenario",
                    "action": "advance",
                    "step": state["current_step"],
                    "step_description": next_step.get("description", ""),
                    "scenario_id": scenario["id"]
                }, session_id)

    async def run_on_complete_actions(self, session_id: str, actions: Optional[List[Dict[str, Any]]]):
        if not actions:
            return
        for action in actions:
            if action["action"] == "updateState":
                delay = action.get("delay", 0) / 1000.0
                if delay > 0: await asyncio.sleep(delay)
                await self.apply_vitals_update(session_id, action["payload"])
                await self.check_step_advancement(session_id)

    async def delayed_vitals_update(self, session_id: str, payload: Dict[str, Any], delay: float):
        await asyncio.sleep(delay)
        await self.apply_vitals_update(session_id, payload)

    async def apply_vitals_update_sync_state(self, session_id: str):
        state = self.get_session_state(session_id)
        scenario_id = state.get("scenario_id")
        scenario = self.scenarios.get(scenario_id) if scenario_id else None
        steps = scenario.get("steps", []) if scenario else []
        curr_step_idx = state.get("current_step", 0)
        curr_step = steps[curr_step_idx] if curr_step_idx < len(steps) else None

        scenario_data = None
        if scenario_id:
            scenario_data = {
                "scenario_id": scenario_id,
                "title": scenario.get("title") if scenario else None,
                "current_step": curr_step_idx,
                "step_description": curr_step.get("description") if curr_step else None,
                "total_steps": len(steps),
                "is_complete": state.get("is_complete", False),
                "show_hints": state.get("show_hints", False)
            }

        import time
        await self.manager.broadcast({
            "type": "sync_state",
            "global_time": time.time(),
            "patient": state["patient_state"],
            "scenario": scenario_data
        }, session_id)



    async def apply_vitals_update(self, session_id: str, payload: Dict[str, Any]):
        payload = dict(payload) 
        state = self.get_session_state(session_id)

        if payload.pop("_reset_memory", False):
            if "patient_state" in state:
                state["patient_state"].clear()
            state.pop("target_vitals", None)
            state.pop("last_normal_bpm", None)
            state.pop("natural_rhythm", None)
            state.pop("post_shock_payload", None)
            
        patient = state.setdefault("patient_state", {})
        
        # Le dictionnaire inclut TOUS les noms longs des scénarios
        auto_bpms = {
            "tachy_a": 150, "tsv": 180, "jonctionnel": 130, "flutter atriale": 200, "fibrillationAtriale": 200,
            "idioventriculaire": 35, "tv_1": 180, "tachycardieVentriculaire": 180, "tv_2": 160, "tvType2": 160, 
            "fv": 180, "fibrillationVentriculaire": 180, "asysto": 0, "arret": 0, "asystole": 0
        }

        if patient.get("rhythmType") == "choc" and payload.get("rhythmType") != "choc":
            if "post_shock_payload" not in state:
                state["post_shock_payload"] = {}
            state["post_shock_payload"].update(payload)
            return 

        if "rhythmType" in payload:
            rhythm = payload["rhythmType"]
            old_rhythm = patient.get("rhythmType", "sinusal")
            
            # --- CAS DU CHOC ---
            if rhythm == "choc":
                patient["rhythmType"] = "choc"
                await self.manager.broadcast({"type": "rhythm", "rhythm": "choc"}, session_id)
                
                await self.manager.broadcast({
                    "type": "defibrillator_action",
                    "action": "shock_delivered"
                }, session_id)
                
                import time
                stun_id = time.time()
                state["current_stun_id"] = stun_id
                
                async def restore_after_shock():
                    await asyncio.sleep(0.3) 

                    if state.get("current_stun_id") != stun_id:
                        return
                    
                    if state["patient_state"].get("rhythmType") == "choc":
                        state["patient_state"]["rhythmType"] = "post_choc"
                        
                    saved_payload = state.pop("post_shock_payload", {})
                    
                    if "rhythmType" not in saved_payload:
                        saved_payload["rhythmType"] = "asysto"
                        saved_payload["_is_stun"] = True
                    
                        async def revert_stun():
                            await asyncio.sleep(4.0)
                            curr_state = self.get_session_state(session_id)
                            # On ne restaure que si AUCUN scénario n'a pris le relais !
                            if curr_state.get("current_stun_id") == stun_id:
                                if curr_state.get("patient_state", {}).get("rhythmType") in ["asysto", "asystole", "arret"]:
                                    await self.apply_vitals_update(session_id, {"rhythmType": curr_state.get("natural_rhythm", "sinusal")})
                                    
                        asyncio.create_task(revert_stun())
                        
                    await self.apply_vitals_update(session_id, saved_payload)
                    await self.check_step_advancement(session_id)
                    
                asyncio.create_task(restore_after_shock())
                
            # --- CAS NORMAL / SCÉNARIO ---
            else:
                is_stun = payload.pop("_is_stun", False)
                if not is_stun:
                    # Le scénario ou le formateur a pris la main, on annule la sidération automatique
                    state["current_stun_id"] = None
                    state["natural_rhythm"] = rhythm
                    
                patient["rhythmType"] = rhythm
                
                is_emergency = rhythm in auto_bpms
                was_emergency = old_rhythm in auto_bpms or old_rhythm in ["choc", "post_choc"]
                rhythm_changed = (rhythm != old_rhythm)
        
                if is_emergency and rhythm_changed:
                    payload["heartRate"] = auto_bpms[rhythm]
                elif was_emergency and rhythm_changed:
                    payload["heartRate"] = state.get("last_normal_bpm", 70)
                
                if "heartRate" in payload:
                    # Le serveur enregistre le "bon" rythme uniquement si ce n'est pas une urgence (180 BPM ne sera plus sauvegardé !)
                    if not is_emergency:
                        state["last_normal_bpm"] = payload["heartRate"]

                await self.manager.broadcast({"type": "rhythm", "rhythm": rhythm}, session_id)
                
        for k, v in payload.items():
            if k in ["heartRate", "spo2", "co2", "respiratoryRate"]:
                patient[k] = v
            elif k == "bloodPressure":
                if not v or v.get("systolic") in [None, "--", "", 0]:
                    continue 
                
                if "bloodPressure" not in patient:
                    patient["bloodPressure"] = {}
                for bp_k, bp_v in v.items():
                    patient["bloodPressure"][bp_k] = bp_v

        if session_id in self.transition_tasks:
            self.transition_tasks[session_id].cancel()
            try:
                await self.transition_tasks[session_id]
            except asyncio.CancelledError:
                pass
            del self.transition_tasks[session_id]
            
        await self.apply_vitals_update_sync_state(session_id)
                

    async def send_current_state(self, websocket: WebSocket, session_id: str, device_id: str):
        state = self.get_session_state(session_id)
        patient = state["patient_state"]
        device = self.get_device_state(session_id, device_id)

        scenario_id = state.get("scenario_id")
        scenario = self.scenarios.get(scenario_id) if scenario_id else None
        steps = scenario.get("steps", []) if scenario else []
        curr_step_idx = state.get("current_step", 0)
        curr_step = steps[curr_step_idx] if curr_step_idx < len(steps) else None

        import time
        payload = {
            "type": "sync_state",
            "global_time": time.time(),
            "patient": patient,
            "device": device,
            "scenario": {
                "scenario_id": scenario_id,
                "title": scenario.get("title") if scenario else None,
                "current_step": curr_step_idx,
                "step_description": curr_step.get("description") if curr_step else None,
                "total_steps": len(steps),
                "is_complete": state.get("is_complete", False),
                "show_hints": state.get("show_hints", False)
            } if scenario_id else None
        }
        if device_id.startswith("control") or device_id.startswith("dashboard"):
            payload["device_states"] = state.get("device_states", {})

        await websocket.send_json(payload)

class ConnectionManager:
    def __init__(self): self.active_connections: dict[str, dict[str, list[WebSocket]]] = {}

    # Helper function to annouche who is in the room
    async def broadcast_device_list(self, session_id: str):
        if session_id in self.active_connections:
            # Get all the unique device IDs currently connected to this session
            device_ids = list(self.active_connections[session_id].keys())
            await self.broadcast({
                "type": "device_list_update",
                "devices": device_ids
            }, session_id=session_id)

    async def connect(self, websocket: WebSocket, session_id: str, device_id: str):
        await websocket.accept()
        if session_id not in self.active_connections: self.active_connections[session_id] = {}
        if device_id == "remote" and "remote" in self.active_connections[session_id]:
            for old_ws in self.active_connections[session_id]["remote"]:
                try: await old_ws.close(code=1000)
                except: pass
            self.active_connections[session_id]["remote"] = []
        if device_id not in self.active_connections[session_id]: self.active_connections[session_id][device_id] = []
        self.active_connections[session_id][device_id].append(websocket)

        # Tell everyone a new device joined
        await self.broadcast_device_list(session_id)

    # Made this async so we can broadcast inside it
    async def disconnect(self, websocket: WebSocket, session_id: str, device_id: str):
        if session_id in self.active_connections:
            if device_id in self.active_connections[session_id]:
                if websocket in self.active_connections[session_id][device_id]:
                    self.active_connections[session_id][device_id].remove(websocket)
                    if not self.active_connections[session_id][device_id]: del self.active_connections[session_id][device_id]
            if not self.active_connections[session_id]: del self.active_connections[session_id]

            # Tell everyone a device left
            await self.broadcast_device_list(session_id)

    async def broadcast(self, message: dict, session_id: str = None, target_device: str = None):
        final_target = target_device or message.get("target_device")
        if session_id and session_id in self.active_connections:
            if final_target:
                # Direct prefix matching under the definitive naming scheme
                for dev_id, connections in self.active_connections[session_id].items():
                    if dev_id == final_target or dev_id.startswith(final_target + "_"):
                        for conn in connections:
                            try: await conn.send_json(message)
                            except: pass
            else:
                for device_list in list(self.active_connections[session_id].values()):
                    for conn in device_list:
                        try: await conn.send_json(message)
                        except: pass
        elif not session_id:
            for s_id in list(self.active_connections.keys()):
                for device_list in self.active_connections[s_id].values():
                    for conn in device_list:
                        try: await conn.send_json(message)
                        except: pass

manager = ConnectionManager()
scenario_engine = ScenarioManager(manager)

# ---HARDWARE (RAW BINARY) CONNECTION MANAGER---
class HardwareConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections.setdefault(session_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, session_id: str):
        conns = self.active_connections.get(session_id)
        if conns and websocket in conns:
            conns.remove(websocket)
            if not conns:
                del self.active_connections[session_id]

    async def broadcast_bytes(self, session_id: str, data: bytes, sender: WebSocket):
        conns = self.active_connections.get(session_id)
        if not conns:
            return
        for conn in conns:
            if conn is sender:
                continue
            try:
                await conn.send_bytes(data)
            except Exception:
                pass

hardware_manager = HardwareConnectionManager()

async def time_sync_loop():
    import time
    while True:
        try:
            await asyncio.sleep(1.0)
            sessions = list(manager.active_connections.keys())
            if sessions:
                current_time = time.time()
                for session_id in sessions:
                    await manager.broadcast({
                        "type": "time_sync",
                        "global_time": current_time
                    }, session_id)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in time sync loop: {e}")
            await asyncio.sleep(1.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    sync_task = asyncio.create_task(time_sync_loop())
    try:
        yield
    finally:
        sync_task.cancel()
        try:
            await sync_task
        except asyncio.CancelledError:
            pass

app = FastAPI(title="Système médical avec télécommande", lifespan=lifespan)

@app.websocket("/sessionId")
async def websocket_endpoint(websocket: WebSocket):
    query_params = websocket.query_params
    session_id = query_params.get("username", "anonymous")
    device_id = query_params.get("deviceId", "unknown")
    
    parts = device_id.split("_")
    device_prefix = parts[0]
    device_suffix = parts[1] if len(parts) > 1 else device_id
    
    if device_prefix == "control":
        existing_controls = [
            d for d in manager.active_connections.get(session_id, {}).keys()
            if d.startswith("control") and d != device_id
        ]
        if existing_controls:
            await websocket.accept()
            await websocket.send_json({
                "type": "connection_rejected",
                "reason": "control_panel_already_active",
                "message": "Un panneau de contrôle est déjà actif pour cette session."
            })
            await asyncio.sleep(0.1)
            await websocket.close(code=4001)
            return

    elif device_prefix == "scope" and device_suffix != "CONTR":
        existing_scopes = [
            d for d in manager.active_connections.get(session_id, {}).keys()
  
            if d.startswith("scope") and not d.endswith("CONTR") and d != device_id
        ]
        if existing_scopes:
            await websocket.accept()
            await websocket.send_json({
                "type": "connection_rejected",
                "reason": "scope_already_active",
                "message": "Un scope est déjà actif pour cette session."
            })
            await asyncio.sleep(0.1)
            await websocket.close(code=4001)
            return
    

    await manager.connect(websocket, session_id, device_id)
    # Sync newly connected device with the current authoritative session state
    await scenario_engine.send_current_state(websocket, session_id, device_id)
    try:
        while True:
            client_data = await websocket.receive_text()
            try:
                data = json.loads(client_data)
                data["session_id"] = session_id
                data["source_device"] = device_id
                msg_type = data.get("type")
                action = data.get("action")
                target = data.get("target_device")

                if msg_type == "request_sync":
                    await scenario_engine.send_current_state(websocket, session_id, device_id)
                    continue
                
                if msg_type == "scenario":
                    if action == "start": await scenario_engine.start_scenario(session_id, data.get("scenario_id"))
                    elif action == "stop": await scenario_engine.stop_scenario(session_id)
                    elif action == "toggle_hints": await scenario_engine.toggle_hints(session_id, data.get("show_hints", False))
                    elif action == "step_validated":
                        await scenario_engine.update_device_state(session_id, device_id, {"lastEvent": "stepValidated"})
                        await manager.broadcast(data, session_id)

                
                if msg_type == "defibrillator_action":
                    normalized_event = action
                    if action == "shock_delivered": normalized_event = "shockDelivered"
                    elif action == "start_charge": normalized_event = "chargeStarted"
                    updates = {"lastEvent": normalized_event}
                    if action == "shock_delivered":
                        dev_state = scenario_engine.get_device_state(session_id, device_id)
                        current_shocks = dev_state.get("shockCount", 0)
                        updates["shockCount"] = current_shocks + 1
                    
                    if action == "set_energy": updates["manualEnergy"] = data.get("energy")
                    if action == "set_display_mode": 
                        mode_val = data.get("display_mode") or data.get("displayMode") or data.get("mode")
                        if mode_val:
                            updates["displayMode"] = mode_val
                            if str(mode_val).upper() in ["DAE", "STIMULATEUR", "MANUEL", "ARRET"]:
                                updates["lastEvent"] = str(mode_val).upper()
                    if action == "toggle_pacing": updates["isPacing"] = data.get("is_pacing")
                    if action == "set_pacer_frequency": updates["pacerFrequency"] = data.get("frequency")
                    if action == "set_pacer_intensity": updates["pacerIntensity"] = data.get("intensity")
                    if action == "set_pacer_mode":
                        mode = data.get("mode")
                        updates["pacerMode"] = mode
                        updates["isSynchro"] = (mode == "Sentinelle")
                    if action == "toggle_synchro": updates["isSynchro"] = data.get("is_synchro_mode")
                    if action == "toggle_fc": updates["hrDotted"] = not data.get("show_fc", False)
                    if action == "toggle_vitals":
                        show_vitals = data.get("show_vitals", False)
                        updates["pressureDotted"] = not show_vitals
                        updates["co2Dotted"] = not show_vitals
                    
                    if action == "start_pni":
                        target_for_pni = data.get("target_device") or data.get("source_device")
                        asyncio.create_task(scenario_engine.run_pni_cycle(session_id, target_device=target_for_pni))
                    await scenario_engine.update_device_state(session_id, device_id, updates)

                if target: 
                    await manager.broadcast(data, session_id, target_device=target)
                    if device_id.startswith("control") and not target.endswith("_CONTR"):
                        try:
                            await websocket.send_json(data)
                        except:
                            pass
                    
                    # --- AJOUT : Sauvegarde de l'état individuel ciblé côté serveur ---
                    if msg_type == "visibility_state":
                        updates = {}
                        for key in ["hrDotted", "pressureDotted", "co2Dotted", "bpDotted", 
                                "defibHrDotted", "defibPressureDotted", "defibCo2Dotted", "defibBpDotted",
                                "isRemoteControl", "isDefibRemoteControl"]:
                            if key in data:
                                updates[key] = data[key]
                        if updates:
                            await scenario_engine.update_device_state(session_id, target, updates)

                elif msg_type in ["ecg", "spo2", "co2", "pressure", "respiration", "rhythm", "HRscope", "Prscope", "COscope", "defibrillator_action", "visibility_state", "display_mode", "live_hardware"] or action in ["shock_delivered"]:
                    if msg_type == "ecg": 
                        updates = {"heartRate": data.get("bpm")}
                        if "rhythm" in data:
                            updates["rhythmType"] = data["rhythm"]
                        await scenario_engine.update_patient_state(session_id, updates)
                    elif msg_type == "rhythm": 
                        await scenario_engine.update_patient_state(session_id, {"rhythmType": data.get("rhythm")})
                    elif msg_type == "spo2": await scenario_engine.update_patient_state(session_id, {"spo2": data.get("spo2")})
                    elif msg_type == "co2": await scenario_engine.update_patient_state(session_id, {"co2": data.get("co2")})
                    elif msg_type == "pressure": await scenario_engine.update_patient_state(session_id, {"bloodPressure": {"systolic": data.get("systolic"), "diastolic": data.get("diastolic")}})
                    elif msg_type == "respiration": await scenario_engine.update_patient_state(session_id, {"respiratoryRate": data.get("respirationRate")})
                    elif msg_type in ["HRscope", "Prscope", "COscope"]:
                        updates = {}
                        is_defib = data.get("dataType") == "defib"
                        if msg_type == "HRscope":
                            updates = {"defibHrDotted": data.get("isDefibHRDotted")} if is_defib else {"hrDotted": data.get("isHRDotted")}
                        elif msg_type == "Prscope":
                            updates = {"defibPressureDotted": data.get("isDefibPressureDotted")} if is_defib else {"pressureDotted": data.get("isPressureDotted")}
                        elif msg_type == "COscope":
                            updates = {"defibCo2Dotted": data.get("isDefibCO2Dotted")} if is_defib else {"co2Dotted": data.get("isCO2Dotted")}
                                
                        await scenario_engine.update_device_state(session_id, device_id, updates)
                            
                    elif msg_type == "visibility_state":
                        updates = {}
                        for key in ["hrDotted", "pressureDotted", "co2Dotted", "bpDotted",
                                    "defibHrDotted", "defibPressureDotted", "defibCo2Dotted", "defibBpDotted",
                                    "isRemoteControl", "isDefibRemoteControl"]:
                            if key in data:
                                updates[key] = data[key]                    
                        if updates:
                            bp_dotted = updates.get("bpDotted")
                            defib_bp_dotted = updates.get("defibBpDotted")
                            if bp_dotted is False or defib_bp_dotted is False:
                                state = scenario_engine.get_session_state(session_id)
                                patient = state.setdefault("patient_state", {})
                                if "displayed_bp" in patient:
                                    del patient["displayed_bp"]
                                
                                updates["show_pni"] = False
                                for dev_id, dev_state in state.get("device_states", {}).items():
                                    if dev_id.startswith("scope") or dev_id.startswith("defibrillator"):
                                        dev_state["show_pni"] = False
                                        dev_state["is_pni_measuring"] = False
                                        dev_state["pni_step_value"] = None
                            await scenario_engine.update_device_state(session_id, device_id, updates)
                    elif msg_type == "display_mode":
                        updates = {}
                        if data.get("dataType") == "defib": 
                            updates = {"isDefibRemoteControl": data.get("isRemoteControl")}
                        else: 
                            updates = {"isRemoteControl": data.get("isRemoteControl")}
                        
                        if data.get("simuType") == "control_panel":
                            state = scenario_engine.get_session_state(session_id)
                            for dev_id, dev_state in state.get("device_states", {}).items():
                                if dev_id.startswith("scope") or dev_id.startswith("defib"):
                                    dev_state.update(updates)
                                
                        await scenario_engine.update_device_state(session_id, device_id, updates)

                    if msg_type not in ["ecg", "spo2","co2", "pressure", "respiration", "rhythm", "HRscope", "Prscope", "COscope", "visibility_state"]:
                        await manager.broadcast(data, session_id)
                    elif msg_type in ["HRscope", "Prscope", "COscope", "visibility_state"]:
                        # On prévient UNIQUEMENT les tablettes du formateur (control panel)
                        await manager.broadcast(data, session_id, target_device="control")
                elif msg_type == "demandlog":
                    await manager.broadcast(data, session_id)
                elif msg_type == "simu_start":
                    await manager.broadcast(data, session_id)
                elif msg_type == "bulk_reset":
                    await scenario_engine.stop_scenario(session_id)
                    vitals = data.get("vitals", {})
                    
                    reset_payload = {
                        "_reset_memory": True,  
                        "heartRate": vitals.get("bpm", 70),
                        "spo2": vitals.get("spo2", 98),
                        "co2": vitals.get("co2", 40),
                        "respiratoryRate": vitals.get("respirationRate", 15),
                        "bloodPressure": {
                            "systolic": vitals.get("systolic", 120),
                            "diastolic": vitals.get("diastolic", 80)
                        },
                        "rhythmType": vitals.get("rhythm", "sinusal")
                    }
                    await scenario_engine.apply_vitals_update(session_id, reset_payload)
                else:
                    await websocket.send_json(data)
                    # Broadcast to any connected control/remote panels
                    if not device_id.startswith("control"):
                        await manager.broadcast(data, session_id, target_device="control")
                    # Broadcast to any connected dashboards
                    if not device_id.startswith("dashboard"):
                        await manager.broadcast(data, session_id, target_device="dashboard")
            except json.JSONDecodeError: pass
    except WebSocketDisconnect:  await manager.disconnect(websocket, session_id, device_id)

@app.websocket("/ws/hardware")
async def hardware_websocket_endpoint(websocket: WebSocket):
    session_id = websocket.query_params.get("sessionId", "anonymous")
    await hardware_manager.connect(websocket, session_id)
    try:
        while True:
            data = await websocket.receive_bytes()
            if len(data) == 1 and data[0] == 0:
                continue
            await hardware_manager.broadcast_bytes(session_id, data, sender=websocket)
    except WebSocketDisconnect:
        hardware_manager.disconnect(websocket, session_id)

# --- Static Files Mounting ---
# Search for the static export directory in multiple locations (makes volume mounts and different CWDs robust)
candidate_dirs = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "out"),
    os.path.join(os.getcwd(), "frontend", "out"),
    os.path.join(os.getcwd(), "out"),
]

static_dir = None
for candidate in candidate_dirs:
    if os.path.exists(candidate) and os.path.isdir(candidate):
        static_dir = candidate
        break

if static_dir:
    print(f"INFO: Serving static frontend files from: '{static_dir}'", flush=True)
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
else:
    searched_paths = ", ".join([f"'{p}'" for p in candidate_dirs])
    print(
        f"Warning: Static export directory was not found. Searched paths: {searched_paths}.\n"
        "Please build the frontend first or check your container volume mounts.",
        flush=True
    )
