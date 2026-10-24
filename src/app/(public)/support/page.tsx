import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "Support" };

export default function Page() {
  const email = process.env.SUPPORT_EMAIL;
  return (
    <ProsePage title="Support">
      {email ? (
        <p>
          Questions or problems? Email <a href={`mailto:${email}`}>{email}</a>.
        </p>
      ) : (
        <p role="note">
          No support address is configured for this deployment. The operator can set the <code>SUPPORT_EMAIL</code>{" "}
          environment variable.
        </p>
      )}
      <h2>Common questions</h2>
      <ul>
        <li>Verification email missing: check spam, then try signing in to receive a fresh link.</li>
        <li>Forgot your password: use the reset link on the sign-in page; it is valid for one hour.</li>
        <li>Timer looks wrong after sleep: it recalculates from saved times when you return to the tab.</li>
      </ul>
    </ProsePage>
  );
}
