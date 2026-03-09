"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [showSignIn, setShowSignIn] = useState(true);

  useEffect(() => {
    if (session?.user) {
      router.replace("/crm/dashboard");
    }
  }, [session, router]);

  if (isPending) {
    return (
      <div className="flex h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  if (session?.user) {
    return null;
  }

  return (
    <div className="flex h-svh">
      {/* Left side — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-foreground p-12">
        <div>
          <span className="text-2xl font-semibold tracking-tight text-background">
            Norrjord
          </span>
          <span className="ml-2 text-sm text-background/60">CRM</span>
        </div>
        <div className="space-y-4">
          <p className="text-3xl font-semibold leading-tight text-background">
            Discover and onboard<br />Swedish meat producers.
          </p>
          <p className="text-sm text-background/60 max-w-md">
            AI-powered discovery pipeline, CRM pipeline management, and seamless integration with the Norrjord marketplace platform.
          </p>
        </div>
        <p className="text-xs text-background/40">
          Internal tool — Norrjord team only
        </p>
      </div>

      {/* Right side — auth form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="text-2xl font-semibold tracking-tight">Norrjord</span>
            <span className="ml-2 text-sm text-muted-foreground">CRM</span>
          </div>

          {showSignIn ? (
            <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
          ) : (
            <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
          )}
        </div>
      </div>
    </div>
  );
}
