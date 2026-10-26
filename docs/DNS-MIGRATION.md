# Moving mogulelectromech.com and hatimcarbon.com off Wix, without breaking email or websites

Status: **plan only. Nothing has been changed.** The record lists below come from a public DNS lookup on 26 Oct 2026. A public lookup can't list every record in a zone, so step 1 (export from Wix) is still required.

## Recommendation

Keep two jobs separate:

| Job | Recommendation | Why |
|---|---|---|
| **DNS hosting** (where the records live) | **Cloudflare (free)** | The quotation app runs on Cloudflare Workers. `quotes.mogulelectromech.com` only works as a Worker custom domain when the zone is on Cloudflare. DNS changes are instant, there's an API, and the ERP and future modules get the same benefits. |
| **Registrar** (who you pay for the name) | GoDaddy or Hostinger, whichever you prefer (or Cloudflare Registrar, at cost) | The registrar only holds the nameserver setting. Move it **after** DNS is stable on Cloudflare. |

Move one domain at a time. Start with **mogulelectromech.com**: it has fewer records, and the app needs it.

## What's live today (public lookup)

### mogulelectromech.com, nameservers ns8/ns9.wixdns.net
| Name | Type | Value | Used by |
|---|---|---|---|
| @ | A | 185.230.63.107, .171, .186 | **Website hosted on Wix** |
| www | CNAME | cdn3.wixdns.net | Website (Wix) |
| @ | MX 0 | mogulelectromech-com.mail.protection.outlook.com | **Email, Microsoft 365** |

Not found publicly: no SPF (`v=spf1 …`) TXT, no `autodiscover` CNAME, no DMARC. Check the Wix export. If they really are missing, add them **after** the move as a separate change. Missing SPF and DMARC push mail toward spam folders.

### hatimcarbon.com, nameservers ns8/ns9.wixdns.net
| Name | Type | Value | Used by |
|---|---|---|---|
| @ | A | 62.72.58.18 | Website (not on Wix; this IP looks like Hostinger) |
| www | A | 62.72.58.18 | Website |
| erpstaging | A | 62.72.58.18 | ERP staging (CloudPanel) |
| erp | A | 13.200.157.65 | ERP live |
| mail | A | 34.105.115.117 | unknown, check before deleting |
| @ | MX 10 | hatimcarbon-com.mail.protection.outlook.com | **Email, Microsoft 365** |
| @ | TXT | v=spf1 include:spf.protection.outlook.com -all | Email SPF |
| @ | TXT | MS=ms12850347 | Microsoft 365 domain verification |
| @ | TXT | google-site-verification=GEX2JyPn5OACsaglu-g2TzAfPiZsTtMwBXs-uxOEA20 | Google Search Console |
| autodiscover | CNAME | autodiscover.outlook.com | Outlook setup |
| enterpriseregistration | CNAME | enterpriseregistration.windows.net | Intune / Entra |
| enterpriseenrollment | CNAME | enterpriseenrollment.manage.microsoft.com | Intune |
| lyncdiscover | CNAME | webdir.online.lync.com | Teams / Skype |
| sip | CNAME | sipdir.online.lync.com | Teams / Skype |

Also look for these in the Wix export: DKIM (`selector1._domainkey`, `selector2._domainkey`), `_dmarc`, `_sip._tls` / `_sipfederationtls._tcp` SRV records, and any other subdomains.

## Decided: both domains leave Wix as registrar

Both domains will be transferred away from Wix. The risk during a transfer is DNS, not the transfer itself. Wix's nameservers (`ns8/ns9.wixdns.net`) only serve a domain Wix manages. If the domain leaves Wix while still pointing at them, email, the website and the ERP can stop resolving.

To avoid that, **move DNS first, then transfer**:

1. Build the full zone at the new DNS host: Cloudflare (recommended) or the new registrar's DNS. Start from the Wix export and the tables above.
2. In Wix, switch the domain to the new nameservers.
3. Wait 48 hours. Verify email, Teams/Intune, the website, `erp` and `erpstaging`.
4. In Wix: unlock the domain, turn off auto-renew, and request the authorization (EPP) code.
5. At GoDaddy or Hostinger, start the transfer. When asked about nameservers, choose **keep current nameservers**. Hostinger offers to switch to its own by default, so untick that.
6. Approve the transfer email. It goes to the registrant address on the domain, so make sure that mailbox works. Wix can also be asked to release the domain early.

The transfer completes in about 5–7 days. DNS is already off Wix, so nothing changes for users.

If Wix won't let you change nameservers on a Wix-registered domain:
- Do steps 4–5 with the zone fully built at the new host.
- The moment the transfer completes, set the nameservers at the new registrar.
- Expect a short window, minutes to a few hours, where some resolvers still ask Wix. Schedule it for a Friday evening (UAE weekend) and lower TTLs a day before.

Transfers are blocked within 60 days of registration, a previous transfer or a registrant-contact change. Check the expiry date as well: a transfer adds one paid year.

hatimcarbon.com's website is already off Wix (62.72.58.18), so it needs no rebuild. mogulelectromech.com's website **is** on Wix. Once Wix is gone that site needs a new home (Hostinger, or a simple page served from Cloudflare). Plan the rebuild before cancelling the Wix site plan.

## The safe sequence (per domain)

1. **Export.** In Wix go to Domains → ⋯ → Manage DNS Records. Screenshot or copy **every** record, including TXT, SRV and CNAME.
2. **Lower TTLs.** In Wix, set TTLs to the minimum the day before, so any rollback propagates fast.
3. **Build the zone on Cloudflare.** Add the site (free plan) and let it scan. Then compare it line by line against the export and add anything missing. Set mail, ERP and Microsoft records to **DNS only** (grey cloud).
4. **Website on Wix (mogulelectromech.com only).** Pick one:
   - Keep the Wix site for now. Keep the Wix A and CNAME records in Cloudflare as DNS only. Wix supports external DNS "by pointing", but check your Wix plan allows a connected domain.
   - Or rebuild the site on Hostinger first, then point A and www at Hostinger. **Wix sites can't be exported**, so this is a rebuild.
5. **Switch nameservers.** In Wix go to Domains → ⋯ → Advanced → Change nameservers → Custom, and enter the two Cloudflare nameservers.
   - Wix requires the site to be disconnected from the domain first. If Wix doesn't show this option for your domain, use step 7 (registrar transfer) instead, and set the Cloudflare nameservers at the new registrar.
6. **Verify within an hour.**
   - Send and receive email to and from an outside Gmail address.
   - Outlook on a new device finds the mailbox (autodiscover).
   - The website and the ERP load.
   - `nslookup -type=mx domain 8.8.8.8` shows the Microsoft MX.

   Rollback = put the Wix nameservers back.
7. **Transfer the registrar (optional, later).** Wait until DNS has been stable for about a week.
   - In Wix: unlock the domain and get the authorization (EPP) code.
   - At GoDaddy or Hostinger: start the transfer and **keep the Cloudflare nameservers**.
   - The transfer adds one year of registration. Email and website are not affected, because DNS stays on Cloudflare throughout.

Email is only at risk if an MX, SPF or autodiscover record is missed in step 3. That is why the comparison against the export matters.

## Access needed to carry this out

| Account | What's needed | Notes |
|---|---|---|
| Cloudflare | API token (see DEPLOY.md) + `Zone · DNS · Edit` | Lets the zones and records be created and checked automatically |
| Wix | You, in the browser | Wix has no public DNS or domain API. The export, nameserver change and transfer unlock are dashboard clicks. |
| GoDaddy | Developer API key, if eligible | GoDaddy gates its DNS/Management API by account eligibility. Otherwise it's dashboard steps. |
| Hostinger | API token (hPanel → Account → API) | Covers DNS, domains and hosting via their public API |

Never share account passwords. Use scoped API tokens that can be revoked after the move.
