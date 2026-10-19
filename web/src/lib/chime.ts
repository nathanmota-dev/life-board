let context: AudioContext | null = null

/** A soft two-note chime for the end of a pomodoro phase, synthesized so no audio file ships. */
export function playChime() {
  if (typeof AudioContext === "undefined") return
  context ??= new AudioContext()
  void context.resume()
  const start = context.currentTime

  for (const [index, frequency] of [880, 1318.5].entries()) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const at = start + index * 0.18
    oscillator.type = "sine"
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.18, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.2)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(at)
    oscillator.stop(at + 1.25)
  }
}
