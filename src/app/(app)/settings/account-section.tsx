import { DeleteAccountForm, PasswordForm, ProfileForm } from "@/components/settings/account-forms";

export function AccountSection({ name, email }: { name: string; email: string }) {
  return (
    <>
      <ProfileForm name={name} email={email} />
      <PasswordForm />
      <DeleteAccountForm />
    </>
  );
}
