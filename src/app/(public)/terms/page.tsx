import type { Metadata } from "next";
import { ProsePage } from "@/components/prose-page";

export const metadata: Metadata = { title: "Terms of use" };

export default function Page() {
  return (
    <ProsePage title="Terms of use" draft>
      <p>
        By creating an account you agree to use FocusFlow lawfully and not to attempt to access other people&apos;s
        data, disrupt the service, or abuse its sign-up and email features.
      </p>
      <h2>Your account</h2>
      <p>Keep your password private. You can delete your account at any time from Settings.</p>
      <h2>No guarantees</h2>
      <p>
        FocusFlow is provided as is. Timers depend on your browser and device, and notifications may not appear if the
        device has suspended the page. We make no claim that using FocusFlow will improve productivity.
      </p>
      <h2>Changes</h2>
      <p>These terms may be updated; continued use after a change means you accept it.</p>
    </ProsePage>
  );
}
