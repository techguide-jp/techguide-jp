#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const args = process.argv.slice(2);

const options = {
  envFile: ".env",
  readOnly: false,
  json: false,
};
const sqlParts = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--dotenv") {
    const value = args[index + 1];
    if (!value) {
      console.error("--dotenv requires a file path.");
      process.exit(1);
    }
    options.envFile = value;
    index += 1;
    continue;
  }
  if (arg === "--read-only") {
    options.readOnly = true;
    continue;
  }
  if (arg === "--json") {
    options.json = true;
    continue;
  }
  if (arg === "--help" || arg === "-h") {
    printUsage();
    process.exit(0);
  }
  sqlParts.push(arg);
}

const parseEnvFile = (filePath) => {
  if (!existsSync(filePath)) return {};

  const values = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    if (!key) continue;

    let value = normalized.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value.replace(/\\n/g, "\n");
  }
  return values;
};

function printUsage() {
  console.log(`Usage:
  pnpm db:query "select 1"
  pnpm db:query:prod "select count(*) from worker_profiles"

Options:
  --dotenv <path>    Load DATABASE_URL from an env file. Default: .env
  --read-only        Execute inside a read-only transaction.
  --json             Print query results as JSON.`);
}

const readStdin = () => {
  if (process.stdin.isTTY) return "";
  return readFileSync(0, "utf8").trim();
};

const envFilePath = resolve(process.cwd(), options.envFile);
const fileEnv = parseEnvFile(envFilePath);
const databaseUrl =
  fileEnv.DATABASE_URL ??
  fileEnv.PRODUCTION_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.PRODUCTION_DATABASE_URL;

const query = sqlParts.join(" ").trim() || readStdin();

if (!query) {
  printUsage();
  process.exit(1);
}

if (!databaseUrl) {
  console.error(
    `DATABASE_URL is not set. Add it to ${options.envFile} or export DATABASE_URL.`,
  );
  process.exit(1);
}

const formatDatabaseTarget = (url) => {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "unknown";
  }
};

const serialize = (value) =>
  JSON.stringify(
    value,
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );

const client = postgres(databaseUrl, {
  connect_timeout: 10,
  idle_timeout: 5,
  max: 1,
  prepare: false,
});

try {
  console.error(`Database: ${formatDatabaseTarget(databaseUrl)}`);
  console.error(`Mode: ${options.readOnly ? "read-only" : "read-write"}`);

  const result = options.readOnly
    ? await client.begin("read only", (transaction) =>
        transaction.unsafe(query),
      )
    : await client.unsafe(query);

  if (options.json) {
    console.log(serialize(result));
  } else if (Array.isArray(result)) {
    console.error(`Rows: ${result.length}`);
    if (result.length > 0) {
      console.table(result);
    }
  } else {
    console.log(serialize(result));
  }
} catch (error) {
  console.error("Query failed.");
  const message = error instanceof Error ? error.message : String(error);
  if (message) console.error(message);
  if (error && typeof error === "object" && "code" in error) {
    console.error(`Code: ${error.code}`);
  }
  if (error && typeof error === "object" && "cause" in error && error.cause) {
    console.error(
      `Cause: ${
        error.cause instanceof Error ? error.cause.message : String(error.cause)
      }`,
    );
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
