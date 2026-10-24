import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "Privacy notice" };

export default function Page() {
  return (
    <ProsePage title="Privacy notice" draft>
      <p>This describes what FocusFlow, as built, stores and does with your data.</p>
      <h2>What we store</h2>
      <ul>
        <li>Account: your name, email address and a hash of your password (never the password itself).</li>
        <li>
          Your content: tasks, focus and break sessions (type, start and end times, durations, linked task) and your
          preferences.
        </li>
        <li>
          Sign-in sessions: a session token, its expiry, and the IP address and browser user-agent recorded by the
          authentication library.
        </li>
      </ul>
      <h2>Cookies</h2>
      <p>
        One essential, HttpOnly cookie keeps you signed in. We do not use advertising or analytics cookies. Your browser
        may remember small interface choices locally.
      </p>
      <h2>Email</h2>
      <p>
        We send email only to verify your address, reset your password and confirm account deletion, through an email
        delivery provider.
      </p>
      <h2>Your controls</h2>
      <ul>
        <li>Delete individual sessions from History and tasks from Tasks.</li>
        <li>
          Delete your whole account from Settings. This removes your account, tasks, sessions and preferences. Backups
          held by the hosting provider may persist for a limited period.
        </li>
      </ul>
      <h2>Sharing</h2>
      <p>
        We do not sell your data. It is processed by the hosting, database and email providers needed to run the
        service.
      </p>
    </ProsePage>
  );
}
