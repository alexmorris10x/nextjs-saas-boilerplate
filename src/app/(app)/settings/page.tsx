"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { hasSessionPaidAccess } from "@/shared/utils/paid-access.mjs";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  return (
    <div className="min-h-screen bg-base-200">
      {/* Header */}
      <header className="navbar bg-base-100 border-b border-base-200">
        <div className="flex-1">
          <Link href="/dashboard" className="btn btn-ghost text-xl font-bold">
            Your App
          </Link>
        </div>
        <div className="flex-none gap-2">
          <Link href="/settings" className="btn btn-ghost btn-active">
            Settings
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="btn btn-ghost"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Settings</h1>

          {/* Profile Section */}
          <div className="card bg-base-100 shadow-xl mb-6">
            <div className="card-body">
              <h2 className="card-title">Profile</h2>
              <div className="divider mt-0"></div>
              <div className="flex items-center gap-4 mb-4">
                <div className="avatar">
                  <div className="w-16 rounded-full">
                    {session?.user?.image ? (
                      <img src={session.user.image} alt="avatar" />
                    ) : (
                      <div className="bg-primary text-primary-content flex items-center justify-center w-full h-full text-2xl font-bold">
                        {session?.user?.name?.[0] || session?.user?.email?.[0] || "?"}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <p className="font-semibold">{session?.user?.name || "No name set"}</p>
                  <p className="text-base-content/70">{session?.user?.email}</p>
                </div>
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Display Name</span>
                </label>
                <input
                  type="text"
                  placeholder="Your name"
                  className="input input-bordered"
                  defaultValue={session?.user?.name || ""}
                />
              </div>
            </div>
          </div>

          {/* Appearance Section */}
          <div className="card bg-base-100 shadow-xl mb-6">
            <div className="card-body">
              <h2 className="card-title">Appearance</h2>
              <div className="divider mt-0"></div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Theme</span>
                </label>
                <select
                  className="select select-bordered"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as "light" | "dark")}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          </div>

          {/* Subscription Section */}
          <div className="card bg-base-100 shadow-xl mb-6">
            <div className="card-body">
              <h2 className="card-title">Subscription</h2>
              <div className="divider mt-0"></div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Current Plan</p>
                  <p className="text-base-content/70">{hasSessionPaidAccess(session?.user) ? "Full access" : "Free tier"}</p>
                </div>
                {!hasSessionPaidAccess(session?.user) && (
                  <Link href="/pricing" className="btn btn-primary">Upgrade</Link>
                )}
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="card bg-base-100 shadow-xl border border-error/20">
            <div className="card-body">
              <h2 className="card-title text-error">Danger Zone</h2>
              <div className="divider mt-0"></div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Delete Account</p>
                  <p className="text-base-content/70">
                    Permanently delete your account and all associated data.
                  </p>
                </div>
                <button className="btn btn-error btn-outline">
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
