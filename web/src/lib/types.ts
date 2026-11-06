export interface Customer {
  id: number;
  name: string;
  address: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  trn: string | null;
  payment_terms: string | null;
  validity: string | null;
  delivery_terms: string | null;
  vat_terms: string | null;
  notes: string | null;
  active: number;
  quote_count?: number;
  last_quote_date?: string | null;
}

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: "admin" | "user";
  mustChange: boolean;
}

export interface AppUser {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  email_template: string | null;
  role: "admin" | "user";
  active: number;
  must_change_password: number;
  has_password: number; // 0 until an admin sets one (users made from the old Sales Reps list)
  locked_until: string | null;
  created_at: string;
}

/** A user, as picked for the Sales Rep on a quotation. */
export interface Rep {
  id: number;
  display_name: string;
  active: number;
}

export interface CompanySettings {
  name: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  trn: string;
}

export interface QuoteSettings {
  series: string;
  vatRate: number;
  currency: string;
  paymentTerms: string;
  validity: string;
  deliveryTerms: string;
  vatTerms: string;
  footerNote: string;
  showVatAmount: boolean;
  defaultUnit: string;
}

export interface Settings {
  company: CompanySettings;
  quotes: QuoteSettings;
}

export type QuoteStatus = "draft" | "printed" | "emailed" | "won" | "partly_won" | "lost" | "cancelled";

export interface Line {
  id?: number;
  pos?: number;
  kind: "item" | "heading";
  description: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  amount?: number | null;
}

export interface QuoteHeader {
  quote_date: string;
  customer_id: number | null;
  customer_name: string;
  customer_address: string | null;
  attention: string | null;
  enquiry_ref: string | null;
  sales_rep_id: number | null;
  payment_terms: string | null;
  validity: string | null;
  delivery_terms: string | null;
  vat_terms: string | null;
  vat_rate: number;
  notes: string | null;
  internal_notes: string | null;
}

export interface Quote extends QuoteHeader {
  id: number;
  base_number: string;
  rev: number;
  status: QuoteStatus;
  currency: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  superseded_by: number | null;
  sales_rep_name: string | null;
  sales_rep_email: string | null;
  sales_rep_phone: string | null;
  sales_rep_email_template: string | null;
  customer_email: string | null;
  created_at: string;
  updated_at: string;
  lines: Line[];
  emails: { id: number; to_addr: string; cc_addr: string; subject: string; method: string; sent_by: string; created_at: string }[];
  revisions: { id: number; rev: number; status: QuoteStatus; quote_date: string; total: number }[];
  orders: Order[];
  lost_reason: string | null;
  lost_note: string | null;
}

/** A customer PO recorded against a quote. */
export interface Order {
  id: number;
  po_number: string | null;
  po_date: string | null;
  note: string | null;
  subtotal: number;
  created_at: string;
  lines: OrderLine[];
  files: FileRow[];
}

export interface OrderLine {
  pos: number;
  description: string;
  unit: string | null;
  quoted_qty: number | null;
  quoted_rate: number | null;
  qty: number;
  rate: number | null;
  amount: number | null;
}

export interface QuoteListRow {
  id: number;
  base_number: string;
  rev: number;
  quote_date: string;
  status: QuoteStatus;
  customer_id: number | null;
  customer_name: string;
  enquiry_ref: string | null;
  sales_rep_name: string | null;
  subtotal: number;
  total: number;
  currency: string;
  line_count: number;
  superseded_by: number | null;
  ordered_value: number;
  lost_reason: string | null;
  created_by_name: string | null;
}

export interface FileRow {
  id: number;
  name: string;
  mime: string;
  size: number;
  created_at: string;
}
