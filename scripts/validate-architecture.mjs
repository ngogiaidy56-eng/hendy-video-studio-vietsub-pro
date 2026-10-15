import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const required = [
  'apps/admin-web/src/AdminApp.tsx',
  'apps/studio-web/src/App.tsx',
  'apps/studio-web/src/components/StudioWorkspace.tsx',
  'apps/studio-web/src/components/StudioHomePage.tsx',
  'apps/studio-web/src/components/VideoPlayer.tsx',
  'apps/studio-web/src/components/SubtitleList.tsx',
  'packages/core-utils/src/index.ts',
  'packages/shared-types/src/index.ts',
  'services/api-gateway/src/server.ts',
  'services/ai-worker/src/index.ts',
  'workers/cloudflare-edge/src/index.ts',
  'database/postgres-rbac/001_initial.sql',
  'database/mongo-projects/project.schema.json',
  'integrated-pipeline/androidApp/build.gradle.kts',
  '.github/workflows/release-master.yml',
  '.github/workflows/deploy-cloudflare.yml',
  '.github/workflows/mobile-native-build.yml',
  'render.yaml'
];
const missing = required.filter(file => !existsSync(resolve(file)));
if (missing.length) {
  console.error(`Missing required architecture files:\n${missing.map(x => ` - ${x}`).join('\n')}`);
  process.exit(1);
}
const envExample = readFileSync(resolve('.env.example'), 'utf8');
if (/(GEMINI_API_KEY|TELEGRAM_BOT_TOKEN|ADMIN_API_TOKEN)=((?!change-me-in-production)[^\n]+)$/m.test(envExample)) {
  console.error('Potentially populated secret found in .env.example');
  process.exit(1);
}
console.log(`Architecture validation passed (${required.length} required paths).`);
