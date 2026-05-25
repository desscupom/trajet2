/** Tipos compartilhados do módulo de assistente. */
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  scope?: 'personal' | 'group';
  senderName?: string | null;
  senderAvatar?: string | null;
};
