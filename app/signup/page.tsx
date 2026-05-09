import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata = { title: "Sign up — ScholarPath" };

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </div>
  );
}
