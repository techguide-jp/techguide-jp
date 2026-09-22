import { spawn } from "node:child_process";

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ databaseUrl?: string, quietStdout?: boolean }} options
 * @returns {Promise<void>}
 */
export function runPostgresCommand(command, args, options = {}) {
  // PGHOSTADDRやPGSERVICEなど、シェル側の設定による接続先の上書きを防ぐ。
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("PG")),
  );
  const commandArgs = [...args];
  if (options.databaseUrl) {
    const url = new URL(options.databaseUrl);
    env.PGPASSWORD = decodeURIComponent(url.password);
    url.password = "";
    commandArgs.unshift("--no-password", "--dbname", url.toString());
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, commandArgs, {
      env,
      stdio: ["ignore", options.quietStdout ? "ignore" : "inherit", "inherit"],
    });
    child.once("error", () => {
      rejectPromise(
        new Error(
          `${command} を起動できません。PostgreSQL CLIのインストールとPATHを確認してください。`,
        ),
      );
    });
    child.once("close", (code, signal) => {
      if (code === 0) resolvePromise();
      else
        rejectPromise(
          new Error(
            `${command} が失敗しました (${signal ?? code ?? "unknown"})。`,
          ),
        );
    });
  });
}
