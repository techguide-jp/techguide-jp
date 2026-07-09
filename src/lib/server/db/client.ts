import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "$lib/server/env";
import * as schema from "$lib/server/db/schema";

const buildSafeDatabaseUrl =
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const databaseUrl = env.databaseUrl ?? buildSafeDatabaseUrl;

const isLocalPostgresUrl = (url: string): boolean => {
  const { hostname } = new URL(url);
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
};

export const usesLocalPostgres = isLocalPostgresUrl(databaseUrl);

export const postgresClient = usesLocalPostgres ? postgres(databaseUrl) : null;
export const neonClient = usesLocalPostgres ? null : neon(databaseUrl);

export const db = usesLocalPostgres
  ? drizzlePostgres(postgresClient as NonNullable<typeof postgresClient>, {
      schema,
    })
  : drizzleNeon(neonClient as NonNullable<typeof neonClient>, { schema });

export const isDatabaseConfigured = (): boolean => Boolean(env.databaseUrl);
