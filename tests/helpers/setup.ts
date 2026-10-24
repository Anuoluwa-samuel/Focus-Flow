import { testDatabaseUrl } from "./test-db";

// Point every code path (getDb/getEnv) at the test database before any module reads the environment.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.EMAIL_FROM ??= "FocusFlow <test@example.com>";
(process.env as Record<string, string>).NODE_ENV = "test";
