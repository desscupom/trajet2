/**
 * Validação de senha client-side.
 *
 * Não substitui o "leaked password protection" do Supabase (Pro plan), mas pega
 * 80% dos casos: senhas curtas, sem letra+número, ou de listas comuns.
 *
 * Estratégia:
 * - Mínimo 8 caracteres
 * - Pelo menos 1 letra E 1 número
 * - Bloqueia uma blocklist de senhas comuns
 *
 * Retorna mensagem de erro pronta pra exibir, ou null se OK.
 */

/**
 * Lista mínima de senhas absurdamente comuns que rejeitamos diretamente.
 * Não é um banco do HIBP — é só um filtro de "óbvio demais".
 */
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'qwerty123',
  'qwertyui',
  'abc12345',
  'admin123',
  'letmein1',
  'iloveyou',
  '11111111',
  '00000000',
  'trajet',
  'trajet123',
  'trajet2024',
  'trajet2025',
  'trajet2026',
]);

export type PasswordValidation = {
  ok: boolean;
  /** Mensagem amigável de erro pra exibir. null se ok. */
  error: string | null;
  /** 0–4: nível de força pra mostrar barra colorida. */
  strength: 0 | 1 | 2 | 3 | 4;
};

export function validatePassword(password: string): PasswordValidation {
  if (!password) {
    return { ok: false, error: 'Digite uma senha.', strength: 0 };
  }

  if (password.length < 8) {
    return {
      ok: false,
      error: 'Senha precisa ter ao menos 8 caracteres.',
      strength: 0,
    };
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /\d/.test(password);

  if (!hasLetter || !hasDigit) {
    return {
      ok: false,
      error: 'Senha precisa ter ao menos uma letra e um número.',
      strength: 1,
    };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return {
      ok: false,
      error: 'Essa senha é comum demais. Escolha outra.',
      strength: 1,
    };
  }

  // Calcula força (0-4) pra UI
  let strength: 0 | 1 | 2 | 3 | 4 = 2; // base: 8+ com letra+número
  if (password.length >= 12) strength = 3;
  if (password.length >= 12 && /[^a-zA-Z0-9]/.test(password)) strength = 4;

  return { ok: true, error: null, strength };
}

/**
 * Confere se duas senhas batem.
 * Retorna mensagem de erro ou null.
 */
export function checkPasswordsMatch(
  password: string,
  confirm: string,
): string | null {
  if (password !== confirm) {
    return 'As senhas não conferem.';
  }
  return null;
}

/**
 * Label e cor pra cada nível de força (pra usar na UI).
 */
export function strengthMeta(level: 0 | 1 | 2 | 3 | 4): {
  label: string;
  color: string;
} {
  switch (level) {
    case 0:
      return { label: 'Muito fraca', color: '#ef4444' };
    case 1:
      return { label: 'Fraca', color: '#f59e0b' };
    case 2:
      return { label: 'OK', color: '#eab308' };
    case 3:
      return { label: 'Boa', color: '#10b981' };
    case 4:
      return { label: 'Forte', color: '#14b8a6' };
  }
}
