import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export const databaseDumpDirectoryName = ".db-dumps";
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const allowedConnectionParameters = new Set([
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "channel_binding",
  "connect_timeout",
  "application_name",
]);

/** @param {string} fileName */
export function loadRequiredEnvFile(fileName) {
  try {
    // シェルに残った別環境の接続先を採用しないため、指定ファイルだけを読む。
    return parseEnv(readFileSync(resolve(fileName), "utf8"));
  } catch {
    throw new Error(`環境変数ファイルを読み込めません: ${fileName}`);
  }
}

/** @param {string | undefined} value @param {string} name */
function validateDatabaseUrl(value, name) {
  if (!value?.trim()) throw new Error(`${name} を設定してください。`);
  let url;
  try {
    url = new URL(value.trim());
    if (
      !["postgresql:", "postgres:"].includes(url.protocol) ||
      !url.hostname ||
      url.hash ||
      !databaseNameFromUrl(url.toString()) ||
      databaseNameFromUrl(url.toString()).includes("\0")
    ) {
      throw new Error("invalid URL");
    }
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
  } catch {
    throw new Error(`${name} はDB名を含むPostgreSQL接続URLにしてください。`);
  }
  // libpqはqueryのhost・hostaddr・dbname・serviceでも接続先を変えられるため許可しない。
  for (const key of url.searchParams.keys()) {
    if (!allowedConnectionParameters.has(key)) {
      throw new Error(`${name} に許可されていない接続パラメーターがあります。`);
    }
  }
  return url;
}

/** @param {string} databaseUrl */
export function databaseNameFromUrl(databaseUrl) {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}

/** @param {string} name */
function isTestDatabaseName(name) {
  return /(?:^|[-_])test(?:$|[-_])/i.test(name);
}

/** @param {string | undefined} value */
export function assertProductionDumpUrl(value) {
  const url = validateDatabaseUrl(value, ".env.production の DATABASE_URL");
  if (localHosts.has(url.hostname.toLowerCase())) {
    throw new Error("本番dumpにはローカル以外の接続URLを指定してください。");
  }
  if (isTestDatabaseName(databaseNameFromUrl(url.toString()))) {
    throw new Error("本番dumpの対象にテストDBは指定できません。");
  }
  if (url.hostname.toLowerCase().includes("-pooler")) {
    throw new Error(
      "本番dumpにはpoolerを含まないdirect connection URLが必要です。",
    );
  }
  return url.toString();
}

/** @param {string | undefined} value */
export function assertLocalRestoreUrl(value) {
  const url = validateDatabaseUrl(value, "DATABASE_URL");
  const databaseName = databaseNameFromUrl(url.toString());
  if (!localHosts.has(url.hostname.toLowerCase())) {
    throw new Error(
      "restore先はlocalhost・127.0.0.1・[::1]だけに限定しています。",
    );
  }
  if (isTestDatabaseName(databaseName)) {
    throw new Error("restore先にテストDBは指定できません。");
  }
  if (
    ["postgres", "template0", "template1"].includes(databaseName.toLowerCase())
  ) {
    throw new Error("restore先にPostgreSQLのsystem DBは指定できません。");
  }
  return url.toString();
}

/** @param {string} databaseUrl */
export function resolveAdminDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  url.pathname = "/postgres";
  return url.toString();
}

/** @param {string} value */
export function quotePostgresIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

/** @param {string} value */
export function quotePostgresLiteral(value) {
  return `E'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

/** @param {Date} now */
export function buildProductionDumpFileName(now) {
  return `techguide-jp-prod-${now.toISOString().replace(/[:.]/g, "-")}.dump`;
}

/** @param {string | undefined} requestedPath */
export function resolveDumpFileToRestore(requestedPath) {
  let filePath = requestedPath ? resolve(requestedPath) : undefined;
  if (!filePath) {
    const directory = resolve(databaseDumpDirectoryName);
    /** @type {string[]} */
    let names;
    try {
      names = readdirSync(directory);
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT")
        throw error;
      names = [];
    }
    const candidates = names
      .filter((name) => name.endsWith(".dump"))
      .map((name) => ({
        path: resolve(directory, name),
        stats: statSync(resolve(directory, name)),
      }))
      .filter(({ stats }) => stats.isFile())
      .sort(
        (a, b) =>
          b.stats.mtimeMs - a.stats.mtimeMs || b.path.localeCompare(a.path),
      );
    filePath = candidates[0]?.path;
  }
  if (!filePath) {
    throw new Error(
      ".db-dumps/ にdumpがありません。先に pnpm db:dump:prod を実行してください。",
    );
  }
  if (!filePath.endsWith(".dump"))
    throw new Error(".dump ファイルを指定してください。");
  if (!statSync(filePath).isFile())
    throw new Error(`dumpファイルではありません: ${filePath}`);
  return filePath;
}
