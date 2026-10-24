/**
 * Development seed: one verified demo account with tasks and a few weeks of sessions, so every page has data.
 * Refuses to run in production or against a non-local database. Usage: pnpm db:seed
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";

config({ path: ".env.local", quiet: true });

const EMAIL = "demo@focusflow.test";
const PASSWORD = "demo-password-123";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env.local)");
  if (process.env.NODE_ENV === "production" || !/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error("Refusing to seed: this script only runs against a local development database.");
  }
  const pool = new Pool({ connectionString: url });
  const q = (text: string, params: unknown[] = []) => pool.query(text, params);

  await q('delete from "user" where email = $1', [EMAIL]); // cascades to everything the demo user owns
  const id = randomUUID().replaceAll("-", "");
  await q('insert into "user" (id, name, email, email_verified) values ($1, $2, $3, true)', [id, "Demo User", EMAIL]);
  await q(
    "insert into account (id, account_id, provider_id, user_id, password) values ($1, $2, 'credential', $2, $3)",
    [randomUUID().replaceAll("-", ""), id, await hashPassword(PASSWORD)],
  );
  await q("insert into user_preferences (user_id, daily_goal_minutes) values ($1, 100)", [id]);

  const tasks = [
    ["Draft project proposal", "high"],
    ["Review pull requests", "medium"],
    ["Read chapter 4", "low"],
  ];
  const taskIds: string[] = [];
  for (const [title, priority] of tasks) {
    const r = await q("insert into task (user_id, title, priority) values ($1, $2, $3::task_priority) returning id", [
      id,
      title,
      priority,
    ]);
    taskIds.push(r.rows[0].id);
  }

  // ~3 weeks of history; a few days skipped so streaks are interesting; some unfinished sessions
  for (let day = 0; day < 21; day++) {
    if ([4, 9, 10].includes(day)) continue;
    const perDay = 1 + ((day * 7) % 4);
    for (let n = 0; n < perDay; n++) {
      const status = (day + n) % 9 === 0 ? "cancelled" : "completed";
      const task = n % 2 === 0 ? taskIds[(day + n) % taskIds.length] : null;
      await q(
        `insert into focus_session (user_id, task_id, type, status, started_at, planned_seconds, accumulated_seconds, actual_seconds, ended_at)
         values ($1, $2, 'focus', $3::session_status, now() - make_interval(days => $4, hours => $5),
                 1500, $6::int, $6::int, now() - make_interval(days => $4, hours => $5) + make_interval(secs => $6::int))`,
        [id, task, status, day, 8 + n * 2, status === "completed" ? 1500 : 420],
      );
    }
  }
  await pool.end();
  console.log(`Seeded ${EMAIL} (password: ${PASSWORD}). Development only.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
