import { chmod, mkdir, open, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertProductionDumpUrl,
  buildProductionDumpFileName,
  databaseDumpDirectoryName,
  loadRequiredEnvFile,
} from "./db-maintenance.mjs";
import { runPostgresCommand } from "./postgres-cli.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(
      "Usage: pnpm db:dump:prod\n.env.production の DATABASE_URL から .db-dumps/ に保存します。",
    );
    return;
  }
  if (args.length) throw new Error("Usage: pnpm db:dump:prod");
  const env = loadRequiredEnvFile(".env.production");
  const databaseUrl = assertProductionDumpUrl(env.DATABASE_URL);
  const directory = resolve(databaseDumpDirectoryName);
  const outputPath = resolve(
    directory,
    buildProductionDumpFileName(new Date()),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  // 既存ファイルと衝突した場合は削除しないため、作成成功後だけcleanupの対象にする。
  const file = await open(outputPath, "wx", 0o600);
  try {
    await file.close();
    await runPostgresCommand(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--file",
        outputPath,
      ],
      { databaseUrl },
    );
    await chmod(outputPath, 0o600);
    await runPostgresCommand("pg_restore", ["--list", outputPath], {
      quietStdout: true,
    });
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }
  console.log(`本番DBのdumpを保存しました: ${outputPath}`);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "dumpに失敗しました。",
  );
  process.exitCode = 1;
});
