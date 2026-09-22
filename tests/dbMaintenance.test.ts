import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertLocalRestoreUrl,
  assertProductionDumpUrl,
  quotePostgresIdentifier,
  quotePostgresLiteral,
  resolveAdminDatabaseUrl,
} from "../scripts/db-maintenance.mjs";

describe("DBメンテナンスの接続先制約", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "%sへのrestoreを許可する",
    (host) => {
      const url = `postgresql://worker@${host}:5434/techguide-jp?sslmode=disable`;
      expect(assertLocalRestoreUrl(url)).toBe(url);
      expect(() => assertProductionDumpUrl(url)).toThrow("ローカル以外");
    },
  );

  it.each([
    "postgresql://worker@production.example/techguide-jp",
    "postgresql://worker@localhost/techguide-jp-test",
    "postgresql://worker@localhost/test-techguide-jp",
    "postgresql://worker@localhost/%70ostgres",
    "postgresql://worker@localhost/template0",
    "postgresql://worker@localhost/template1",
    "postgresql://worker@localhost/",
    "postgresql://worker@localhost/db%00name",
    "https://localhost/techguide-jp",
    undefined,
  ])("危険・不正なrestore先を拒否する: %s", (url) => {
    expect(() => assertLocalRestoreUrl(url)).toThrow();
  });

  it.each([
    "host",
    "hostaddr",
    "dbname",
    "service",
    "port",
    "user",
    "options",
    "password",
  ])("queryの%sによる接続の上書きを拒否する", (key) => {
    expect(() =>
      assertLocalRestoreUrl(`postgresql://localhost/techguide-jp?${key}=other`),
    ).toThrow("接続パラメーター");
    expect(() =>
      assertProductionDumpUrl(`postgresql://prod.example/db?${key}=other`),
    ).toThrow("接続パラメーター");
  });

  it("本番dumpはdirect URLのみ許可する", () => {
    const url =
      "postgresql://worker@ep-example.neon.tech/neondb?sslmode=require&channel_binding=require";
    expect(assertProductionDumpUrl(url)).toBe(url);
    expect(() =>
      assertProductionDumpUrl(
        "postgresql://worker@ep-example-pooler.neon.tech/neondb",
      ),
    ).toThrow("direct connection");
    expect(() =>
      assertProductionDumpUrl(
        "postgresql://worker@prod.example/techguide-jp-test",
      ),
    ).toThrow("テストDB");
  });

  it("DB名を安全に引用し、管理接続ではDB名だけを変更する", () => {
    expect(quotePostgresIdentifier('db"name')).toBe('"db""name"');
    expect(quotePostgresLiteral("db\\'name")).toBe("E'db\\\\''name'");
    expect(
      resolveAdminDatabaseUrl(
        "postgresql://worker@localhost:5434/app?sslmode=disable",
      ),
    ).toBe("postgresql://worker@localhost:5434/postgres?sslmode=disable");
  });
});

describe("dump・restore CLI", () => {
  let directory: string;
  let bin: string;
  const scripts = resolve("scripts");
  const localUrl =
    "postgresql://worker:fixture-secret@localhost:5434/techguide-jp";
  const prodUrl =
    "postgresql://worker:fixture-secret@prod.example/techguide-jp";

  beforeEach(() => {
    directory = realpathSync(
      mkdtempSync(join(tmpdir(), "techguide-maintenance-")),
    );
    bin = join(directory, "bin");
    mkdirSync(bin);
    const stub = join(bin, "stub.mjs");
    writeFileSync(
      stub,
      `#!${process.execPath}
import { appendFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
appendFileSync(process.env.MAINTENANCE_LOG, JSON.stringify({
  command, args, pgKeys: Object.keys(process.env).filter(k => k.startsWith("PG")),
  passwordPresent: process.env.PGPASSWORD === "fixture-secret"
}) + "\\n");
if (command === "pg_dump") writeFileSync(args[args.indexOf("--file") + 1], "fixture archive");
if (process.env.FAIL_COMMAND === command || (process.env.FAIL_LIST === "1" && args.includes("--list"))) process.exit(1);
`,
    );
    chmodSync(stub, 0o700);
    for (const name of ["pg_dump", "pg_restore", "psql"])
      symlinkSync(stub, join(bin, name));
    writeFileSync(join(directory, ".env"), `DATABASE_URL=${localUrl}\n`);
    writeFileSync(
      join(directory, ".env.production"),
      `DATABASE_URL=${prodUrl}\n`,
    );
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  function run(
    script: string,
    args: string[] = [],
    extraEnv: NodeJS.ProcessEnv = {},
  ) {
    return spawnSync(process.execPath, [join(scripts, script), ...args], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        MAINTENANCE_LOG: join(directory, "commands.jsonl"),
        DATABASE_URL: "postgresql://wrong.example/other",
        PGHOSTADDR: "203.0.113.1",
        PGSERVICE: "production",
        ...extraEnv,
      },
    });
  }

  function calls(): {
    command: string;
    args: string[];
    pgKeys: string[];
    passwordPresent: boolean;
  }[] {
    const path = join(directory, "commands.jsonl");
    return existsSync(path)
      ? readFileSync(path, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
  }

  function fixtureDump(name = "fixture.dump") {
    const path = join(directory, ".db-dumps", name);
    mkdirSync(join(directory, ".db-dumps"), { recursive: true });
    writeFileSync(path, "fixture archive");
    return path;
  }

  it("dumpを制限された権限で保存・検証し、パスワードをCLI引数に含めない", () => {
    const result = run("db-dump-prod.mjs");
    expect(result.status, result.stderr).toBe(0);
    const dumpDirectory = join(directory, ".db-dumps");
    const [name] = readdirSync(dumpDirectory);
    expect(name).toMatch(/^techguide-jp-prod-.*Z\.dump$/);
    expect(statSync(dumpDirectory).mode & 0o777).toBe(0o700);
    expect(statSync(join(dumpDirectory, name)).mode & 0o777).toBe(0o600);
    expect(calls().map(({ command }) => command)).toEqual([
      "pg_dump",
      "pg_restore",
    ]);
    expect(calls()[0].args).toContain("--format=custom");
    expect(calls()[0].args).toContain(
      "postgresql://worker@prod.example/techguide-jp",
    );
    expect(calls()[0].args.join(" ")).not.toContain("fixture-secret");
    expect(calls()[0].pgKeys).toEqual(["PGPASSWORD"]);
    expect(calls()[0].passwordPresent).toBe(true);
  });

  it.each([{ FAIL_COMMAND: "pg_dump" }, { FAIL_LIST: "1" }])(
    "dumpまたはarchive確認に失敗したファイルを残さない: %j",
    (env) => {
      const result = run("db-dump-prod.mjs", [], env);
      expect(result.status).not.toBe(0);
      expect(readdirSync(join(directory, ".db-dumps"))).toEqual([]);
    },
  );

  it(".env.productionにDATABASE_URLがなければシェルや.envを採用しない", () => {
    writeFileSync(
      join(directory, ".env.production"),
      "# DATABASE_URL is missing\n",
    );
    expect(
      run("db-dump-prod.mjs", [], {
        DATABASE_URL: prodUrl,
      }).status,
    ).not.toBe(0);
    expect(calls()).toEqual([]);
  });

  it("最新dumpを確認してからローカルDBを再作成・復元する", () => {
    const older = fixtureDump("older.dump");
    const latest = fixtureDump("latest.dump");
    utimesSync(older, 100, 100);
    utimesSync(latest, 200, 200);
    const result = run("db-restore-local.mjs");
    expect(result.status, result.stderr).toBe(0);
    expect(calls().map(({ command }) => command)).toEqual([
      "pg_restore",
      "psql",
      "pg_restore",
    ]);
    expect(calls()[0].args).toEqual(["--list", latest]);
    expect(calls()[1].args).toContain(
      "postgresql://worker@localhost:5434/postgres",
    );
    expect(calls()[1].args).toContain("-c");
    expect(calls()[1].args).toContain(
      'DROP DATABASE IF EXISTS "techguide-jp";',
    );
    expect(calls()[2].args).toContain(
      "postgresql://worker@localhost:5434/techguide-jp",
    );
    expect(calls()[2].args).toContain("--single-transaction");
    expect(calls()[2].pgKeys).toEqual(["PGPASSWORD"]);
  });

  it("--の後ろでdumpを明示できる", () => {
    fixtureDump("chosen.dump");
    fixtureDump("latest.dump");
    const result = run("db-restore-local.mjs", ["--", ".db-dumps/chosen.dump"]);
    expect(result.status, result.stderr).toBe(0);
    expect(calls()[0].args).toEqual([
      "--list",
      join(directory, ".db-dumps/chosen.dump"),
    ]);
  });

  it.each(["archive", "missing", "remote", "query-override"])(
    "%sエラーではDBを削除しない",
    (scenario) => {
      if (scenario !== "missing") fixtureDump();
      if (scenario === "remote")
        writeFileSync(join(directory, ".env"), `DATABASE_URL=${prodUrl}\n`);
      if (scenario === "query-override")
        writeFileSync(
          join(directory, ".env"),
          `DATABASE_URL=${localUrl}?hostaddr=203.0.113.1\n`,
        );
      const result = run(
        "db-restore-local.mjs",
        [],
        scenario === "archive" ? { FAIL_LIST: "1" } : {},
      );
      expect(result.status).not.toBe(0);
      expect(calls().some(({ command }) => command === "psql")).toBe(false);
    },
  );

  it("DB再作成に失敗したらrestoreに進まない", () => {
    fixtureDump();
    expect(
      run("db-restore-local.mjs", [], { FAIL_COMMAND: "psql" }).status,
    ).not.toBe(0);
    expect(calls().map(({ command }) => command)).toEqual([
      "pg_restore",
      "psql",
    ]);
  });

  it("helpは環境ファイルがなくても接続せず表示する", () => {
    rmSync(join(directory, ".env"));
    rmSync(join(directory, ".env.production"));
    for (const script of ["db-dump-prod.mjs", "db-restore-local.mjs"]) {
      expect(
        execFileSync(process.execPath, [join(scripts, script), "--help"], {
          cwd: directory,
          encoding: "utf8",
        }),
      ).toContain("Usage:");
    }
    expect(calls()).toEqual([]);
  });
});
