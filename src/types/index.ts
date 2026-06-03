// Mirrors domain.FraudEvent from Fluxa's Go backend
export interface FraudEvent {
  flag_id: string;
  event_id: string;
  correlation_id: string;
  user_id: string;
  amount: number;
  currency: string;
  merchant: string;
  rule_name: "amount_threshold" | "velocity" | "blocked_merchant" | "high_risk_currency" | "ml_risk" | string;
  rule_value: string;
  ml_score: number; // blended ML fraud probability [0,1] (0 when scorer unavailable)
  flagged_at: string; // ISO-8601
}

// BankOps transaction (subset of fields used in the console).
// BankOps omits currency/merchant on transactions; it sends description + category.
export interface Transaction {
  id: number;
  accountId?: number;
  amount: number;
  currency?: string;
  merchant?: string;
  description?: string;
  category?: string;
  mlScore?: number;
  status: "PENDING" | "COMPLETED" | "HELD" | "RELEASED" | "REJECTED";
  type: "DEPOSIT" | "WITHDRAWAL";
  createdAt: string;
  correlationId?: string;
}

// BankOps support case
export interface SupportCase {
  id: number;
  accountId: number;
  // BankOps sends `summary`; `title` is reserved for any future titled cases.
  title?: string | null;
  summary?: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "NEW";
  priority: "P1" | "P2" | "P3";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  slaDueAt: string | null;
  createdAt: string;
}
