# Security Policy

## Supported versions

We accept security reports for the latest code on the `main` and `staging` branches of this repository.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report privately by emailing both:

- **support@peon.sh**
- **hiren@advant.xyz**

Include:

1. A short description of the issue and its impact
2. Steps to reproduce (or a proof of concept)
3. Affected component / version / commit if known
4. Any suggested fix (optional)

We will acknowledge receipt within a few business days and follow up with next steps. Please give us reasonable time to investigate and release a fix before any public disclosure.

If GitHub private vulnerability reporting is enabled on this repository, you may also use **Security → Advisories → Report a vulnerability**.

## Secrets and credentials

- Never commit `.env`, API keys, private keys, or cloud credentials.
- Use `.env.example` as the template for local configuration.
- Seed / demo passwords (for example in Prisma seed data) are for **local development only** and must never be used in production.
- Rotate any credential that may have been exposed.

## Safe contribution defaults

- Open pull requests against **`staging`**, not `main`.
- Do not include real customer data, production hostnames with credentials, or live secrets in issues, PRs, or fixtures.
