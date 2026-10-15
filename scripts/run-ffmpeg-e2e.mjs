import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const testFile=resolve(root,'services/ai-worker/test/ffmpeg.integration.test.mjs');
const child=spawn(process.execPath,['--experimental-strip-types','--test',testFile],{cwd:root,stdio:'inherit',env:{...process.env,RUN_FFMPEG_INTEGRATION:'1'}});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',(code,signal)=>{if(signal){console.error(`FFmpeg test stopped by ${signal}`);process.exitCode=1;}else process.exitCode=code??1;});
