// Mirrors domain.FraudEvent from Fluxa's Go backend
export interface FraudEvent {
  flag_id: string;
  event_id: string;
  correlation_id: string;
  user_id: string;
  amount: number;
  currency: string;
  merchant: string;
  rule_name: "amount_threshold" | "velocity" | "blocked_merchant" | "high_risk_currency" | string;
  rule_value: string;
  flagged_at: string; // ISO-8601
}

// BankOps transaction (subset of fields used in the console)
export interface Transaction {
  id: number;
  amount: number;
  currency: string;
  merchant: string;
  status: "PENDING" | "COMPLETED" | "HELD" | "RELEASED" | "REJECTED";
  type: "DEPOSIT" | "WITHDRAWAL";
  createdAt: string;
  correlationId?: string;
}

// BankOps support case
export interface SupportCase {
  id: number;
  accountId: number;
  title: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "P1" | "P2" | "P3";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  slaDueAt: string | null;
  createdAt: string;
}
