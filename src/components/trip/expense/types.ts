/**
 * Tipos compartilhados do módulo de despesas.
 * Arquivo separado para evitar dependências circulares entre
 * ExpensesTab ↔ ExpenseRow ↔ ExpenseSplitSection etc.
 */

export type Expense = {
  id: string;
  trip_id: string;
  paid_by: string;
  amount: number;
  currency: string;
  amount_in_base: number;
  exchange_rate: number;
  description: string;
  category: string | null;
  expense_date: string;
};

export type Share = {
  id: string;
  expense_id: string;
  member_id: string;
  share_amount: number;
};
