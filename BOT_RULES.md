# Bot rules

This repository may be analysed by automated agents (e.g. a Grok bot or other AI agents).

## Default permission philosophy

**READ AND ANALYSE ONLY.**

## An agent must not

- modify production data
- change repository permissions or settings
- publish deployments
- push directly to protected branches
- merge pull requests
- delete files
- request, read or expose credentials, tokens, keys or passwords
- control the heating system in any way
- create write-capable heating endpoints (POST/PUT/PATCH/DELETE, MQTT `/set` topics, Optolink writes)
- weaken `tools/check-readonly.mjs`, the CSP or `read-only-client.js`

## Without explicit human approval, an agent may

- inspect code
- inspect sanitized measurements (`data/analysis-snapshot.json`, read-only API)
- analyse history
- produce reports
- identify anomalies
- suggest improvements
- prepare non-destructive recommendations (issues or draft pull requests for human review)

## Data an agent may use

Normalized measurements, history statistics, sensor health, system events and derived
statistics, as described in `docs/AI_ANALYSIS.md`. Nothing else.

## Output format

Insights in the documented shape (`docs/DATA_FORMAT.md` → Insights). Plain text, no HTML,
no executable content. State confidence honestly.

## Escalation

If an agent detects a potentially dangerous condition (for example critical pressure loss),
it reports it to a human. It never attempts to fix it by acting on the system.
