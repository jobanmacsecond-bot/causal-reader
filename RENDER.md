# Run Causal on Render

The standalone hosted entry serves the complete reader and its live API without installing the optional Vinext, React, or database tooling. `render.yaml` selects the Free web-service plan, checks the source with the offline Node test suite, and starts `node hosted-server.mjs`. Nothing in this configuration creates a paid database, disk, or other service.

Connect the published GitHub repository to a Render Blueprint and review the Free plan before creating it. For a manually created Node Web Service, use:

- Build command: `node --test tests/*.test.mjs`
- Start command: `node hosted-server.mjs`
- Health check: `/healthz`
- Environment: `NODE_VERSION=24`, `NODE_ENV=production`, `SKIP_INSTALL_DEPS=true`

Render supplies `PORT` and `RENDER_EXTERNAL_URL`; the entry binds `0.0.0.0` on that port and accepts only the exact configured HTTPS hostname. Render terminates TLS before forwarding HTTP to the application. The application does not derive its origin from `Forwarded`, `X-Forwarded-Host`, or `X-Forwarded-Proto`. [Render web services](https://render.com/docs/web-services), [default environment variables](https://render.com/docs/environment-variables).

If using a custom domain, set `PUBLIC_ORIGIN=https://your-exact-domain.example`. It overrides the native Render URL, so visit that configured domain; other hostnames receive 403. Render health checks use a verified custom domain when one is present, so keep the configured domain consistent with the service's custom-domain setup. [Health checks](https://render.com/docs/health-checks).

For an explicitly configured temporary HTTPS tunnel to a local process:

```sh
HOST=127.0.0.1 PORT=8891 PUBLIC_ORIGIN=https://your-exact-tunnel-host.example node hosted-server.mjs
```

The tunnel must forward that same Host header. `server.mjs` remains the ordinary loopback-only local entry. Missing or invalid hosted origins fail startup; wildcard hosts are not accepted.

Render's Free web services sleep after 15 minutes without traffic and can take about a minute to wake. They have monthly usage limits and are intended for prototypes. In-memory news caches clear on restart or sleep; current stories recover from approved feeds, while historical references can expire. The configured URL remains the website address, but this plan does not provide an always-warm service. [Free service limits](https://render.com/docs/free).

This entry is a public read-only website. It retains source URL allowlists, bounded source retrieval and caches, request limits, same-origin API checks, and security headers. It does not add login or a distributed rate limiter. `/healthz` checks process readiness without contacting publishers; source availability is shown inside the reader.

After deployment, verify the HTTPS page, globe assets, `/healthz`, `/api/news`, an article, and its context. Also verify that a foreign Host or Origin is rejected. Only then save the verified website address as `link to the webpage.txt`; a repository or temporary preview URL does not prove a permanent deployment.
