import type { Metadata } from "next";
import Link from "next/link";
import { getPublicPageMetadata } from "@/shared/config/public-site.mjs";

export const revalidate = 3600;

export const metadata: Metadata = getPublicPageMetadata("/pricing");

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for getting started",
    features: [
      "Core features",
      "Up to 3 projects",
      "Community support",
      "Basic analytics",
    ],
    cta: "Get Started",
    href: "/api/auth/signin",
    popular: false,
  },
  {
    name: "Pro",
    price: "$9",
    period: "/month",
    description: "For growing teams and businesses",
    features: [
      "Everything in Free",
      "Unlimited projects",
      "Priority support",
      "Advanced analytics",
      "Custom integrations",
      "Team collaboration",
    ],
    cta: "Start Free Trial",
    href: "/api/auth/signin",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations",
    features: [
      "Everything in Pro",
      "Dedicated support",
      "Custom contracts",
      "SLA guarantee",
      "SSO / SAML",
      "Audit logs",
    ],
    cta: "Contact Sales",
    href: "mailto:hello@example.com",
    popular: false,
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
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

      <main className="flex-1 py-16 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl font-extrabold tracking-tight mb-4">
              Simple, transparent pricing
            </h1>
            <p className="text-lg text-base-content/70 max-w-2xl mx-auto">
              Start free and upgrade when you need more. No hidden fees, no surprises.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`card bg-base-100 shadow-xl ${
                  plan.popular ? "border-2 border-primary" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="badge badge-primary">Most Popular</span>
                  </div>
                )}
                <div className="card-body">
                  <h2 className="card-title text-2xl">{plan.name}</h2>
                  <div className="my-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-base-content/60">{plan.period}</span>
                  </div>
                  <p className="text-base-content/70">{plan.description}</p>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <svg
                          className="w-5 h-5 text-success"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <div className="card-actions mt-8">
                    <Link
                      href={plan.href}
                      className={`btn btn-block ${
                        plan.popular ? "btn-primary" : "btn-outline"
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <div className="mt-20 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-8">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              <div className="collapse collapse-arrow bg-base-100">
                <input type="radio" name="faq" defaultChecked />
                <div className="collapse-title font-medium">
                  Can I cancel my subscription?
                </div>
                <div className="collapse-content text-base-content/70">
                  <p>Yes, you can cancel anytime. Your subscription will remain active until the end of the billing period.</p>
                </div>
              </div>
              <div className="collapse collapse-arrow bg-base-100">
                <input type="radio" name="faq" />
                <div className="collapse-title font-medium">
                  What payment methods do you accept?
                </div>
                <div className="collapse-content text-base-content/70">
                  <p>We accept all major credit cards through Stripe, including Visa, Mastercard, and American Express.</p>
                </div>
              </div>
              <div className="collapse collapse-arrow bg-base-100">
                <input type="radio" name="faq" />
                <div className="collapse-title font-medium">
                  Is there a free trial?
                </div>
                <div className="collapse-content text-base-content/70">
                  <p>Yes, Pro plans come with a 14-day free trial. No credit card required to start.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer footer-center p-10 bg-base-200 text-base-content">
        <div>
          <p className="font-bold text-lg">Your App Name</p>
          <p>Copyright &copy; {new Date().getFullYear()} - All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}
