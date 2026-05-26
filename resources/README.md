# Optional reference resources

These repositories are useful during the hackathon for reading Wrangler / Workers / Baseten docs offline. They are **not** required to build or deploy the starter Worker.

The starter only needs npm dependencies (`wrangler`, `hono`, `openai`) — see the root `package.json`.

## Clone locally

From the repo root:

```bash
./scripts/fetch-resources.sh
```

Or manually:

```bash
git clone --depth 1 https://github.com/cloudflare/workers-sdk.git workers-sdk
git clone --depth 1 https://github.com/basetenlabs/baseten-cli.git baseten-cli
git clone --depth 1 https://github.com/basetenlabs/baseten-skills.git baseten-skills
```

Cloned directories are gitignored and will not be committed.
