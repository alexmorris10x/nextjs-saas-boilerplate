"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

export default function GooglePassSignIn() {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  const begin = () => {
    setFailed(false);
    signIn("google", { callbackUrl: "/pass/redeem" }).catch(() => setFailed(true));
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin();
  }, []);
  return <main className="p-8"><p>{failed ? "Sign-in couldn't start. Please try again." : "Taking you to Google sign-in…"}</p><button className="btn btn-primary mt-4" onClick={begin}>Continue with Google</button></main>;
}
