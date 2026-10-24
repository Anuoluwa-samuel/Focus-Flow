import { DeleteAccountForm, PasswordForm, ProfileForm } from "@/components/settings/account-forms";

export function AccountSection({ name, email, hasPassword }: { name: string; email: string; hasPassword: boolean }) {
  return (
    <>
      <ProfileForm name={name} email={email} />
      {hasPassword ? (
        <PasswordForm />
      ) : (
        <section
          aria-label="Password"
          className="grid gap-2 rounded-card border border-border bg-raised p-5 shadow-card"
        >
          <h2 className="text-base font-semibold">Password</h2>
          <p className="text-sm text-muted">You sign in with Google, so there is no FocusFlow password to manage.</p>
        </section>
      )}
      <DeleteAccountForm hasPassword={hasPassword} />
    </>
  );
}
