import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const API = 'https://api.render.com/v1/';
const REPOSITORY = 'https://github.com/helbinjoshy1/deo-';
const receiptPath = process.env.SKINWISE_DEPLOY_RECEIPT || '/workspace/scratch/skinwise-render-deployment.json';
const args = process.argv.slice(2);
const token = process.env.RENDER_API_TOKEN;

function servicePlan(ownerId) {
  return {
    type: 'web_service', name: 'skinwise', ownerId,
    repo: REPOSITORY, branch: 'main', autoDeploy: 'no',
    envVars: [
      { key: 'NODE_VERSION', value: '24.19.0' },
      { key: 'NODE_ENV', value: 'production' },
    ],
    serviceDetails: {
      runtime: 'node', plan: 'free', healthCheckPath: '/api/health',
      envSpecificDetails: {
        buildCommand: 'npm ci --include=dev && npm run build',
        startCommand: 'npm start',
      },
    },
  };
}

async function api(path, options = {}) {
  const response = await fetch(new URL(path, API), {
    ...options, signal: AbortSignal.timeout(30_000), redirect: 'error',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Render returned HTTP ${response.status}. Check account access and provider settings; no credentials were logged.`);
  return response.json();
}

async function saveReceipt(receipt) {
  await mkdir(resolve(receiptPath, '..'), { recursive: true });
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
}

async function main() {
  if (args.includes('--plan')) {
    console.log(JSON.stringify(servicePlan('<verified Render workspace ID>'), null, 2));
    return;
  }
  if (!args.includes('--publish')) throw new Error('Use --plan for the deployment payload, or --publish to create the explicitly requested free web service.');
  if (!token) throw new Error('RENDER_API_TOKEN is missing. Add a Render API key securely in environment settings; never send it in chat.');

  let receipt;
  try { receipt = JSON.parse(await readFile(receiptPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('The saved deployment receipt could not be read. Do not create a duplicate service.'); }

  if (!receipt) {
    const ownerRows = await api('owners?limit=100');
    if (!Array.isArray(ownerRows)) throw new Error('Unexpected Render workspace response.');
    const owners = ownerRows.map(row => row.owner).filter(owner => owner?.id);
    const requestedOwner = process.env.RENDER_OWNER_ID;
    const owner = requestedOwner ? owners.find(item => item.id === requestedOwner) : owners.length === 1 ? owners[0] : undefined;
    if (!owner) throw new Error('Specify RENDER_OWNER_ID from a verified account workspace. Multiple or unavailable workspaces prevent automatic selection.');
    const serviceRows = await api(`services?ownerId=${encodeURIComponent(owner.id)}&limit=100`);
    if (!Array.isArray(serviceRows)) throw new Error('Unexpected Render service response.');
    if (serviceRows.some(row => row.service?.name === 'skinwise')) throw new Error('A Skinwise service already exists. Review and use that service; this helper will not create a duplicate.');

    // A connection failure during creation has an uncertain outcome. Never
    // retry this POST automatically; inspect the account service list first.
    const created = await api('services', { method: 'POST', body: JSON.stringify(servicePlan(owner.id)) });
    if (!created.service?.id || !created.deployId) throw new Error('Render creation returned an incomplete response. Inspect the service list before any retry.');
    receipt = {
      serviceId: created.service.id, deployId: created.deployId,
      ownerId: owner.id, repository: REPOSITORY, plan: 'free', status: 'created',
    };
    await saveReceipt(receipt);
    console.log(`Created free Render service ${receipt.serviceId}.`);
  }

  if (receipt.repository !== REPOSITORY || receipt.plan !== 'free') throw new Error('The saved receipt does not match this repository and free deployment plan.');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const deploy = await api(`services/${encodeURIComponent(receipt.serviceId)}/deploys/${encodeURIComponent(receipt.deployId)}`);
    receipt.status = deploy.status;
    await saveReceipt(receipt);
    if (deploy.status === 'live') {
      const service = await api(`services/${encodeURIComponent(receipt.serviceId)}`);
      const publicUrl = service.serviceDetails?.url;
      if (!publicUrl || !publicUrl.startsWith('https://')) throw new Error('Render did not return an HTTPS service address.');
      const healthResponse = await fetch(new URL('/api/health', publicUrl), { signal: AbortSignal.timeout(60_000), redirect: 'error' });
      const health = await healthResponse.json();
      if (!healthResponse.ok || health.status !== 'ok' || health.productSource !== 'Open Beauty Facts' || health.photoUploads !== false) throw new Error('The deployed health response did not match Skinwise.');
      const pageResponse = await fetch(publicUrl, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
      if (!pageResponse.ok || !(await pageResponse.text()).includes('Skinwise')) throw new Error('The deployed website page did not validate.');
      receipt.publicUrl = publicUrl;
      receipt.verifiedAt = new Date().toISOString();
      await saveReceipt(receipt);
      console.log(`Verified public website: ${publicUrl}`);
      console.log('Run the browser workflows against the deployed host before posting the link.');
      return;
    }
    if (['build_failed', 'pre_deploy_failed', 'update_failed', 'canceled', 'deactivated'].includes(deploy.status)) throw new Error(`Render deployment ended with status ${deploy.status}. Inspect provider build logs.`);
    console.log(`Render deployment status: ${deploy.status}`);
    await delay(10_000);
  }
  throw new Error('Deployment is still pending. Resume with the saved receipt; do not create another service.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
