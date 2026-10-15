import dotenv from 'dotenv';
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, rm, access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '@hendy/logger';
import { getPostgresPool } from '@hendy/database';
import { hasPartialObjectStorageConfig, isObjectStorageConfigured, putMediaObject, restoreMediaObject } from '@hendy/storage';
import type { RenderManifest } from '@hendy/shared-types';
import { buildAss, buildRenderPlan, safeAssetName, type ResolvedClip } from './renderPlan.js';

const execFileAsync=promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: resolve(root, '.env') });
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) { logger.error('REDIS_URL is required for the separate worker process'); process.exit(1); }
const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null, connectTimeout: 8000 });
const uploadConfig = process.env.UPLOAD_DIR ?? 'storage/uploads';
const outputConfig = process.env.OUTPUT_DIR ?? 'storage/outputs';
const uploadDir = isAbsolute(uploadConfig) ? resolve(uploadConfig) : resolve(root, uploadConfig);
const outputDir = isAbsolute(outputConfig) ? resolve(outputConfig) : resolve(root, outputConfig);
await mkdir(outputDir, { recursive: true });
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe';
const timeoutMs=Math.max(60_000,Number(process.env.RENDER_TIMEOUT_MS??21600000));
const db=process.env.DATABASE_URL?getPostgresPool(process.env.DATABASE_URL):undefined;
if(process.env.NODE_ENV==='production'&&hasPartialObjectStorageConfig()) throw new Error('R2 storage configuration is incomplete; configure the full R2 credential set or remove all R2 variables.');

async function hasAudioStream(filePath:string) {
  if(['.png','.jpg','.jpeg','.webp','.gif','.bmp'].includes(extname(filePath).toLowerCase())) return false;
  try {
    const result=await execFileAsync(ffprobe,['-v','error','-select_streams','a:0','-show_entries','stream=codec_type','-of','default=noprint_wrappers=1:nokey=1',filePath],{timeout:15_000,maxBuffer:1024*1024});
    return result.stdout.trim()==='audio';
  } catch { return false; }
}
function runFfmpeg(args: string[], durationHint: number, onProgress: (percent:number)=>void): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child=spawn(ffmpeg,args,{stdio:['ignore','ignore','pipe']}); let last=''; let settled=false;
    const timeout=setTimeout(()=>{child.kill('SIGKILL');finish(new Error(`Render exceeded timeout of ${timeoutMs} ms`));},timeoutMs);
    const finish=(error?:Error|null)=>{if(settled)return;settled=true;clearTimeout(timeout);error?reject(error):resolvePromise();};
    child.stderr.setEncoding('utf8'); child.stderr.on('data',chunk=>{
      last=`${last}${chunk}`.slice(-12000);
      const matches=[...last.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
      const match=matches[matches.length-1];
      if(match) { const seconds=Number(match[1])*3600+Number(match[2])*60+Number(match[3]); if(durationHint>0) onProgress(Math.min(95,5+Math.round(seconds/durationHint*90))); }
    });
    child.on('error',error=>finish(error));
    child.on('close',code=>code===0?finish():finish(new Error(`FFmpeg exited with code ${code}: ${last.slice(-1500)}`)));
  });
}
async function processRender(job:Job<{manifest:RenderManifest}>) {
  const manifest=job.data.manifest;
  // The worker owns the output root; clients cannot choose filesystem paths in a job payload.
  const targetOutputDir=outputDir;
  await mkdir(targetOutputDir,{recursive:true});
  const assetClips=manifest.tracks.filter(track=>track.kind==='video'||track.kind==='audio'||track.kind==='overlay').flatMap(track=>track.clips.filter(clip=>clip.assetId).map(clip=>({track,clip})));
  if(!assetClips.some(item=>item.track.kind==='video')) throw new Error('The manifest needs at least one uploaded video-track clip.');
  await job.updateProgress(2);
  const inputs:ResolvedClip[]=[];
  for(let i=0;i<assetClips.length;i++) {
    const {track,clip}=assetClips[i]; const filename=safeAssetName(clip.assetId!); const inputPath=resolve(uploadDir,filename);
    if(!inputPath.startsWith(resolve(uploadDir)+sep)) throw new Error('Invalid asset path.');
    try { await access(inputPath,constants.R_OK); } catch { const restored=await restoreMediaObject('uploads',filename,inputPath); if(!restored) throw new Error(`Referenced media asset is missing: ${filename}`); await access(inputPath,constants.R_OK); }
    const info=await stat(inputPath); if(!info.isFile()) throw new Error('A referenced asset is not a regular file.');
    const isStill=['.png','.jpg','.jpeg','.webp','.gif','.bmp'].includes(extname(filename).toLowerCase());
    const hasAudio=await hasAudioStream(inputPath);
    inputs.push({track,clip,filePath:inputPath,inputIndex:i,hasAudio,isStill});
    await job.updateProgress(Math.min(8,2+Math.floor((i+1)/assetClips.length*6)));
  }
  const outputName=`${randomUUID()}.mp4`; const outputPath=join(targetOutputDir,outputName); const assPath=join(targetOutputDir,`.${randomUUID()}.ass`);
  const duration=Math.max(...inputs.map(input=>input.clip.start+input.clip.duration));
  let assCreated=false;
  try {
    if(manifest.export.burnSubtitles&&manifest.subtitles.length) { await writeFile(assPath,buildAss(manifest),'utf8'); assCreated=true; }
    const plan=buildRenderPlan(manifest,inputs,outputPath,assCreated?assPath:undefined);
    logger.info('Render started',{jobId:job.id,title:manifest.title,clips:inputs.length,duration:plan.duration,audioInputs:plan.audioInputCount,subtitles:manifest.export.burnSubtitles?manifest.subtitles.length:0});
    await job.updateProgress(10);
    await runFfmpeg(plan.args,plan.duration,progress=>{void job.updateProgress(Math.max(10,progress));});
    await access(outputPath,constants.R_OK);
    const outputStat=await stat(outputPath); if(outputStat.size<1024) throw new Error('FFmpeg produced an unexpectedly small output file.');
    await putMediaObject('outputs', outputName, outputPath, 'video/mp4');
    await job.updateProgress(100);
    logger.info('Render complete',{jobId:job.id,outputName:basename(outputPath),bytes:outputStat.size});
    return {outputUrl:`/media/outputs/${outputName}`,outputName,bytes:outputStat.size,duration:plan.duration,note:'Multi-clip composite pipeline with overlay tracks, transitions, crop/transform, keyframe expressions and ASS subtitle burn-in.'};
  } catch(error) {
    await rm(outputPath,{force:true}).catch(()=>undefined);
    throw error;
  } finally { if(assCreated) await rm(assPath,{force:true}).catch(()=>undefined); }
}

const worker=new Worker<{manifest:RenderManifest}, {outputUrl:string;outputName:string;bytes:number;duration:number;note:string}, string>('hendy-render-jobs',processRender,{connection:redis,concurrency:Math.max(1,Math.min(4,Number(process.env.WORKER_CONCURRENCY??1))),limiter:{max:10,duration:60_000}});
worker.on('active',job=>{ if(db&&job.id) void db.query("UPDATE render_jobs SET status='active',started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=$1",[job.id]).catch(error=>logger.warn('Could not persist active job state',{id:job.id,error:error instanceof Error?error.message:String(error)})); logger.info('Render job active',{id:job.id}); });
worker.on('progress',(job,progress)=>{if(db&&job.id)void db.query('UPDATE render_jobs SET progress=$1,updated_at=now() WHERE id=$2',[typeof progress==='number'?Math.max(0,Math.min(100,progress)):0,job.id]).catch(()=>undefined);});
worker.on('completed',(job,result)=>{logger.info('Render job completed',{id:job.id});if(db&&job.id)void db.query("UPDATE render_jobs SET status='completed',progress=100,output_key=$1,completed_at=now(),updated_at=now(),error_code=NULL,error_message=NULL WHERE id=$2",[result.outputName,job.id]).catch(error=>logger.error('Could not persist completed state',error,{id:job.id}));});
worker.on('failed',(job,error)=>{logger.error('Render job failed',error,{id:job?.id});if(db&&job?.id)void db.query("UPDATE render_jobs SET status='failed',error_code='RENDER_FAILED',error_message=$1,completed_at=now(),updated_at=now() WHERE id=$2",[(error.message||'Render failed').slice(0,1000),job.id]).catch(()=>undefined);});
worker.on('error',error=>logger.error('BullMQ worker error',error));
logger.info('AI/Render worker started',{concurrency:process.env.WORKER_CONCURRENCY??1,ffmpeg,ffprobe,objectStorage:isObjectStorageConfigured()});
const shutdown=async()=>{await worker.close();await redis.quit();await db?.end();process.exit(0);};
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
