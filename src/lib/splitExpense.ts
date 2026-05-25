/**
 * Modos de divisão de despesa.
 * - 'equal': divide igualmente entre N pessoas selecionadas
 * - 'amount': cada pessoa tem um valor fixo (em moeda original)
 * - 'percent': cada pessoa tem uma %, app calcula valor
 */
export type SplitMode = 'equal' | 'amount' | 'percent';

export type SplitInput = {
  /** Mapa profileId -> valor digitado (depende do modo) */
  values: Record<string, number>;
  /** Set de profileIds incluídos na divisão (modo 'equal') */
  selectedIds: Set<string>;
};

export type SplitResult = {
  /** Mapa profileId -> share em moeda original (não-base) */
  sharesOriginal: Record<string, number>;
  /** Soma dos shares em original; deve bater com o total */
  totalAllocated: number;
  /** Diferença pro total (positiva = falta alocar; negativa = passou) */
  remaining: number;
  /** True se a soma bate com o total (com tolerância de 1 centavo) */
  isValid: boolean;
};

const EPSILON = 0.01;

/**
 * Calcula os shares finais (em moeda original) com base no modo selecionado.
 *
 * @param amountTotal valor total da despesa (moeda original)
 * @param mode modo escolhido
 * @param input valores digitados pelo usuário
 * @param allMemberIds todos os membros da viagem (pra modo equal saber default)
 */
export function calculateShares(
  amountTotal: number,
  mode: SplitMode,
  input: SplitInput,
  allMemberIds: string[]
): SplitResult {
  const sharesOriginal: Record<string, number> = {};

  if (mode === 'equal') {
    const ids = Array.from(input.selectedIds);
    if (ids.length === 0 || amountTotal <= 0) {
      return zeroResult(amountTotal);
    }
    const equalShare = amountTotal / ids.length;
    // Distribui igualmente, mas o último absorve o resto pra evitar
    // que diferença de centavos acumule (ex: 10 / 3 = 3.333...).
    let allocated = 0;
    ids.forEach((id, idx) => {
      if (idx === ids.length - 1) {
        sharesOriginal[id] = round2(amountTotal - allocated);
      } else {
        const v = round2(equalShare);
        sharesOriginal[id] = v;
        allocated += v;
      }
    });
  } else if (mode === 'amount') {
    // Soma os valores digitados
    for (const id of allMemberIds) {
      const v = input.values[id];
      if (v !== undefined && v > 0) {
        sharesOriginal[id] = round2(v);
      }
    }
  } else if (mode === 'percent') {
    // Cada pessoa tem uma porcentagem; calcula valor
    for (const id of allMemberIds) {
      const pct = input.values[id];
      if (pct !== undefined && pct > 0) {
        sharesOriginal[id] = round2((amountTotal * pct) / 100);
      }
    }
  }

  const totalAllocated = Object.values(sharesOriginal).reduce((s, v) => s + v, 0);
  const remaining = round2(amountTotal - totalAllocated);
  const isValid = Math.abs(remaining) < EPSILON;

  return {
    sharesOriginal,
    totalAllocated: round2(totalAllocated),
    remaining,
    isValid,
  };
}

function zeroResult(amountTotal: number): SplitResult {
  return {
    sharesOriginal: {},
    totalAllocated: 0,
    remaining: amountTotal,
    isValid: false,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Soma porcentagens digitadas. Pra UI mostrar "Alocado: X% / 100%".
 */
export function sumPercentages(values: Record<string, number>): number {
  const total = Object.values(values).reduce((s, v) => s + (v || 0), 0);
  return Math.round(total * 100) / 100;
}
