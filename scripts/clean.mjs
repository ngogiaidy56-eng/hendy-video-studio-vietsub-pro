import { rm } from 'node:fs/promises';
for (const path of ['apps/studio-web/dist','apps/admin-web/dist','coverage']) await rm(path,{recursive:true,force:true});
console.log('Cleaned generated web assets and coverage.');
