import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Sign in — ScholarPath" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
