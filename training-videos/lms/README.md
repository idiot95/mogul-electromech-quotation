# Training videos in Frappe Learning (LMS)

Videos are published into **Frappe Learning** on the ERP site. Employees open them from the
**Learning** tile on the ERP apps screen (`/desk`), signed in with their ERP account.
Start on **staging** (`erpstaging.hatimcarbon.com`), then repeat on live.

## 1. Install Frappe Learning on staging (needs shell access, about 10 minutes)

Staging runs on the Hostinger VPS `srv622598.hstgr.cloud` (62.72.58.18). Open a shell there
(hPanel → VPS → **Browser terminal**, or SSH), switch to the user that owns the bench, and run
these from the bench folder (often `~/frappe-bench`).

Back up the site first:

```bash
bench --site erpstaging.hatimcarbon.com backup --with-files
```

Get the two apps on their v16 branches (Learning needs the free Payments app):

```bash
bench get-app payments --branch version-16
```

```bash
bench get-app lms --branch version-16
```

Install them on the site and apply the database changes:

```bash
bench --site erpstaging.hatimcarbon.com install-app payments lms
```

```bash
bench --site erpstaging.hatimcarbon.com migrate
```

Restart so the new app is served (production benches run under supervisor):

```bash
bench restart
```

Check: open `https://erpstaging.hatimcarbon.com/desk` as Administrator. A **Learning** tile
should be on the apps screen, and `https://erpstaging.hatimcarbon.com/lms` should open.

If the site name differs, `bench --site all list-apps` shows the sites in that bench.

## 2. Build the course structure

```bash
node training-videos/lms/provision.js
```

That is a dry run. Then create it:

```bash
node training-videos/lms/provision.js --apply
```

It creates one course per track (9), one chapter per wave inside each, and one lesson per
video (76), titled `<code> · <title>`, with a "video coming soon" note. Running it again
changes nothing that already exists.

## 3. Publish a video

```bash
node training-videos/lms/publish.js "training-videos/out/F1 v1.0 - Find your way around the ERP.mp4"
```

It uploads the MP4 as a **private** file attached to its lesson, puts it at the top of the
lesson with the version and release date, and removes the previous version's file. Draft
renders are refused unless `--allow-draft` is passed (for staging tests).

## 4. Give employees access

- Give each employee the **LMS Student** role (User → Roles). Without an LMS role the Learning
  tile stays hidden.
- Enrol each group of new joiners in the courses for their desk (Learning → course → Students,
  or a Batch per joining month).
- **Test before live:** sign in as a test user with only LMS Student, open a lesson, and check
  the private video plays. If it doesn't, private lesson files need a permission fix before
  release; do not switch to public files, because public files can be downloaded by anyone
  with the link.

Credentials: in the cloud session the network proxy signs requests to staging. Elsewhere set
`ERP_URL` and `ERP_AUTH="token <api_key>:<api_secret>"` for a user with the LMS Course Creator
or System Manager role.
