import { Capacitor, registerPlugin } from '@capacitor/core'

// Alarme nativo do gatinho (PetAlarmPlugin). Ele roda com o app fechado: o
// Android acorda o processo pelo alarme e continua baixando as barras sozinho.
const PetAlarm = registerPlugin('PetAlarm')

/**
 * Manda o estado atual das barras para o lado nativo e garante que o alarme
 * esteja agendado. Sem isso o Android não tem com o que trabalhar e a única
 * notificação possível seria a da tela com o app aberto.
 *
 * Falha aqui não é problema: o app continua funcionando normal, só não avisa
 * com ele fechado. Por isso o erro é engolido.
 */
export function sincronizaAlarmeDoGatinho(petStats) {
  if (Capacitor.getPlatform() !== 'android') return Promise.resolve()
  if (!petStats) return PetAlarm.schedule().catch(() => {})
  return PetAlarm.sync({ petstats: JSON.stringify(petStats) }).catch(() => {})
}

/** Reprograma o alarme sem mexer no estado (app abrindo). */
export function reagendaAlarmeDoGatinho() {
  if (Capacitor.getPlatform() !== 'android') return Promise.resolve()
  return PetAlarm.schedule().catch(() => {})
}

/** Desliga o alarme (quando a pessoa não quer ser perturbada). */
export function cancelaAlarmeDoGatinho() {
  if (Capacitor.getPlatform() !== 'android') return Promise.resolve()
  return PetAlarm.cancel().catch(() => {})
}