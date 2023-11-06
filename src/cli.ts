#!/usr/bin/env node

import fs from "fs";
import "dotenv/config";
import { createBackup } from "./index.js";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  options: {
    limit: {
      type: "string",
      short: "l",
      default: "1000",
    },
  },
  allowPositionals: true,
});

const path = positionals[0];
if (!path) {
  console.error("Must supply path as first argument.");
  process.exit(1);
}

const limit = parseInt(values.limit ?? "");
if (Number.isNaN(limit)) {
  console.error("Limit must be a number.");
  process.exit(1);
}
if (limit <= 0) {
  console.error("Limit must be higher than 0.");
  process.exit(1);
}

const backup = await createBackup({
  accountId: process.env.CLOUDFLARE_D1_ACCOUNT_ID!,
  databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID!,
  apiKey: process.env.CLOUDFLARE_D1_API_KEY!,
  limit,
});

fs.writeFileSync(path, backup);
