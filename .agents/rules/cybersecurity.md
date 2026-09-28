# Project Cybersecurity & Secure Coding Rule

## Core Directive: 100% Security Assurance
Every piece of code, infrastructure configuration, script, and architecture proposed or implemented in this repository must adhere to strict defensive cybersecurity standards.

### 1. Secret & Credential Protection
- **Zero Hardcoded Secrets**: Never commit or embed plain-text API keys, JWT secrets, passwords, connection strings, private certificates, or encryption keys in code.
- Always use environment variables (`.env`, secret managers, KMS) and supply `.env.example` templates with placeholder values.
- Automatically verify and warn before outputting or logging sensitive data.

### 2. Injection & Input Sanitization
- **SQL / NoSQL Injection**: Always enforce parameterized queries, prepared statements, or typed ORM query builders. Never concatenate user input directly into query strings.
- **XSS Prevention**: Sanitize and encode user inputs before rendering into HTML/DOM. Enforce Content Security Policy (CSP).
- **Command & Path Traversal Injection**: Never execute raw shell commands with unsanitized user inputs. Validate file paths against strict allowlists and resolve directory traversal (`../`).

### 3. Authentication & Authorization
- Enforce strict identity verification, short-lived tokens, secure HTTP-only cookies (`SameSite=Strict`, `Secure`), and standard hashing (Argon2id, bcrypt) for credentials.
- Implement explicit Role-Based Access Control (RBAC) or Attribute-Based Access Control (ABAC) checks on every endpoint and sensitive routine.
- Guard against BOLA/IDOR by verifying that the requesting user owns or has explicit permission to access the requested object ID.

### 4. API & Network Security
- Configure restrictive CORS policies (avoid wildcard `*` with credentials).
- Enforce rate limiting, request throttling, and payload size limits on public API endpoints.
- Apply security headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 5. Dependency & Supply Chain Security
- Avoid dependencies with known critical or high CVEs.
- Keep dependencies updated and pin versions with lockfiles.
- Follow the principle of least privilege for 3rd party packages and permissions.

### 6. Integration with Installed Cybersecurity Skills
- The complete library of 818 Anthropic Cybersecurity Skills is installed globally in `~/.gemini/config/skills/` and permanently archived at `C:/Users/rdxyz/.gemini/anthropic-cybersecurity-skills/`.
- Whenever handling security operations, threat modeling, penetration testing, vulnerability remediation, cloud hardening, compliance (NIST, CIS, OWASP), or forensic analysis, actively search and reference the corresponding domain skill under `skills/<skill-name>/SKILL.md`.
