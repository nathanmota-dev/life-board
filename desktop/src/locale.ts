import { app, ipcMain } from "electron"

// Copy for what the main process shows by itself (tray, notifications). The
// renderer reports the language picked in Settings; until then the OS locale wins.

type Language = "pt" | "en"

const en = {
  "phase.focus": "Focus",
  "phase.shortBreak": "Short break",
  "phase.longBreak": "Long break",
  "tray.running": "{{phase}} — {{time}} left",
  "tray.paused": "{{phase}} paused — {{time}} left",
  "tray.menuRunning": "{{phase}} — {{minutes}} min left",
  "tray.idle": "Pomodoro — {{time}}",
  "tray.start": "Start",
  "tray.pause": "Pause",
  "tray.resume": "Resume",
  "tray.skip": "Skip to next",
  "tray.reset": "Reset timer",
  "tray.openPomodoro": "Open Pomodoro",
  "tray.open": "Open Life Board",
  "tray.quit": "Quit",
  "notify.updateTitle": "Life Board update available",
  "notify.updateBody": "Version {{version}} is available. Open Settings → Updates to download it.",
  "notify.focusDone": "Focus session complete",
  "notify.takeBreak": "Time for a {{minutes}} min {{phase}}.",
  "notify.noBreak": "Nice work! Ready for the next one?",
  "notify.breakDone": "Break's over",
  "notify.backToFocus": "Back to focus — {{minutes}} min.",
  "notify.autoStarted": "The timer is already running.",
}

const pt: Record<keyof typeof en, string> = {
  "phase.focus": "Foco",
  "phase.shortBreak": "Pausa curta",
  "phase.longBreak": "Pausa longa",
  "tray.running": "{{phase}} — faltam {{time}}",
  "tray.paused": "{{phase}} pausado — faltam {{time}}",
  "tray.menuRunning": "{{phase}} — faltam {{minutes}} min",
  "tray.idle": "Pomodoro — {{time}}",
  "tray.start": "Iniciar",
  "tray.pause": "Pausar",
  "tray.resume": "Retomar",
  "tray.skip": "Pular para o próximo",
  "tray.reset": "Reiniciar timer",
  "tray.openPomodoro": "Abrir Pomodoro",
  "tray.open": "Abrir Life Board",
  "tray.quit": "Sair",
  "notify.updateTitle": "Atualização do Life Board disponível",
  "notify.updateBody": "A versão {{version}} está disponível. Abra Configurações → Atualizações para baixar.",
  "notify.focusDone": "Sessão de foco concluída",
  "notify.takeBreak": "Hora de uma {{phase}} de {{minutes}} min.",
  "notify.noBreak": "Bom trabalho! Pronto para a próxima?",
  "notify.breakDone": "Pausa encerrada",
  "notify.backToFocus": "Hora de voltar ao foco — {{minutes}} min.",
  "notify.autoStarted": "O timer já está rodando.",
}

export type MessageKey = keyof typeof en

let language: Language | null = null
const listeners = new Set<() => void>()

function currentLanguage(): Language {
  return language ?? (app.getLocale().startsWith("pt") ? "pt" : "en")
}

export function t(key: MessageKey, values: Record<string, string | number> = {}) {
  const template = (currentLanguage() === "pt" ? pt : en)[key]
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ""))
}

export function onLanguageChange(listener: () => void) {
  listeners.add(listener)
}

export function registerLocale() {
  ipcMain.on("app:set-language", (_event, next: unknown) => {
    if ((next !== "pt" && next !== "en") || next === language) return
    language = next
    for (const listener of listeners) listener()
  })
}
