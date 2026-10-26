export const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "–" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money0 = (n: number | null | undefined) => (n == null ? "–" : Math.round(n).toLocaleString("en-US"));

export const qtyFmt = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("en-US", { maximumFractionDigits: 3 });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dateFmt(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

export const todayUAE = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);

export const quoteNo = (base: string, rev: number) => (rev > 0 ? `${base} REV ${String(rev).padStart(2, "0")}` : base);

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---- amount in words: "UAE Dirhams six thousand nine hundred thirty only" ----
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ONES[h] + " hundred");
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? "-" + ONES[r % 10] : ""));
  return parts.join(" ");
}

export function numberToWords(n: number): string {
  if (n === 0) return "zero";
  const scales: [number, string][] = [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
  const parts: string[] = [];
  let rest = Math.floor(n);
  for (const [v, name] of scales) {
    if (rest >= v) {
      parts.push(under1000(Math.floor(rest / v)) + " " + name);
      rest %= v;
    }
  }
  if (rest) parts.push(under1000(rest));
  return parts.join(" ");
}

export function amountInWords(total: number, currency = "AED") {
  const t = round2(total);
  const whole = Math.floor(t);
  const fils = Math.round((t - whole) * 100);
  const cur = currency === "AED" ? "UAE Dirhams" : currency;
  const sub = currency === "AED" ? "fils" : "cents";
  return `${cur} ${numberToWords(whole)}${fils ? ` and ${numberToWords(fils)} ${sub}` : ""} only`;
}
