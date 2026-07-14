# Security Policy

## Supported versions

Security fixes are applied to the latest code on `main` and, when practical, the latest tagged release.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use [GitHub private vulnerability reporting](https://github.com/alexmorris10x/nextjs-saas-boilerplate/security/advisories/new) and include reproduction steps, impact, affected versions, and any suggested mitigation.

Reports are reviewed in good faith. Response and remediation timing depend on severity, reproducibility, and maintainer availability; this project does not promise a fixed response SLA.

Confirmed vulnerabilities will be documented through a GitHub security advisory or release notes when disclosure is appropriate.

## Scope

This policy covers the boilerplate source, its default configuration, and code maintained in this repository. Vulnerabilities in Stripe, PostHog, database providers, hosting platforms, or other third-party services should also be reported to the affected provider.

Deployments created from this boilerplate are operated by their own maintainers. Keep dependencies current, use unique production secrets, validate webhook signatures, configure trusted origins and rate limits, and enable the security controls provided by the deployment platform.
