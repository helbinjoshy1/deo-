# Deploy Skinwise on Render

The root [render.yaml](../render.yaml) deploys the complete application as one Node web service. The same server serves the built website and the product lookup API. A static-site deployment would omit the API.

## Deployment prerequisites

The application source, lockfile, and deployment files must be committed and available on the `main` branch of `https://github.com/helbinjoshy1/deo-` before Render can build them. Files that exist only in a local workspace are not deployable by this blueprint.

Deployment requires access to a Render account. If the GitHub repository is private, grant Render read access through its GitHub connection. No application API key or photo-storage credential is required. For automated deployment, store a Render API key securely in the execution environment; never put it in this repository or a chat message. An API key is not needed for the dashboard workflow below.

## Create the service

Open [Deploy to Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fhelbinjoshy1%2Fdeo-) once the files are available on GitHub, or follow these steps:

1. In the Render dashboard, choose **New → Blueprint** and connect `helbinjoshy1/deo-`.
2. Select `main` and the root `render.yaml` file.
3. Review the proposed `skinwise` web service. The blueprint requests the **Free** plan, with no database, disk, or additional paid service. It leaves the region at Render's default. Confirm the free plan in the review screen before creating the service.
4. Create the blueprint and wait for the build and health check to complete.
5. Copy the actual HTTPS URL shown on the created service. A public URL exists only after Render creates the service; this repository does not prescribe one.

The service settings are:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Node version | `24.19.0`, matching `.nvmrc` |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Instance plan | `free` |
| Region | Render's default |
| Health-check path | `/api/health` |
| Environment | `NODE_ENV=production`, `NODE_VERSION=24.19.0` |

Leave `PORT` to Render. The application reads the injected port and listens on `0.0.0.0`. Do not replace it with the development port.

`npm ci --include=dev` is intentional: TypeScript and Vite are needed to build, and `tsx` is needed by the production start command. Keep those installed dependencies available at runtime. The build uses the committed lockfile without modifying dependency declarations or the lockfile. It uses no cloud-workspace cache or absolute `/workspace` paths.

`npm start` sets production mode and serves `dist/` alongside `/api/*`. Its Node `--use-env-proxy` option supports the onboarding environment's proxy; it does not require a proxy on Render when proxy variables are absent.

If creating a web service manually instead of using a blueprint, use the same repository, branch, commands, environment variables, plan, and health-check path from the table.

## Verify the deployed service

Open the assigned URL and confirm that the website loads, profile choices work, an ingredient list produces a review, and product search either returns labeled catalog results or explains that the catalog is unavailable. Test the responsive page on a phone-sized screen.

Set `SKINWISE_URL` to the exact HTTPS URL copied from Render, then run:

```sh
curl --fail --show-error "$SKINWISE_URL/api/health"
curl --fail --show-error --get --data-urlencode 'q=CeraVe' "$SKINWISE_URL/api/products"
```

The health response must be:

```json
{"status":"ok","productSource":"Open Beauty Facts","photoUploads":false}
```

Health checks confirm that the server responds; they do not establish access to the external product catalog. Product lookup must be tested on the deployed host even though catalog requests worked in the onboarding machine. The API requests only `https://world.openbeautyfacts.org`; supplied product links are parsed as text and never fetched. Results can be incomplete or outdated, and no matches are a valid response. A `503` lookup response explains how to continue by pasting the packaging's ingredients; it must not be presented as a successful live lookup.

The photo preview is processed in the browser and does not upload photos. It is not a skin diagnosis or a claim of clinically validated accuracy. A smoke test should confirm that this explanation remains visible in the deployed experience.

## Operating the free service

Free instances can sleep after being idle, so the first visit can take longer while the service wakes. A free service is appropriate for an initial demonstration; do not promise uninterrupted availability or instant first loads. Use Render's build and service logs to investigate failures without adding personal input or image data to logs.

To update the site, commit the intended source changes to the connected branch and deploy that commit through Render. Keep the build command and lockfile-based installation. If the service reaches a free-plan account limit, resolve it within the free-plan settings rather than switching to a paid instance automatically.

## Automated deployment from this cloud environment

The [Render helper](render.mjs) uses Render's official REST schema. Inspect its non-secret payload with:

```sh
node deploy/render.mjs --plan
```

The cloud configuration includes a secure `RENDER_API_TOKEN` requirement for `api.render.com`. Enter a Render API key in environment settings. Do not paste it into chat, commit it, or add it to application environment variables on the hosted service.

After the code is available on GitHub and the credential is injected:

```sh
node --use-env-proxy deploy/render.mjs --publish
```

The helper requests only a free Node web service. It discovers the authenticated workspace instead of inventing an ID; if several workspaces are available, set `RENDER_OWNER_ID` to a verified workspace ID. It stops on an existing `skinwise` service, saves a non-secret creation receipt, resumes polling from that receipt, and does not retry an uncertain creation request. It prints a website address only when Render returns it and the deployed page and health response validate. Browser workflows and live lookup must also be checked on that public host.

The default receipt is `/workspace/scratch/skinwise-render-deployment.json`; `SKINWISE_DEPLOY_RECEIPT` may point elsewhere. Credentials and signed upload URLs are never stored in the receipt. Syntax and the offline payload have been checked; live provider execution remains blocked until Render access is supplied.

## LinkedIn video and post

The demonstration video and draft post are separate delivery files outside this source checkout. The post must include the actual verified Render URL. A deployment launcher URL is not a public application URL.

LinkedIn publishing requires an authenticated connection to the user's profile. No such connection is available in this task. An authorized API integration would also need member OAuth with `w_member_social`, a verified member identity, a current API version, and the provider's verified video-upload protocol. No account identity, upload protocol, or authorization is inferred from a GitHub credential. No LinkedIn upload or post has been performed.

When posting manually, upload the MP4 as a video on the intended profile, paste the draft, replace its pending-link marker with the verified public website URL, and review the final post. Do not publish the draft with its placeholder link.

## Configuration references

The core blueprint fields were checked against Render's official [Express web-service example](https://github.com/render-examples/express-hello-world/blob/main/render.yaml). Render's documentation pages returned HTTP `403` from the onboarding environment, so current provider-side blueprint validation remains a check for the Render review screen.

- [Blueprint specification](https://render.com/docs/blueprint-spec)
- [Node version selection](https://render.com/docs/node-version)
- [Web-service ports](https://render.com/docs/web-services#port-binding)
- [Health checks](https://render.com/docs/health-checks)
- [Free instances](https://render.com/docs/free)
- [Render API keys](https://render.com/docs/api#creating-an-api-key)
