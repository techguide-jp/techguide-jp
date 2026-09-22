import {
  assertLocalRestoreUrl,
  databaseNameFromUrl,
  loadRequiredEnvFile,
  quotePostgresIdentifier,
  quotePostgresLiteral,
  resolveAdminDatabaseUrl,
  resolveDumpFileToRestore,
} from "./db-maintenance.mjs";
import { runPostgresCommand } from "./postgres-cli.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(
      "Usage: pnpm db:restore:local -- [dump-file]\n.env のローカルDBを全置換します。ファイル省略時は .db-dumps/ 内の更新日時が最新のdumpを使用します。",
    );
    return;
  }
  if (args.length > 1 || args[0]?.startsWith("-")) {
    throw new Error("Usage: pnpm db:restore:local -- [dump-file]");
  }
  const env = loadRequiredEnvFile(".env");
  const databaseUrl = assertLocalRestoreUrl(env.DATABASE_URL);
  const databaseName = databaseNameFromUrl(databaseUrl);
  const dumpFile = resolveDumpFileToRestore(args[0]);

  // archiveとして読めないdumpでローカルDBを削除しないよう、再作成前に確認する。
  await runPostgresCommand("pg_restore", ["--list", dumpFile], {
    quietStdout: true,
  });
  console.log(`${dumpFile} からローカルDB ${databaseName} を全置換します。`);
  await runPostgresCommand(
    "psql",
    [
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${quotePostgresLiteral(databaseName)} AND pid <> pg_backend_pid();`,
      "-c",
      `DROP DATABASE IF EXISTS ${quotePostgresIdentifier(databaseName)};`,
      "-c",
      `CREATE DATABASE ${quotePostgresIdentifier(databaseName)} TEMPLATE template0;`,
    ],
    { databaseUrl: resolveAdminDatabaseUrl(databaseUrl) },
  );
  await runPostgresCommand(
    "pg_restore",
    [
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--single-transaction",
      dumpFile,
    ],
    { databaseUrl },
  );
  console.log(`ローカルDBを復元しました: ${databaseName}`);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "restoreに失敗しました。",
  );
  process.exitCode = 1;
});
