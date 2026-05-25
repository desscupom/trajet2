/**
 * Calcula o delay de animação pra um item numa lista, com cap.
 *
 * Pra listas de até 10 itens: cada item entra 50ms depois do anterior.
 * Pra listas grandes: cap em 400ms (depois disso entram juntos).
 *
 * Resultado: efeito cascata bonito sem fazer o usuário esperar.
 */
export function getStaggerDelay(
  index: number,
  step: number = 50,
  maxDelay: number = 400
): number {
  return Math.min(index * step, maxDelay);
}
