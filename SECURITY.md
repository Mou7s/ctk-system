# Security Policy

## Reporting a Vulnerability

Please **do not** disclose security vulnerabilities in public GitHub issues, pull requests, or discussions.

If you discover a potential security issue (such as authentication bypass, SQL injection, privilege escalation, or credential exposure), please report it privately:

1. Use GitHub's **Security Advisories** ("Report a vulnerability" in the repository's **Security** tab), or contact the repository maintainers through private maintainer channels.
2. Provide as much detail as possible so the issue can be reproduced and verified quickly:
   - Affected route, file path, or component
   - Steps to reproduce or minimal proof-of-concept
   - Potential impact and suggested remediation (if available)

Maintainers will acknowledge receipt, assess severity, and coordinate a fix before public disclosure.

## Configuration & Secret Safety

This application relies on environment variables and database configuration for sensitive credentials. Follow these mandatory rules when developing, testing, or deploying:

- **Never commit real `.env` files or secrets**: `local.env`, `.env`, `.env.local`, `deploy.config.json`, certificates, and private keys (`*.pem`, `*.key`, `*.pfx`) must never be committed to version control.
- **Keep templates empty**: Only commit `local.env.example` with empty or placeholder values—never put real passwords, tokens, internal/production IP addresses, or API secrets into example files or documentation.
- **Protect all sensitive keys**, including:
  - Database passwords and connection strings (`TK_MYSQL_PASSWORD`, `NUXT_DEMO_MYSQL_PASSWORD`, `NUXT_SQLSERVER_K3_PASSWORD`, etc.)
  - Session / JWT signing secrets (`NUXT_AUTH_TOKEN_SECRET`, `NUXT_LEGACY_TOKEN_SECRET`)
  - Third-party ERP (`NUXT_K3_APP_SECRET`, `NUXT_K3_PASSWORD`) and WeCom (`NUXT_WECOM_CORP_SECRET`, `NUXT_WECOM_CORP_SECRET_CONTACTS`) credentials
  - Internal service-to-service tokens (`NUXT_JUKEBOX_SERVICE_TOKEN`)
- **Reset seed credentials before deployment**: Initialize or rotate administrator and demo account passwords immediately after importing database seed data. Do not reuse example or weak passwords in any shared or production environment.
- **Automated CI checks**: Pull requests and pushes run automated checks (`git diff --exit-code` and security pattern scans) to catch accidental leaks of private keys, internal network addresses, or credentials.
