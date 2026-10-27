# Deploying to Cloudflare (staging and live)

| Environment | Worker | D1 database | R2 bucket | Deploys when |
|---|---|---|---|---|
| Staging | `mogul-workspace-staging` | `mogul-workspace-staging-eu` | `mogul-workspace-staging-eu` | push to `staging` or any `claude/**` branch |
| Live | `mogul-workspace` | `mogul-workspace-production` | `mogul-workspace-production` | push to `main` (merged pull request) |

Staging and live never share data. Staging shows a yellow "Staging Environment" bar.

**Region:** databases and file buckets are created in Western Europe (Amsterdam, location hint `weur`), the closest
D1/R2 region to the UAE; the Worker uses Smart Placement to run next to them. A D1 or R2 location can't be changed after
creation. The first staging database and bucket (`mogul-workspace-staging`, Eastern North America) were copied to the
`-eu` ones on 27 Oct 2026 and are no longer used.

## One-time setup (≈5 minutes)

1. **Cloudflare account** — sign up / log in at dash.cloudflare.com (free plan).
2. **API token** — My Profile → API Tokens → *Create Token* → template **Edit Cloudflare Workers**.
   Add permissions: *Account · D1 · Edit*, *Account · Workers R2 Storage · Edit*. Account resources: your account.
   (After the DNS move, also *Zone · DNS · Edit* and *Zone · Workers Routes · Edit* for mogulelectromech.com.)
3. **R2** — open R2 in the dashboard once and accept the terms (it may ask for a card; usage stays $0 inside the free limits).
4. **GitHub secrets** — repo → Settings → Secrets and variables → Actions → *New repository secret*:
   - `CLOUDFLARE_API_TOKEN` — the token from step 2
   - `CLOUDFLARE_ACCOUNT_ID` — shown on the right of the Workers & Pages overview page
5. Re-run the latest **Test & deploy** workflow (Actions tab) or push any commit.

The first run creates the D1 database and R2 bucket, applies the migrations, and deploys.
The app is then at `https://mogul-workspace-staging.<your-subdomain>.workers.dev` (live: `https://mogul-workspace.<your-subdomain>.workers.dev`).

## Custom domains

| Environment | Address |
|---|---|
| Staging | https://quotes-staging.mogulelectromech.com |
| Live | https://quotes.mogulelectromech.com |

Set by the `routes` lines in `wrangler.jsonc`. mogulelectromech.com's DNS is on Cloudflare (registrar: GoDaddy,
nameservers `aaden` / `luciane.ns.cloudflare.com`), so Cloudflare creates the DNS record and certificate on deploy.
The deploy token needs *Zone · DNS · Edit* and *Zone · Workers Routes · Edit* for mogulelectromech.com.

## Manual deploy from a computer

```bash
export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...
node scripts/cf-provision.mjs staging
npm run db:migrate:staging
npm run deploy:staging
```
