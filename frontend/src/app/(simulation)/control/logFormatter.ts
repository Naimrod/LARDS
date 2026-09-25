type AnyMsg = Record<string, any>;

// Types de messages purement techniques : jamais utiles dans le log de séance
const NOISE_TYPES = new Set(["time_sync", "device_list_update"]);

const RHYTHM_LABELS: Record<string, string> = {
  sinusRhythm: "Sinusal",
  sinus: "Sinusal",
  sinusal: "Sinusal",
  fibrillationVentriculaire: "Fibrillation Ventriculaire",
  fv: "Fibrillation Ventriculaire",
  tachycardieVentriculaire: "Tachycardie Ventriculaire",
  tv_1: "Tachycardie Ventriculaire",
  tv_2: "Tachycardie Ventriculaire",
  asystole: "Asystolie",
  asysto: "Asystolie",
  arret: "Asystolie",
  fibrillationAtriale: "Fibrillation Atriale",
  fib_a: "Fibrillation Atriale",
  bav1: "BAV I",
  "1_bav": "BAV I",
  bav3: "BAV III",
  "3_bav": "BAV III",
  electroEntrainement: "Entrainement",
  stim: "Entrainement",
  choc: "Choc électrique",
};

function rhythmLabel(code?: string): string {
  if (!code) return "inconnu";
  return RHYTHM_LABELS[code] ?? code;
}

export function fixEncoding(str?: string): string {
  if (!str) return "";
  try {
    const bytes = Uint8Array.from([...str].map((c) => c.charCodeAt(0) & 0xff));
    const fixed = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return fixed;
  } catch {
    return str;
  }
}

function fmtVitals(p: AnyMsg): string {
  const parts: string[] = [];
  if (p.heartRate !== undefined) parts.push(`FC ${p.heartRate} bpm`);
  if (p.spo2 !== undefined) parts.push(`SpO2 ${p.spo2}%`);
  if (p.co2 !== undefined) parts.push(`EtCO2 ${p.co2} mmHg`);
  if (p.bloodPressure?.systolic !== undefined) {
    parts.push(`TA ${p.bloodPressure.systolic}/${p.bloodPressure.diastolic} mmHg`);
  }
  if (p.respiratoryRate !== undefined) parts.push(`FR ${p.respiratoryRate}/min`);
  return parts.join(", ");
}

export interface LogFormatterState {
  lastEnergy?: number;
  lastRhythm?: string;
  lastVitalsLoggedAt?: number;
}

export function createLogFormatterState(): LogFormatterState {
  return {};
}

const VITALS_THROTTLE_MS = 5000;

/**
 * Renvoie une ligne de log lisible pour ce message, ou null si le message
 * ne doit pas apparaître dans le log (bruit technique, ou doublon filtré).
 */
export function describeMessage(msg: AnyMsg, state: LogFormatterState): string | null {
  if (!msg || typeof msg.type !== "string") return null;
  if (NOISE_TYPES.has(msg.type)) return null;

  switch (msg.type) {
    case "scenario": {
      if (msg.action === "start") {
        if (!msg.title) return null;
        return `▶ Scénario démarré : « ${fixEncoding(msg.title)} »`;
      }
      if (msg.action === "advance") {
        return `→ Étape ${msg.step} : ${fixEncoding(msg.step_description)}`;
      }
      if (msg.action === "complete") {
        return `✔ Scénario terminé`;
      }
      if (msg.action === "stop" || msg.action === "fail") {
        return `✖ Scénario interrompu`;
      }
      if (msg.action === "toggle_hints") {
        return `Indices ${msg.show_hints ? "activés" : "désactivés"}`;
      }
      return null;
    }

    case "defibrillator_action": {
      // "target_device" identifie l'appareil quand la commande part du
      // control panel VERS un défibrillateur (ex: set_display_mode).
      // "source_device" identifie l'appareil quand c'est le défibrillateur
      // lui-même qui émet l'événement (boot_start, set_energy, start_charge,
      // chargeCompleted, shock_delivered...) — la grande majorité des
      // actions défib réelles passent par ce second champ.
      const id = msg.target_device ?? msg.source_device;
      const shorten = id ? (id.split('_')[1] || id) : undefined;
      const label = shorten ? `Défibrillateur ${shorten}` : `Défibrillateur`;

      switch (msg.action) {
        case "boot_start":
          return `${label}: passage en mode « ${msg.target_mode} »`;
        case "set_energy":
          state.lastEnergy = msg.energy;
          return null;
        case "set_display_mode":
          return null; // redondant avec boot_start
        case "start_charge":
          return `${label}: mise en charge (${state.lastEnergy ?? "?"} J)`;
        case "chargeCompleted":
          return `${label}: charge complète (${state.lastEnergy ?? "?"} J) — prêt à choquer`;
        case "shock_delivered":
        case "deliver_shock":
          return `⚡⚡⚡ Choc délivré (${state.lastEnergy ?? "?"} J) par ${label} ⚡⚡⚡`;
        default:
          return `${label} : ${msg.action}`;
      }
    }
    case "visibility_state": {
      const changes: string[] = [];
      if (msg.hrDotted !== undefined) changes.push(msg.hrDotted ? ' 🫀🫀🫀 ECG débranché 🫀🫀🫀' : '🫀🫀🫀 ECG branché 🫀🫀🫀');
      if (msg.pressureDotted !== undefined) changes.push(msg.pressureDotted ? '🫁🫁🫁Oxymètre débranché🫁🫁🫁' : '🫁🫁🫁Oxymètre branché🫁🫁🫁');
      if (msg.co2Dotted !== undefined) changes.push(msg.co2Dotted ? '🫁🫁🫁 FRVA débranché 🫁🫁🫁' : '🫁🫁🫁 FRVA branché 🫁🫁🫁');
      if (msg.bpDotted !== undefined) changes.push(msg.bpDotted ? '💪💪💪Tension non prise💪💪💪' : '💪💪💪Tension prise💪💪💪');
      if (msg.defibHrDotted !== undefined) changes.push(msg.defibHrDotted ? '🫀🫀🫀 ECG (défib) débranché 🫀🫀🫀' : '🫀🫀🫀 ECG (défib) branché 🫀🫀🫀');
      if (msg.defibPressureDotted !== undefined) changes.push(msg.defibPressureDotted ? '🫁🫁🫁 Oxymètre (défib) débranché 🫁🫁🫁' : '🫁🫁🫁 Oxymètre (défib) branché 🫁🫁🫁');
      if (msg.defibCo2Dotted !== undefined) changes.push(msg.defibCo2Dotted ? '🫁🫁🫁 FRVA (défib) débranché 🫁🫁🫁' : '🫁🫁🫁 CO2 (défib) branché 🫁🫁🫁');
      if (msg.defibBpDotted !== undefined) changes.push(msg.defibBpDotted ? '💪💪💪 Tension (défib) non prise 💪💪💪' : '💪💪💪 Tension (défib) prise 💪💪💪');

      if (changes.length === 0) return null;
      return `Affichage : ${changes.join(", ")}`;
    }

    case "HRscope": {
      if (msg.isHRDotted !== undefined) {
        return msg.isHRDotted ? '🫀🫀🫀ECG du scope débranché🫀🫀🫀' : '🫀🫀🫀 ECG du scope branché 🫀🫀🫀';
      }
      if (msg.isDefibHRDotted !== undefined) {
        return msg.isDefibHRDotted ? '🫀🫀🫀ECG du scope (défib) débranché 🫀🫀🫀' : '🫀🫀🫀 ECG du scope (défib) branché 🫀🫀🫀';
      }
      return null;
    }

    case "Prscope": {
      if (msg.isPressureDotted !== undefined) {
        return msg.isPressureDotted ? 'Oxymètre du scope débranché' : 'Oxymètre du scope branché';
      }
      if (msg.isDefibPressureDotted !== undefined) {
        return msg.isDefibPressureDotted ? 'Oxymètre du scope (défib) débranché' : 'Oxymètre du scope (défib) branché';
      }
      return null;
    }

    case "COscope": {
      if (msg.isCO2Dotted !== undefined) {
        return msg.isCO2Dotted ? '🫁🫁🫁 Capteur FRVA du scope débranché 🫁🫁🫁' : '🫁🫁🫁 Capteur FRVA du scope branché 🫁🫁🫁';
      }
      if (msg.isDefibCO2Dotted !== undefined) {
        return msg.isDefibCO2Dotted ? '🫁🫁🫁 Capteur FRVA du scope (défib) débranché 🫁🫁🫁' : '🫁🫁🫁 Capteur FRVA du scope (défib) branché 🫁🫁🫁';
      }
      return null;
    }

    case "sync_state": {
      const p = msg.patient;
      if (!p || !p.rhythmType) return null;

      const currentRhythm = rhythmLabel(p.rhythmType);
      const rhythmChanged = state.lastRhythm !== undefined && state.lastRhythm !== currentRhythm;
      const firstEntry = state.lastRhythm === undefined;
      const now = Date.now();
      const timeElapsed = !state.lastVitalsLoggedAt || now - state.lastVitalsLoggedAt >= VITALS_THROTTLE_MS;

      // On journalise systématiquement le premier point et tout changement
      // de rythme ; sinon on limite à un point vitaux toutes les 5 secondes
      // pour ne pas noyer le log pendant les rampes de récupération simulées.
      if (!firstEntry && !rhythmChanged && !timeElapsed) {
        return null;
      }

      state.lastRhythm = currentRhythm;
      state.lastVitalsLoggedAt = now;
      if (currentRhythm !== 'Choc électrique') return `Patient : ${currentRhythm} — ${fmtVitals(p)}`;
    }

    case "flowmeter_action": {
      const label = msg.name ? `Débitmètre ${msg.name}` : "Débitmètre";
      const flowVal = msg.flow ?? 0;
      if (flowVal === 0) {
        return `💨 ${label} : coupé (0 L/min)`;
      }
      return `💨 ${label} : réglé à ${flowVal} L/min`;
    }

    case "aspi_action": {
      const label = msg.name ? `Aspiration (${msg.name})` : "Aspiration";
      if (msg.action === "toggle_power") {
        if (msg.state === "OFF") {
          return `🧪 ${label} : éteinte`;
        }
        return `🧪 ${label} : allumée (${msg.flow ?? 0} mbar)`;
      }
      if (msg.action === "set_vacuum") {
        return `🧪 ${label} : vide réglé à ${msg.flow ?? 0} mbar`;
      }
      return `🧪 ${label} : ${msg.flow ?? 0} mbar`;
    }

    // ecg / co2 / pressure / respiration / *scope / display_mode : ce sont
    // des mises à jour de capteur individuelles déjà résumées par sync_state.
    default:
      return null;
  }
}