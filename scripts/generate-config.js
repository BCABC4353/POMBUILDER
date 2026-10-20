
const fs = require('fs');
const path = require('path');

let clientId = process.env.AZURE_CLIENT_ID;
let tenantId = process.env.AZURE_TENANT_ID;

if (!clientId || !tenantId) {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('AZURE_CLIENT_ID=')) {
        clientId = trimmed.substring('AZURE_CLIENT_ID='.length);
      } else if (trimmed.startsWith('AZURE_TENANT_ID=')) {
        tenantId = trimmed.substring('AZURE_TENANT_ID='.length);
      }
    }
  }
}

if (!clientId || !tenantId) {
  console.error('ERROR: Missing required Azure AD configuration:');
  if (!clientId) console.error('  - AZURE_CLIENT_ID');
  if (!tenantId) console.error('  - AZURE_TENANT_ID');
  console.error('\nProvide via environment variables or .env file.');
  process.exit(1);
}

clientId = clientId.trim();
tenantId = tenantId.trim();

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isPlaceholderGuid = (g) => /^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(g) || /^([0-9a-f])\1*$/i.test(g.replace(/-/g, ''));
const bad = [];
if (!GUID_RE.test(clientId) || isPlaceholderGuid(clientId)) bad.push(`AZURE_CLIENT_ID (got "${clientId}")`);
if (!GUID_RE.test(tenantId) || isPlaceholderGuid(tenantId)) bad.push(`AZURE_TENANT_ID (got "${tenantId}")`);
if (bad.length > 0) {
  console.error('ERROR: Azure AD configuration is not a valid (non-placeholder) GUID:');
  for (const b of bad) console.error(`  - ${b}`);
  process.exit(1);
}

const authDir = path.join(__dirname, '..', 'src', 'main', 'auth');
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

const configContent = `export const AZURE_CONFIG = {
  clientId: ${JSON.stringify(clientId)},
  tenantId: ${JSON.stringify(tenantId)},
} as const;
`;

const outputPath = path.join(authDir, 'azure-config.generated.ts');
fs.writeFileSync(outputPath, configContent);
console.log('Generated Azure config at:', outputPath);

const servicesDir = path.join(__dirname, '..', 'src', 'main', 'services');
if (!fs.existsSync(servicesDir)) fs.mkdirSync(servicesDir, { recursive: true });

const flowUrl = (process.env.POM_FLOW_URL || '').trim();

const runtimeContent = `export const RUNTIME_CONFIG = {
  flowUrl: ${JSON.stringify(flowUrl)},
} as const;
`;

const runtimeOutputPath = path.join(servicesDir, 'runtime-config.generated.ts');
fs.writeFileSync(runtimeOutputPath, runtimeContent);
console.log('Generated runtime config at:', runtimeOutputPath);
