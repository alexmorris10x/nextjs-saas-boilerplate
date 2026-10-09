"use client";

import { useState, useRef } from "react";
import toast from "@/shared/toast";
import { ArrowRightIcon } from "@/shared/svgs";
import { axiosInstance, handleApiError } from "@/shared/utils/api.utils";
import { logEvent } from "@/shared/utils/analytics";
import { waitlistConfig } from "@/shared/config/waitlist";

interface ButtonLeadProps {
  extraStyle?: string;
}

// Public pre-launch signup, enabled with NEXT_PUBLIC_WAITLIST_ENABLED.
const ButtonLead = ({ extraStyle }: ButtonLeadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (isLoading || isDisabled || !waitlistConfig.enabled) return;

    setIsLoading(true);
    try {
      await axiosInstance.post("/waitlist", { email });

      toast.success("Thanks for joining the waitlist!");
      logEvent("signup_flow_submitted");

      inputRef.current?.blur();
      setEmail("");
      setIsDisabled(true);
    } catch (error) {
      // The error helper displays a toast and rejects; consume that rejection.
      await handleApiError(error).catch(() => undefined);
    } finally {
      setIsLoading(false);
    }
  };
  if (!waitlistConfig.enabled) return null;
  return (
    <form
      className={`w-full max-w-xs space-y-3 ${extraStyle ? extraStyle : ""}`}
      onSubmit={handleSubmit}
    >
      <input
        required
        aria-label="Email address"
        maxLength={254}
        disabled={isLoading || isDisabled}
        type="email"
        value={email}
        ref={inputRef}
        autoComplete="email"
        placeholder="tom@cruise.com"
        className="input input-bordered w-full placeholder:opacity-60"
        onChange={(e) => setEmail(e.target.value)}
      />

      <button
        className="btn btn-primary btn-block"
        type="submit"
        disabled={isLoading || isDisabled}
      >
        Join waitlist
        {isLoading ? (
          <span className="loading loading-spinner loading-xs"></span>
        ) : (
          <ArrowRightIcon />
        )}
      </button>
    </form>
  );
};

export default ButtonLead;
