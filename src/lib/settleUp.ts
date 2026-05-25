/**
 * Algoritmo greedy de settle up.
 *
 * Recebe os saldos por pessoa (positivo = recebe, negativo = deve)
 * e produz a menor lista possível de transferências pra zerar todos.
 *
 * Estratégia:
 * 1. Separa em devedores (saldo negativo) e credores (saldo positivo)
 * 2. Ordena ambos por valor absoluto (decrescente)
 * 3. Casa o maior devedor com o maior credor; transfere o menor dos dois
 * 4. Atualiza saldos e repete até zerar
 *
 * O número de transferências resultantes é no máximo (n - 1).
 * Não é o ótimo absoluto (problema NP-difícil), mas é muito bom na prática.
 */

export type Balance = {
  profileId: string;
  name: string;
  /** Em moeda-base. Positivo = pessoa recebe, negativo = pessoa deve. */
  net: number;
};

export type SettleTransfer = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
};

/**
 * Tolerância em centavos para considerar saldo "zerado".
 * Evita loop infinito por ruído de ponto flutuante.
 */
const EPSILON = 0.01;

export function computeSettleUp(balances: Balance[]): SettleTransfer[] {
  // Trabalha em cópias mutáveis
  const debtors = balances
    .filter((b) => b.net < -EPSILON)
    .map((b) => ({ ...b, remaining: -b.net })) // remaining = quanto ainda deve pagar
    .sort((a, b) => b.remaining - a.remaining);

  const creditors = balances
    .filter((b) => b.net > EPSILON)
    .map((b) => ({ ...b, remaining: b.net })) // remaining = quanto ainda tem a receber
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: SettleTransfer[] = [];

  let di = 0;
  let ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const debtor = debtors[di];
    const creditor = creditors[ci];

    // Transfere o menor dos dois (zera quem tem menor pendência)
    const amount = Math.min(debtor.remaining, creditor.remaining);

    transfers.push({
      fromId: debtor.profileId,
      fromName: debtor.name,
      toId: creditor.profileId,
      toName: creditor.name,
      amount: round2(amount),
    });

    debtor.remaining -= amount;
    creditor.remaining -= amount;

    // Avança o que zerou
    if (debtor.remaining < EPSILON) di++;
    if (creditor.remaining < EPSILON) ci++;
  }

  return transfers;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
