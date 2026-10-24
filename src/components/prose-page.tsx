export function ProsePage({
  title,
  children,
  draft = false,
}: {
  title: string;
  children: React.ReactNode;
  draft?: boolean;
}) {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {draft && (
        <p role="note" className="mt-4 rounded-lg border border-border bg-accent-soft px-3 py-2 text-sm">
          Draft for the operator of this deployment: review and adapt this text (ideally with legal advice) before
          launching publicly.
        </p>
      )}
      <div className="mt-6 grid gap-4 text-[15px] leading-relaxed [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_a]:underline">
        {children}
      </div>
    </main>
  );
}
