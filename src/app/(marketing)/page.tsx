import type { Metadata } from "next";
import Link from "next/link";
import { getPublicPageMetadata } from "@/shared/config/public-site.mjs";

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = getPublicPageMetadata("/");

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="navbar bg-base-100 border-b border-base-200">
        <div className="flex-1">
          <Link href="/" className="btn btn-ghost text-xl font-bold">
            Your App
          </Link>
        </div>
        <div className="flex-none gap-2">
          <Link href="/pricing" className="btn btn-ghost">
            Pricing
          </Link>
          <Link href="/api/auth/signin" className="btn btn-primary">
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-grow">
        <section className="hero min-h-[70vh] bg-base-200">
          <div className="hero-content text-center">
            <div className="max-w-2xl">
              <h1 className="text-5xl font-bold">
                Build your SaaS faster
              </h1>
              <p className="py-6 text-lg text-base-content/70">
                A production-ready Next.js boilerplate with authentication,
                Stripe billing, and everything you need to ship.
              </p>
              <div className="flex gap-4 justify-center">
                <Link href="/api/auth/signin" className="btn btn-primary btn-lg">
                  Get Started
                </Link>
                <Link href="/pricing" className="btn btn-outline btn-lg">
                  View Pricing
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">
              Everything you need to ship
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">Authentication</h3>
                  <p>NextAuth.js with Google, GitHub, and email providers configured.</p>
                </div>
              </div>
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">Stripe Billing</h3>
                  <p>Subscription management with webhooks and customer portal.</p>
                </div>
              </div>
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">Database Ready</h3>
                  <p>Prisma ORM with PostgreSQL schema for users and subscriptions.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-primary text-primary-content">
          <div className="max-w-4xl mx-auto text-center px-4">
            <h2 className="text-3xl font-bold mb-4">
              Ready to get started?
            </h2>
            <p className="text-lg mb-8 opacity-90">
              Start building your SaaS today with this production-ready boilerplate.
            </p>
            <Link href="/api/auth/signin" className="btn btn-secondary btn-lg">
              Start for Free
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer footer-center p-10 bg-base-200 text-base-content">
        <div>
          <p className="font-bold text-lg">Your App Name</p>
          <p>Copyright &copy; {new Date().getFullYear()} - All rights reserved</p>
        </div>
        <div>
          <div className="grid grid-flow-col gap-4">
            <Link href="/pricing" className="link link-hover">Pricing</Link>
            <Link href="/terms" className="link link-hover">Terms</Link>
            <Link href="/privacy" className="link link-hover">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
