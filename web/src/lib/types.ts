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

export interface Salesman {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  email_template: string | null;
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

export type QuoteStatus = "draft" | "printed" | "emailed" | "cancelled";

export interface Line {
  id?: number;
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
  salesman_id: number | null;
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
  salesman_name: string | null;
  salesman_email: string | null;
  salesman_phone: string | null;
  salesman_email_template: string | null;
  customer_email: string | null;
  created_at: string;
  updated_at: string;
  lines: Line[];
  emails: { id: number; to_addr: string; cc_addr: string; subject: string; method: string; sent_by: string; created_at: string }[];
  revisions: { id: number; rev: number; status: QuoteStatus; quote_date: string; total: number }[];
  workings_count: number;
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
  salesman_name: string | null;
  subtotal: number;
  total: number;
  currency: string;
  line_count: number;
  superseded_by: number | null;
}

export interface FileRow {
  id: number;
  name: string;
  mime: string;
  size: number;
  created_at: string;
}
