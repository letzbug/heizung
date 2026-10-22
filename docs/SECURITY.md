# Security

## Core principles

- **READ ONLY.** No heating control — not in the UI, not in the API, not in agents.
- No credentials in frontend source.
- No private tokens, MQTT credentials, Raspberry Pi passwords, Supabase service-role keys
  or private API keys in GitHub.
- No secrets in demo JSON.
- Future secrets belong on the Pi or another secure backend (`.env`, never committed).

## How read-only is enforced

| Layer | Mechanism |
|---|---|
| UI | no input elements for heating parameters; targets are text only |
| Network | `read-only-client.js`: method hard-coded to `GET`, endpoint allowlist |
| CSP | `connect-src 'self'`, `form-action 'none'`, no inline scripts |
| API design | only GET endpoints documented (`PI_INTEGRATION.md`) |
| Tooling | `node tools/check-readonly.mjs` fails on write methods, control function names, control endpoint paths or secrets |
| CI (optional) | `.github/workflows/readonly-check.yml` runs the guard |
| Agents | `BOT_RULES.md` |

## Frontend hygiene

- Data is rendered with `textContent` only; `innerHTML` is used solely for static,
  in-repo SVG templates.
- External insight text is validated and length-limited.
- No third-party scripts, fonts or CDNs. The app works offline on the LAN.

## Secrets

- `.env` is git-ignored; `.env.example` lists names only, no values.
- If a secret is ever committed: rotate it immediately, then remove it from history.
  Deleting the file is not enough.

## Data & privacy

- Real telemetry is not committed to the repository. It is served by the Pi.
- Do not set up jobs that commit live JSON to GitHub.
- The analysis snapshot excludes location, addresses and device identifiers.

## Remote access

Prefer VPN to the home network. If the dashboard must be reachable from the internet, put an
authenticated reverse proxy in front of the Pi. Authentication happens there, not in this frontend.

## Reporting

Security issues: contact the repository owner privately; do not open public issues.
