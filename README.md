# Cloudflare D1 Backup

This script creates an backup/export of a Cloudflare D1 SQLite database. It uses
the
[D1 HTTP API](https://developers.cloudflare.com/api/operations/cloudflare-d1-query-database)
to query for table definitions and data, then outputs SQL commands to recreate
the database as-is.

This script has only been tested on small databases (~700KB). Please report any bugs
using [GitHub Issues](https://github.com/Cretezy/cloudflare-d1-backup/issues).

Based on
[nora-soderlund/cloudflare-d1-backups](https://github.com/nora-soderlund/cloudflare-d1-backups),
which requires to be ran inside a Worker. This repository uses the
[D1 HTTP API](https://developers.cloudflare.com/api/operations/cloudflare-d1-query-database).

## Usage

To create a backup, you must obtain:

- Your Cloudflare account ID. This can be found as the ID in the URL on the
  dashboard after `dash.cloudflare.com/`, or in the sidebar of a zone.
- Your Cloudflare D1 database ID. This can be found on the D1 page.
- Your Cloudflare API key. This can be created under the user icon in the
  top-right under "My Profile", then "API Tokens" in the sidebar. Make sure to
  have D1 write access (the script does not write to your database).

### CLI

This will create the backup at `backup.sql`.

```bash
CLOUDFLARE_D1_ACCOUNT_ID=... CLOUDFLARE_D1_DATABASE_ID=... CLOUDFLARE_D1_API_KEY=... \
npx @cretezy/cloudflare-d1-backup backup.sql
```

The CLI also supports reading from `.env`.

### Library

```bash
npm i @cretezy/cloudflare-d1-backup
```

```ts
import { createBackup } from "@cretezy/cloudflare-d1-backup";

const backup = await createBackup({
  accountId: "...",
  databaseId: "...",
  apiKey: "...",
});
```

`backup` will be the string of the backup commands.

## Restoring a backup

```bash
npx wrangler d1 execute <database> --file=<backup.sql>
```

`<database>` can be the ID or name of the D1 database.
