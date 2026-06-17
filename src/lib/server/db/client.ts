import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "$lib/server/env";
import * as schema from "$lib/server/db/schema";

const buildSafeDatabaseUrl =
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const sql = neon(env.databaseUrl ?? buildSafeDatabaseUrl);

export const db = drizzle(sql, { schema });

export const isDatabaseConfigured = (): boolean => Boolean(env.databaseUrl);
