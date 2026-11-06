/** Used when a user has no email template of their own (set on the Users page). */
export const DEFAULT_EMAIL_TEMPLATE = `Dear Sir,

Please find attached our quotation {quote_no} against your enquiry {enquiry_ref}.

Kindly let us know if you need any clarification.

Best regards,
{sales_rep}
{company} · {company_phone}`;

export const TEMPLATE_FIELDS = "{quote_no} {enquiry_ref} {customer} {sales_rep} {company} {company_phone} {total}";
