import { Button } from "./primitives/button";

export function HomeHero() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-label-t">Labpics ID</p>
      <h1 className="text-4xl font-bold tracking-tight text-label-p">
        Identity and access, owned by you.
      </h1>
      <p className="max-w-xl text-label-s">
        Placeholder landing page. OIDC, organizations, RBAC and MFA land in later chapters of the
        labpics-identity epic.
      </p>
      <div className="flex items-center gap-3">
        <Button asChild>
          <a href="/auth/login">Sign in</a>
        </Button>
        <Button variant="ghost" asChild>
          <a href="/app">App</a>
        </Button>
      </div>
    </div>
  );
}
