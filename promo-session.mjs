// O contador indica somente a duração da sessão no navegador.
// Não é uma data de encerramento de promoção e não interfere em preço, acesso ou pagamento.
export const SESSION_MS = 3 * 60 * 60 * 1000;
export const COOLDOWN_MS = 3 * 60 * 60 * 1000;

export function sessionPhase(startedAt, now) {
  if (!Number.isFinite(startedAt) || startedAt <= 0 || !Number.isFinite(now)) return {phase:'missing', seconds:0};
  const elapsed = Math.max(0, now - startedAt);
  if (elapsed < SESSION_MS) return {phase:'active',seconds:Math.ceil((SESSION_MS-elapsed)/1000)};
  if (elapsed < SESSION_MS + COOLDOWN_MS) return {phase:'cooldown',seconds:0};
  return {phase:'ready',seconds:0};
}
export function initialSessionStart(stored, now) {
  const previous = Number(stored);
  const phase = sessionPhase(previous, now).phase;
  // A sessão só é aberta ao visitar/recarregar a página depois do intervalo.
  return phase === 'missing' || phase === 'ready' || previous > now ? now : previous;
}
