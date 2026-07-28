# Third-party notices

## nature-skills

Selenyx contains a native adaptation of selected workflow concepts from
[Yuan1z0825/nature-skills](https://github.com/Yuan1z0825/nature-skills) at
commit `ca9f57e80e8bc100eb06ebfbfff406c126e5b256`.

- License: Apache License 2.0
- Copyright: the nature-skills contributors
- Local adapter: `src/skills/nature.js`

Selenyx does not redistribute the upstream browser-login automation, Python/R
environments, demo assets, or external-service credentials. The adapter
modifies the workflows to use Selenyx's local workspace, evidence boundaries,
offline L1 algorithms, and user-configured BYOK providers. Capabilities that
need an unavailable runtime are shown as requirements rather than simulated.

The upstream Apache License 2.0 text is distributed alongside the adapter in
`src/skills/nature-license.txt`.
