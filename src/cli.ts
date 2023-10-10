#!/usr/bin/env node

import fs from "fs";
import "dotenv/config";
import { createBackup } from "./index.js";

const path = process.argv[2];
if (!path) {
  console.error("Must supply path as first argument.");
  process.exit(1);
}

const backup = await createBackup({
  accountId: process.env.CLOUDFLARE_D1_ACCOUNT_ID!,
  databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID!,
  apiKey: process.env.CLOUDFLARE_D1_API_KEY!,
});

fs.writeFileSync(process.argv[2], backup);
