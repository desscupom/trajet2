// Lista de moedas suportadas. Cobre as 40+ moedas mais usadas em viagens internacionais.
// `country` é o código ISO 3166-1 alpha-2 (lowercase) usado pela Flag pra renderizar emoji.
export const CURRENCIES = [
  // Brasil
  { code: 'BRL', symbol: 'R$', name: 'Real', country: 'br' },
  // Américas
  { code: 'USD', symbol: 'US$', name: 'Dólar americano', country: 'us' },
  { code: 'CAD', symbol: 'C$', name: 'Dólar canadense', country: 'ca' },
  { code: 'MXN', symbol: 'Mex$', name: 'Peso mexicano', country: 'mx' },
  { code: 'ARS', symbol: 'AR$', name: 'Peso argentino', country: 'ar' },
  { code: 'CLP', symbol: 'CLP$', name: 'Peso chileno', country: 'cl' },
  { code: 'COP', symbol: 'COL$', name: 'Peso colombiano', country: 'co' },
  { code: 'PEN', symbol: 'S/', name: 'Sol peruano', country: 'pe' },
  { code: 'UYU', symbol: '$U', name: 'Peso uruguaio', country: 'uy' },
  { code: 'BOB', symbol: 'Bs', name: 'Boliviano', country: 'bo' },
  // Europa
  { code: 'EUR', symbol: '€', name: 'Euro', country: 'eu' },
  { code: 'GBP', symbol: '£', name: 'Libra esterlina', country: 'gb' },
  { code: 'CHF', symbol: 'CHF', name: 'Franco suíço', country: 'ch' },
  { code: 'NOK', symbol: 'kr', name: 'Coroa norueguesa', country: 'no' },
  { code: 'SEK', symbol: 'kr', name: 'Coroa sueca', country: 'se' },
  { code: 'DKK', symbol: 'kr', name: 'Coroa dinamarquesa', country: 'dk' },
  { code: 'ISK', symbol: 'kr', name: 'Coroa islandesa', country: 'is' },
  { code: 'PLN', symbol: 'zł', name: 'Zloti polonês', country: 'pl' },
  { code: 'CZK', symbol: 'Kč', name: 'Coroa tcheca', country: 'cz' },
  { code: 'HUF', symbol: 'Ft', name: 'Florim húngaro', country: 'hu' },
  { code: 'RON', symbol: 'lei', name: 'Leu romeno', country: 'ro' },
  { code: 'TRY', symbol: '₺', name: 'Lira turca', country: 'tr' },
  { code: 'RUB', symbol: '₽', name: 'Rublo russo', country: 'ru' },
  // Ásia / Oceania
  { code: 'JPY', symbol: '¥', name: 'Iene japonês', country: 'jp' },
  { code: 'CNY', symbol: '¥', name: 'Yuan chinês', country: 'cn' },
  { code: 'HKD', symbol: 'HK$', name: 'Dólar de Hong Kong', country: 'hk' },
  { code: 'TWD', symbol: 'NT$', name: 'Dólar de Taiwan', country: 'tw' },
  { code: 'KRW', symbol: '₩', name: 'Won sul-coreano', country: 'kr' },
  { code: 'SGD', symbol: 'S$', name: 'Dólar de Singapura', country: 'sg' },
  { code: 'MYR', symbol: 'RM', name: 'Ringgit malaio', country: 'my' },
  { code: 'THB', symbol: '฿', name: 'Baht tailandês', country: 'th' },
  { code: 'IDR', symbol: 'Rp', name: 'Rupia indonésia', country: 'id' },
  { code: 'PHP', symbol: '₱', name: 'Peso filipino', country: 'ph' },
  { code: 'VND', symbol: '₫', name: 'Dong vietnamita', country: 'vn' },
  { code: 'INR', symbol: '₹', name: 'Rupia indiana', country: 'in' },
  { code: 'AUD', symbol: 'A$', name: 'Dólar australiano', country: 'au' },
  { code: 'NZD', symbol: 'NZ$', name: 'Dólar neozelandês', country: 'nz' },
  // Oriente Médio / África
  { code: 'AED', symbol: 'AED', name: 'Dirham EAU', country: 'ae' },
  { code: 'SAR', symbol: 'SAR', name: 'Riyal saudita', country: 'sa' },
  { code: 'ILS', symbol: '₪', name: 'Shekel israelense', country: 'il' },
  { code: 'EGP', symbol: 'E£', name: 'Libra egípcia', country: 'eg' },
  { code: 'ZAR', symbol: 'R', name: 'Rand sul-africano', country: 'za' },
  { code: 'MAD', symbol: 'DH', name: 'Dirham marroquino', country: 'ma' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

// Categorias usam ícones do componente Icon (Lucide)
// O `iconName` referencia o export no @/components/Icon
export const EXPENSE_CATEGORIES = [
  { value: 'lodging', label: 'Hospedagem', iconName: 'Hotel' },
  { value: 'food', label: 'Comida', iconName: 'UtensilsCrossed' },
  { value: 'transport', label: 'Transporte', iconName: 'Car' },
  { value: 'activities', label: 'Atividades', iconName: 'Ticket' },
  { value: 'shopping', label: 'Compras', iconName: 'ShoppingBag' },
  { value: 'other', label: 'Outros', iconName: 'DollarSign' },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['value'];

// Cache em memória das taxas de câmbio do dia.
// Chave: "<from>-<to>-<date>". Valor: taxa.
// Evita refazer a request quando o usuário registra várias despesas na mesma sessão.
const rateCache = new Map<string, number>();

/**
 * Busca a taxa de câmbio entre duas moedas.
 *
 * Estratégia (2 providers gratuitos sem chave):
 * 1. **open.er-api.com** — primeira tentativa. Tem 160+ moedas, atualizada
 *    diariamente, taxa atual sempre disponível. Cobre todas nossas 44 moedas.
 * 2. **api.frankfurter.dev** — fallback. Dados do BCE, alta confiabilidade
 *    mas só ~30 moedas (não cobre BOB, COP, PEN, UYU, etc).
 *
 * Ambos retornam taxa "spot" atual — para histórico precisaríamos de provider pago.
 *
 * Se moedas forem iguais, retorna 1 sem request.
 * Em caso de falha total, retorna null (UI mostra "sem cotação").
 */
export async function fetchExchangeRate(
  from: string,
  to: string,
  _date: string // legacy — ignorado, sempre busca atual
): Promise<number | null> {
  if (from === to) return 1;

  const cacheKey = `${from}-${to}`;
  if (rateCache.has(cacheKey)) {
    return rateCache.get(cacheKey)!;
  }

  const providers = [
    // open.er-api: taxa atual, cobre 160+ moedas incluindo exóticas
    async () => {
      const url = `https://open.er-api.com/v6/latest/${from}`;
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 8000);
      try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) return null;
        const json = await r.json();
        const rate = json?.rates?.[to];
        return typeof rate === 'number' && rate > 0 ? rate : null;
      } finally {
        clearTimeout(tid);
      }
    },
    // Frankfurter: fallback, taxa atual
    async () => {
      const url = `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`;
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 8000);
      try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) return null;
        const json = await r.json();
        const rate = json?.rates?.[to];
        return typeof rate === 'number' && rate > 0 ? rate : null;
      } finally {
        clearTimeout(tid);
      }
    },
  ];

  for (const provider of providers) {
    try {
      const rate = await provider();
      if (rate !== null && rate > 0) {
        rateCache.set(cacheKey, rate);
        return rate;
      }
    } catch {
      // próximo
    }
  }

  return null;
}

export function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(amount);
  } catch {
    // Se a moeda for inválida, fallback simples
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

export function getCategoryMeta(value: string | null) {
  if (!value) return EXPENSE_CATEGORIES[5]; // "Outros"
  return EXPENSE_CATEGORIES.find((c) => c.value === value) ?? EXPENSE_CATEGORIES[5];
}

/**
 * Tenta detectar a moeda local do device baseado no locale do JS.
 *
 * Funciona via `Intl.DateTimeFormat().resolvedOptions().locale` que retorna
 * algo como "pt-BR", "en-US", "fr-FR". Pegamos a parte do país e mapeamos
 * pra moeda da nossa lista.
 *
 * Fallback: BRL (default histórico do app).
 */
export function detectLocalCurrency(): CurrencyCode {
  try {
    const locale =
      typeof Intl !== 'undefined' && Intl.DateTimeFormat
        ? Intl.DateTimeFormat().resolvedOptions().locale
        : '';

    // "pt-BR" → "BR"
    const region = locale.split('-')[1]?.toUpperCase() ?? '';

    const COUNTRY_TO_CURRENCY: Record<string, CurrencyCode> = {
      // Brasil
      BR: 'BRL',
      // Américas
      US: 'USD', CA: 'CAD', MX: 'MXN', AR: 'ARS', CL: 'CLP',
      CO: 'COP', PE: 'PEN', UY: 'UYU', BO: 'BOB',
      // Europa (zona Euro + Reino Unido + países com moeda própria)
      GB: 'GBP', UK: 'GBP',
      CH: 'CHF',
      NO: 'NOK', SE: 'SEK', DK: 'DKK', IS: 'ISK',
      PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON',
      TR: 'TRY', RU: 'RUB',
      // Zona Euro
      PT: 'EUR', ES: 'EUR', FR: 'EUR', DE: 'EUR', IT: 'EUR',
      NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', GR: 'EUR',
      FI: 'EUR', LU: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR',
      LV: 'EUR', LT: 'EUR', MT: 'EUR', CY: 'EUR', HR: 'EUR',
      // Ásia / Oceania
      JP: 'JPY', CN: 'CNY', HK: 'HKD', TW: 'TWD', KR: 'KRW',
      SG: 'SGD', MY: 'MYR', TH: 'THB', ID: 'IDR', PH: 'PHP',
      VN: 'VND', IN: 'INR',
      AU: 'AUD', NZ: 'NZD',
      // Oriente Médio / África
      AE: 'AED', SA: 'SAR', IL: 'ILS', EG: 'EGP',
      ZA: 'ZAR', MA: 'MAD',
    };

    return COUNTRY_TO_CURRENCY[region] ?? 'BRL';
  } catch {
    return 'BRL';
  }
}
