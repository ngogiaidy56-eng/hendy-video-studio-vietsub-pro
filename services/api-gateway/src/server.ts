import 'express-async-errors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { randomUUID, randomBytes, createHash, createHmac, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, stat, unlink, readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { z } from 'zod';
import { logger } from '@hendy/logger';
import { getPostgresPool } from '@hendy/database';
import { hasPartialObjectStorageConfig, isObjectStorageConfigured, putMediaObject, restoreMediaObject, type MediaKind } from '@hendy/storage';
import type { AuthUser, RenderManifest, RenderJobSnapshot, UserRole } from '@hendy/shared-types';

const scrypt = promisify(scryptCallback);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: resolve(ROOT, '.env') });
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_PROD = NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 8787);
const uploadConfig = process.env.UPLOAD_DIR ?? 'storage/uploads';
const outputConfig = process.env.OUTPUT_DIR ?? 'storage/outputs';
const UPLOAD_DIR = isAbsolute(uploadConfig) ? resolve(uploadConfig) : resolve(ROOT, uploadConfig);
const OUTPUT_DIR = isAbsolute(outputConfig) ? resolve(outputConfig) : resolve(ROOT, outputConfig);
const MAX_UPLOAD_MB = Math.max(1, Math.min(2048, Number(process.env.MAX_UPLOAD_MB ?? 500)));
const API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN ?? '';
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN ?? '';
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'development-only-session-secret-replace-before-production';
const MEDIA_SIGNING_SECRET = process.env.MEDIA_SIGNING_SECRET ?? (ADMIN_API_TOKEN || 'development-only-media-secret');
const MEDIA_URL_TTL_SECONDS = Math.min(86400, Math.max(60, Number(process.env.MEDIA_URL_TTL_SECONDS ?? 3600)));
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

if (IS_PROD && hasPartialObjectStorageConfig()) throw new Error('R2 storage configuration is incomplete. Set R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_ENDPOINT or CLOUDFLARE_ACCOUNT_ID together.');
if (IS_PROD) {
  const required: Record<string, string> = {
    DATABASE_URL: process.env.DATABASE_URL ?? '', REDIS_URL: process.env.REDIS_URL ?? '',
    API_ACCESS_TOKEN, ADMIN_API_TOKEN, SESSION_SECRET, MEDIA_SIGNING_SECRET,
  };
  const missing = Object.entries(required).filter(([name, value]) => !value || (['API_ACCESS_TOKEN','ADMIN_API_TOKEN','SESSION_SECRET','MEDIA_SIGNING_SECRET'].includes(name) && value.length < 32)).map(([name]) => name);
  if (missing.length) throw new Error(`Production configuration missing or too weak: ${missing.join(', ')}`);
}
await mkdir(UPLOAD_DIR, { recursive: true });
await mkdir(OUTPUT_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174').split(',').map(s => s.trim()).filter(Boolean);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"], objectSrc: ["'none'"],
    scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'], imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'],
    connectSrc: ["'self'", ...allowedOrigins, 'wss:'],
  } },
}));
app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.includes(origin)) return callback(null, true); return callback(new Error('Origin not allowed by CORS')); }, credentials: false, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['authorization','content-type','x-request-id'] }));
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  const requestId = req.header('x-request-id')?.slice(0, 100) || randomUUID();
  res.setHeader('x-request-id', requestId);
  res.setHeader('cache-control', 'no-store');
  next();
});

let dbReady = false;
const db = process.env.DATABASE_URL ? getPostgresPool(process.env.DATABASE_URL) : undefined;
if (db) {
  try { await db.query('SELECT 1'); const schema=await db.query("SELECT to_regclass('public.video_projects') AS projects, to_regclass('public.user_invitations') AS invitations"); if(IS_PROD&&(!schema.rows[0]?.projects||!schema.rows[0]?.invitations)) throw new Error('Production database migrations are missing; run npm run db:migrate'); dbReady = true; logger.info('PostgreSQL connected'); }
  catch (error) { dbReady = false; if (IS_PROD) throw error; logger.warn('PostgreSQL unavailable; development fallback enabled', { error: error instanceof Error ? error.message : String(error) }); }
}
const localJobs = new Map<string, RenderJobSnapshot>();
const localProjects = new Map<string, { id: string; title: string; updatedAt: string; projectData?: unknown }>();
const localFlags = new Map<string, boolean>([['aiTranslation',true],['renderQueue',true],['cloudflareEdge',false],['maintenanceMode',false]]);
const rateBuckets = new Map<string, { count:number; resetAt:number }>();
function rateLimited(req:Request, res:Response, key:string, max:number, windowMs:number) { const now=Date.now(); const id=`${key}:${req.ip??'unknown'}`; let bucket=rateBuckets.get(id); if(!bucket||bucket.resetAt<=now){bucket={count:0,resetAt:now+windowMs};rateBuckets.set(id,bucket);} bucket.count++; if(bucket.count>max){res.setHeader('retry-after',Math.max(1,Math.ceil((bucket.resetAt-now)/1000)));res.status(429).json({error:'Rate limit exceeded'});return true;} if(rateBuckets.size>10000) for(const [k,v] of rateBuckets) if(v.resetAt<=now)rateBuckets.delete(k); return false;}
let renderQueue: Queue | undefined;
let redis: IORedis | undefined;
if (process.env.REDIS_URL) {
  try {
    redis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, connectTimeout: 2500, lazyConnect: true });
    redis.on('error', error => logger.warn('Redis connection error', { error: error.message }));
    await redis.connect();
    renderQueue = new Queue('hendy-render-jobs', { connection: redis });
    logger.info('Redis render queue connected');
  } catch (error) {
    logger.warn('Redis unavailable; no jobs will be processed in local fallback mode', { error: error instanceof Error ? error.message : String(error) });
    renderQueue = undefined;
  }
}
if (IS_PROD && !renderQueue) throw new Error('Redis queue connection is required in production.');

const upload = multer({
  storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, UPLOAD_DIR), filename: (_req, file, cb) => cb(null, `${randomUUID()}${safeExtension(file.originalname)}`) }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10, parts: 12 },
  fileFilter: (_req, file, cb) => { const ext = extname(file.originalname).toLowerCase(); const ok = file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('image/') || ['.srt','.ass','.ssa','.vtt','.wav','.mp3','.m4a','.mp4','.mov','.webm','.mkv','.png','.jpg','.jpeg','.webp'].includes(ext); cb(ok ? null : new Error('Unsupported media file type'), ok); }
});
function safeExtension(name: string) { const ext = extname(basename(name)).toLowerCase(); return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '.bin'; }
function safeEqual(actual: string, expected: string) {
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
type Principal = { sub: string; email: string; roles: UserRole[]; exp: number; source: 'session' | 'service' };
type RequestWithPrincipal = Request & { principal?: Principal };
function signSession(user: AuthUser) {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, roles: user.roles, exp: Math.floor(Date.now()/1000) + 8*60*60, source: 'session' })).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function parseSession(token: string): Principal | undefined {
  const [payload, signature, extra] = token.split('.'); if (!payload || !signature || extra) return undefined;
  const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Principal;
    if (!parsed.sub || !Number.isFinite(parsed.exp) || parsed.exp < Math.floor(Date.now()/1000) || !Array.isArray(parsed.roles)) return undefined;
    return parsed;
  } catch { return undefined; }
}
function bearer(req: Request) { const match = /^Bearer\s+(.+)$/i.exec(req.header('authorization') ?? ''); return match?.[1] ?? ''; }
function principalFor(req: Request): Principal | undefined {
  const token = bearer(req); if (!token) return undefined;
  if (API_ACCESS_TOKEN && safeEqual(token, API_ACCESS_TOKEN)) return { sub: 'service:api', email: 'api-service', roles: ['editor'], exp: Number.MAX_SAFE_INTEGER, source: 'service' };
  if (ADMIN_API_TOKEN && safeEqual(token, ADMIN_API_TOKEN)) return { sub: 'service:admin', email: 'admin-service', roles: ['admin'], exp: Number.MAX_SAFE_INTEGER, source: 'service' };
  return parseSession(token);
}
const devAuthBypass = !IS_PROD && !API_ACCESS_TOKEN && !ADMIN_API_TOKEN;
async function loadCurrentPrincipal(principal: Principal | undefined): Promise<Principal | undefined> {
  if (!principal || principal.source !== 'session' || !dbReady || !db) return principal;
  const account = await db.query("SELECT status FROM app_users WHERE id=$1", [principal.sub]);
  if (!account.rowCount || account.rows[0].status !== 'active') return undefined;
  const rolesResult = await db.query('SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1', [principal.sub]);
  const validRoles: UserRole[] = ['admin','editor','viewer'];
  const roles = rolesResult.rows.map(row => String(row.name)).filter((role): role is UserRole => validRoles.includes(role as UserRole));
  if (!roles.length) return undefined;
  return { ...principal, roles };
}
async function requireApiAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = principalFor(req); const principal = await loadCurrentPrincipal(raw);
    if (raw && !principal) return res.status(401).json({ error: 'Session is expired or account is disabled', code: 'SESSION_REVOKED' });
    if (principal) (req as RequestWithPrincipal).principal = principal;
    if (principal || devAuthBypass) return next();
    return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
  } catch (error) { logger.error('Could not validate authenticated session', error); return res.status(503).json({ error: 'Authentication service unavailable' }); }
}
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const raw = principalFor(req); const principal = await loadCurrentPrincipal(raw);
    if (raw && !principal) return res.status(401).json({ error: 'Session is expired or account is disabled', code: 'SESSION_REVOKED' });
    if (principal) (req as RequestWithPrincipal).principal = principal;
    if (devAuthBypass || principal?.roles.includes('admin')) return next();
    return res.status(principal ? 403 : 401).json({ error: principal ? 'Administrator role required' : 'Authentication required', code: principal ? 'FORBIDDEN' : 'AUTH_REQUIRED' });
  } catch (error) { logger.error('Could not validate administrator session', error); return res.status(503).json({ error: 'Authentication service unavailable' }); }
}
async function requireEditor(req: Request, res: Response, next: NextFunction) {
  try {
    const principal = await loadCurrentPrincipal(principalFor(req));
    if (principal) (req as RequestWithPrincipal).principal = principal;
    if (devAuthBypass || principal?.roles.some(role => role === 'admin' || role === 'editor')) return next();
    return res.status(principal ? 403 : 401).json({ error: principal ? 'Editor role required' : 'Authentication required', code: principal ? 'FORBIDDEN' : 'AUTH_REQUIRED' });
  } catch (error) { logger.error('Could not validate editor session', error); return res.status(503).json({ error: 'Authentication service unavailable' }); }
}
function actor(req: Request): Principal | undefined { return (req as RequestWithPrincipal).principal ?? principalFor(req); }
function userId(req: Request): string | null { const sub = actor(req)?.sub ?? ''; return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(sub) ? sub : null; }
async function featureEnabled(key:string):Promise<boolean> { if(dbReady&&db){const result=await db.query('SELECT enabled FROM system_feature_flags WHERE key=$1',[key]);return result.rowCount?Boolean(result.rows[0].enabled):true;} return localFlags.get(key)??true; }
function requireFeature(key:string) { return async (req:Request,res:Response,next:NextFunction) => { try { if(!await featureEnabled(key)) return res.status(503).json({error:`Feature ${key} is disabled by an administrator`,code:'FEATURE_DISABLED'}); return next(); } catch(error) { logger.error('Feature-flag lookup failed',error,{key}); return res.status(503).json({error:'Unable to verify feature availability'}); } }; }
async function enforceMaintenanceWrites(req:Request,res:Response,next:NextFunction) { const principal=actor(req); if(principal?.roles.includes('admin')||devAuthBypass) return next(); try { if(await featureEnabled('maintenanceMode')) return res.status(503).json({error:'System is in maintenance mode',code:'MAINTENANCE_MODE'}); return next(); } catch { return res.status(503).json({error:'Unable to verify system maintenance state'}); } }
async function audit(req: Request, action: string, resourceType: string, resourceId?: string, metadata: Record<string, unknown> = {}) {
  if (!dbReady || !db) return;
  try { await db.query('INSERT INTO audit_events(actor_user_id,action,resource_type,resource_id,request_id,ip_hash,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)', [userId(req), action, resourceType, resourceId ?? null, req.header('x-request-id') ?? null, createHmac('sha256', SESSION_SECRET).update(req.ip ?? '').digest('hex').slice(0,24), JSON.stringify(metadata)]); }
  catch (error) { logger.warn('Audit write failed', { action, resourceType, error: error instanceof Error ? error.message : String(error) }); }
}
function signMedia(kind: 'uploads' | 'outputs', filename: string) {
  const expires = Math.floor(Date.now()/1000) + MEDIA_URL_TTL_SECONDS;
  const signature = createHmac('sha256', MEDIA_SIGNING_SECRET).update(`${kind}:${filename}:${expires}`).digest('hex');
  return `/media/${kind}/${encodeURIComponent(filename)}?expires=${expires}&sig=${signature}`;
}
function verifyMedia(kind: string, filename: string, expires: string, signature: string) {
  if (!['uploads','outputs'].includes(kind) || basename(filename) !== filename || !/^[-a-zA-Z0-9_.]{1,255}$/.test(filename)) return false;
  const exp = Number(expires); if (!Number.isInteger(exp) || exp < Math.floor(Date.now()/1000) || exp > Math.floor(Date.now()/1000) + 86400) return false;
  const expected = createHmac('sha256', MEDIA_SIGNING_SECRET).update(`${kind}:${filename}:${exp}`).digest('hex');
  return safeEqual(signature, expected);
}

const cueSchema = z.object({ id: z.string().min(1).max(128), start: z.number().min(0).max(21600), end: z.number().positive().max(21600), text: z.string().max(2000), style: z.object({ fontFamily:z.string().max(80),fontSize:z.number().min(8).max(128),color:z.string().max(32),outlineColor:z.string().max(32),outlineWidth:z.number().min(0).max(12),bold:z.boolean(),italic:z.boolean().optional(),alignment:z.number().int().min(1).max(9).optional(),marginV:z.number().int().min(0).max(500).optional() }).optional() }).refine(c => c.end > c.start, { message: 'Subtitle end must be after start' });
const transformSchema = z.object({ x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().min(0.05).max(1),height:z.number().min(0.05).max(1),opacity:z.number().min(0).max(1).optional(),crop:z.object({x:z.number().min(0).max(0.95),y:z.number().min(0).max(0.95),width:z.number().min(0.05).max(1),height:z.number().min(0.05).max(1)}).optional() });
const keyframeSchema = z.object({time:z.number().min(0).max(21600),x:z.number().min(0).max(1).optional(),y:z.number().min(0).max(1).optional(),scale:z.number().min(0.1).max(4).optional(),opacity:z.number().min(0).max(1).optional()});
const transitionSchema = z.object({type:z.enum(['fade','dissolve']),duration:z.number().min(0).max(10)});
const clipSchema = z.object({id:z.string().min(1).max(128),assetId:z.string().max(255).optional(),name:z.string().max(255),start:z.number().min(0).max(21600),duration:z.number().positive().max(21600),sourceStart:z.number().min(0).max(21600).optional(),volume:z.number().min(0).max(2).optional(),transform:transformSchema.optional(),keyframes:z.array(keyframeSchema).max(200).optional(),transitionIn:transitionSchema.optional(),transitionOut:transitionSchema.optional()});
const manifestSchema = z.object({
  projectId: z.string().min(1).max(128), title: z.string().min(1).max(200), width: z.number().int().min(144).max(3840), height: z.number().int().min(144).max(2160), fps: z.number().min(1).max(60),
  tracks: z.array(z.object({ id:z.string().min(1).max(128), name:z.string().max(100), kind:z.enum(['video','audio','subtitle','overlay']), muted:z.boolean().optional(), volume:z.number().min(0).max(2).optional(), clips:z.array(clipSchema).max(200) })).max(16),
  subtitles: z.array(cueSchema).max(5000), export: z.object({ format:z.literal('mp4'),burnSubtitles:z.boolean(),quality:z.enum(['draft','standard','high']),audioDucking:z.object({enabled:z.boolean(),thresholdDb:z.number().min(-60).max(0),ratio:z.number().min(1).max(20),attackMs:z.number().min(1).max(1000),releaseMs:z.number().min(10).max(5000)}).optional() })
}).superRefine((manifest, ctx) => {
  const clips = manifest.tracks.flatMap(track => track.clips);
  const duration = Math.max(0, ...clips.map(clip => clip.start + clip.duration));
  if (duration > 21600) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Projects may not exceed 6 hours', path: ['tracks'] });
  for (const clip of clips) if (clip.sourceStart !== undefined && clip.sourceStart + clip.duration > 21600) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Clip source range exceeds six hours', path: ['tracks'] });
});
const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) });
const translationSchema = z.object({ targetLanguage: z.string().min(2).max(50).default('Vietnamese'), cues: z.array(cueSchema).min(1).max(100) });
const ttsSchema = z.object({ text:z.string().trim().min(1).max(8000), voice:z.string().trim().min(1).max(100).default('alloy'), model:z.string().trim().min(1).max(100).optional(), format:z.enum(['mp3','wav','opus','aac','flac']).default('mp3') });

// Public endpoints expose only liveness and version; all application data APIs below use auth middleware.
app.get('/health', async (_req, res) => {
  let pgUp = false; if (db) { try { await db.query('SELECT 1'); pgUp = true; } catch { pgUp = false; } }
  let redisUp = false; if (redis) { try { redisUp = (await redis.ping()) === 'PONG'; } catch { redisUp = false; } }
  const healthy = (!IS_PROD || (pgUp && redisUp));
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', service: 'hendy-api-gateway', version: '1.0.0', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString(), services: { postgres: pgUp, redis: redisUp, durablePersistence: pgUp, renderQueue: redisUp, objectStorage: isObjectStorageConfigured() }, requestId: res.getHeader('x-request-id') });
});
app.get('/api/v1/status', (_req, res) => res.json({ name: 'Hendy Server Video Studio Pro', apiVersion: 'v1', environment: NODE_ENV, queue: renderQueue ? 'redis-bullmq' : 'local-only', persistence: dbReady ? 'postgresql' : 'development-memory', uploadLimitMB: MAX_UPLOAD_MB }));
app.post('/api/v1/auth/login', async (req, res) => {
  if(rateLimited(req,res,'login',10,15*60_000)) return;
  const parsed = loginSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: 'Email and password are required' });
  if (!dbReady || !db) return res.status(503).json({ error: 'User authentication requires PostgreSQL; configure DATABASE_URL and run migrations.' });
  const email = parsed.data.email.trim().toLowerCase();
  try {
    const result = await db.query('SELECT id,email,display_name,password_hash,status FROM app_users WHERE lower(email)=lower($1) LIMIT 1', [email]);
    const user = result.rows[0] as {id:string;email:string;display_name:string;password_hash:string|null;status:string}|undefined;
    if (!user || user.status !== 'active' || !user.password_hash || !(await verifyPassword(parsed.data.password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
    const roleResult = await db.query('SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1', [user.id]);
    const allowed: UserRole[] = ['admin','editor','viewer']; const roles = roleResult.rows.map(r => String(r.name)).filter((role): role is UserRole => allowed.includes(role as UserRole));
    if (!roles.length) roles.push('viewer');
    const authUser: AuthUser = { id:user.id,email:user.email,displayName:user.display_name,roles };
    await audit(req, 'auth.login', 'user', user.id);
    res.json({ token: signSession(authUser), expiresIn: 28800, user: authUser });
  } catch (error) { logger.error('Login failed', error); res.status(500).json({ error: 'Authentication service error' }); }
});
app.post('/api/v1/auth/accept-invite', async (req,res) => {
  if(rateLimited(req,res,'accept-invite',8,15*60_000)) return;
  const parsed=z.object({token:z.string().min(32).max(256),password:z.string().min(14).max(256)}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:'Invitation token and password (at least 14 characters) are required'});
  if(!dbReady||!db) return res.status(503).json({error:'Invitation acceptance requires PostgreSQL'});
  const tokenHash=createHash('sha256').update(parsed.data.token).digest('hex'); const salt=randomBytes(16).toString('hex');
  const passwordHash=`scrypt$${salt}$${Buffer.from(await scrypt(parsed.data.password,salt,64) as Buffer).toString('hex')}`;
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const invitation=await client.query('SELECT id,user_id,email FROM user_invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE',[tokenHash]);
    if(!invitation.rowCount){await client.query('ROLLBACK');return res.status(400).json({error:'Invitation is invalid, expired or already used'});}
    const row=invitation.rows[0];
    await client.query("UPDATE app_users SET password_hash=$1,status='active',updated_at=now() WHERE id=$2 AND status='invited'",[passwordHash,row.user_id]);
    await client.query('UPDATE user_invitations SET accepted_at=now() WHERE id=$1',[row.id]);
    await client.query('COMMIT');
    await audit(req,'auth.invite_accept','user',row.user_id);
    return res.json({ok:true,email:row.email,message:'Invitation accepted. Sign in to continue.'});
  } catch(error) { await client.query('ROLLBACK').catch(()=>undefined); logger.error('Invitation acceptance failed',error); return res.status(500).json({error:'Could not accept invitation'}); }
  finally { client.release(); }
});
app.get('/api/v1/auth/me', requireApiAuth, async (req, res) => {
  const principal = actor(req); if (!principal) return res.status(401).json({ error: 'Authentication required' });
  res.json({ user: { id: principal.sub, email: principal.email, roles: principal.roles }, expiresAt: principal.exp });
});

app.get('/media/:kind/:filename', async (req, res, next) => {
  const kind = req.params.kind; const filename = req.params.filename;
  if (!verifyMedia(kind, filename, req.query.expires?.toString() ?? '', req.query.sig?.toString() ?? '')) return res.status(403).json({ error: 'Media URL is invalid or expired' });
  const dir = kind === 'uploads' ? UPLOAD_DIR : kind === 'outputs' ? OUTPUT_DIR : '';
  const filePath = join(dir, filename);
  try { await stat(filePath); }
  catch {
    try {
      const restored = await restoreMediaObject(kind as MediaKind, filename, filePath);
      if (!restored) return res.status(404).json({ error: 'Media object not found' });
      await stat(filePath);
    } catch (error) {
      logger.error('Media restoration failed', error, { kind, filename });
      return res.status(503).json({ error: 'Media storage is temporarily unavailable' });
    }
  }
  res.setHeader('cache-control', 'private, max-age=60'); res.setHeader('x-content-type-options','nosniff');
  res.sendFile(filePath, { dotfiles: 'deny' }, err => { if (err && !res.headersSent) next(err); });
});

app.get('/api/v1/projects', requireApiAuth, async (req, res) => {
  if (dbReady && db) {
    const owner = userId(req); const principal=actor(req);
    const result = principal?.roles.includes('admin') || principal?.source === 'service'
      ? await db.query('SELECT id,title,project_data,updated_at FROM video_projects ORDER BY updated_at DESC LIMIT 100')
      : owner ? await db.query('SELECT id,title,project_data,updated_at FROM video_projects WHERE owner_user_id=$1 ORDER BY updated_at DESC LIMIT 100', [owner])
      : await db.query('SELECT id,title,project_data,updated_at FROM video_projects WHERE owner_user_id IS NULL ORDER BY updated_at DESC LIMIT 100');
    return res.json({ projects: result.rows.map(row => ({ id:row.id,title:row.title,updatedAt:row.updated_at, ...(row.project_data ?? {}) })) });
  }
  res.json({ projects: [...localProjects.values()] });
});
app.post('/api/v1/projects', requireEditor, enforceMaintenanceWrites, async (req, res) => {
  const title = z.string().min(1).max(200).safeParse(req.body?.title ?? 'Untitled project');
  if (!title.success) return res.status(400).json({ error: 'Project title must contain 1-200 characters' });
  const id = randomUUID(); const updatedAt = new Date().toISOString(); const projectData = { tracks: req.body?.tracks ?? [], subtitles: req.body?.subtitles ?? [], settings: req.body?.settings ?? {} };
  if (dbReady && db) {
    const result = await db.query('INSERT INTO video_projects(id,owner_user_id,title,project_data) VALUES($1,$2,$3,$4) RETURNING id,title,updated_at', [id,userId(req),title.data,JSON.stringify(projectData)]);
    await audit(req, 'project.create', 'project', id);
    return res.status(201).json({ ...result.rows[0], updatedAt:result.rows[0].updated_at, ...projectData });
  }
  const project = { id,title:title.data,updatedAt,projectData }; localProjects.set(id,project); return res.status(201).json(project);
});
app.get('/api/v1/projects/:id', requireApiAuth, async (req, res) => {
  if (dbReady && db) {
    const owner = userId(req); const principal=actor(req); const result = principal?.roles.includes('admin') || principal?.source === 'service' ? await db.query('SELECT id,title,project_data,updated_at,owner_user_id FROM video_projects WHERE id=$1',[req.params.id]) : owner ? await db.query('SELECT id,title,project_data,updated_at,owner_user_id FROM video_projects WHERE id=$1 AND owner_user_id=$2',[req.params.id,owner]) : await db.query('SELECT id,title,project_data,updated_at,owner_user_id FROM video_projects WHERE id=$1 AND owner_user_id IS NULL',[req.params.id]);
    return result.rowCount ? res.json({ ...result.rows[0].project_data,id:result.rows[0].id,title:result.rows[0].title,updatedAt:result.rows[0].updated_at }) : res.status(404).json({ error:'Project not found' });
  }
  const project = localProjects.get(req.params.id); return project ? res.json(project) : res.status(404).json({ error:'Project not found' });
});
app.put('/api/v1/projects/:id', requireEditor, enforceMaintenanceWrites, async (req, res) => {
  const idSchema = z.string().uuid().safeParse(req.params.id); if (!idSchema.success) return res.status(400).json({ error:'Invalid project id' });
  const title = z.string().min(1).max(200).safeParse(req.body?.title);
  if (!title.success) return res.status(400).json({ error:'Project title must contain 1-200 characters' });
  const projectData = { tracks:req.body?.tracks ?? [],subtitles:req.body?.subtitles ?? [],settings:req.body?.settings ?? {} };
  if (dbReady && db) {
    const owner=userId(req); const principal=actor(req); const result = principal?.roles.includes('admin') || principal?.source === 'service' ? await db.query('UPDATE video_projects SET title=$1,project_data=$2,updated_at=now() WHERE id=$3 RETURNING id,title,updated_at',[title.data,JSON.stringify(projectData),id]) : owner ? await db.query('UPDATE video_projects SET title=$1,project_data=$2,updated_at=now() WHERE id=$3 AND owner_user_id=$4 RETURNING id,title,updated_at',[title.data,JSON.stringify(projectData),id,owner]) : await db.query('UPDATE video_projects SET title=$1,project_data=$2,updated_at=now() WHERE id=$3 AND owner_user_id IS NULL RETURNING id,title,updated_at',[title.data,JSON.stringify(projectData),id]);
    if (!result.rowCount) return res.status(404).json({ error:'Project not found' }); await audit(req,'project.update','project',id);
    return res.json({ ...result.rows[0], updatedAt:result.rows[0].updated_at, ...projectData });
  }
  const existing=localProjects.get(id); if (!existing) return res.status(404).json({error:'Project not found'}); const saved={id,title:title.data,updatedAt:new Date().toISOString(),projectData}; localProjects.set(id,saved); return res.json(saved);
});
app.delete('/api/v1/projects/:id', requireEditor, enforceMaintenanceWrites, async (req,res) => {
  if (dbReady && db) { const owner=userId(req); const principal=actor(req); const result=principal?.roles.includes('admin') || principal?.source === 'service' ? await db.query('DELETE FROM video_projects WHERE id=$1 RETURNING id',[req.params.id]) : owner ? await db.query('DELETE FROM video_projects WHERE id=$1 AND owner_user_id=$2 RETURNING id',[req.params.id,owner]) : await db.query('DELETE FROM video_projects WHERE id=$1 AND owner_user_id IS NULL RETURNING id',[req.params.id]); if (!result.rowCount) return res.status(404).json({error:'Project not found'}); await audit(req,'project.delete','project',req.params.id); }
  else if (!localProjects.delete(req.params.id)) return res.status(404).json({error:'Project not found'});
  res.status(204).end();
});

async function sha256File(filePath:string):Promise<string> {
  return await new Promise((resolveHash,rejectHash)=>{ const hash=createHash('sha256'); const stream=createReadStream(filePath); stream.on('data',chunk=>hash.update(chunk)); stream.on('error',rejectHash); stream.on('end',()=>resolveHash(hash.digest('hex'))); });
}

app.post('/api/v1/assets', requireEditor, enforceMaintenanceWrites, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A media file is required under form field "file"' });
  const info = await stat(req.file.path); const assetId = req.file.filename;
  try {
    const checksum = await sha256File(req.file.path);
    await putMediaObject('uploads', assetId, req.file.path, req.file.mimetype);
    if (dbReady && db) await db.query('INSERT INTO media_assets(asset_id,owner_user_id,original_name,mime_type,byte_size,storage_key,sha256) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(asset_id) DO NOTHING', [assetId,userId(req),req.file.originalname.slice(0,255),req.file.mimetype,info.size,assetId,checksum]);
    await audit(req,'asset.upload','asset',assetId,{size:info.size,mimeType:req.file.mimetype,sha256:checksum});
    res.status(201).json({ assetId, name:req.file.originalname, size:info.size, mimeType:req.file.mimetype, sha256:checksum, url:signMedia('uploads',assetId) });
  } catch (error) { await unlink(req.file.path).catch(()=>undefined); throw error; }
});
app.get('/api/v1/assets', requireApiAuth, async (req,res) => {
  if (!dbReady || !db) return res.json({assets:[]});
  const owner=userId(req); const principal=actor(req); const result=principal?.roles.includes('admin') || principal?.source === 'service' ? await db.query('SELECT asset_id,original_name,mime_type,byte_size,created_at FROM media_assets ORDER BY created_at DESC LIMIT 200') : owner ? await db.query('SELECT asset_id,original_name,mime_type,byte_size,created_at FROM media_assets WHERE owner_user_id=$1 ORDER BY created_at DESC LIMIT 200',[owner]) : await db.query('SELECT asset_id,original_name,mime_type,byte_size,created_at FROM media_assets WHERE owner_user_id IS NULL ORDER BY created_at DESC LIMIT 200');
  res.json({assets:result.rows.map(row=>({assetId:row.asset_id,name:row.original_name,mimeType:row.mime_type,size:Number(row.byte_size),createdAt:row.created_at,url:signMedia('uploads',row.asset_id)}))});
});

app.post('/api/v1/render/manifest', requireEditor, enforceMaintenanceWrites, requireFeature('renderQueue'), async (req, res) => {
  const parsed = manifestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid render manifest', issues: parsed.error.issues.slice(0, 30) });
  const manifest = parsed.data as RenderManifest; const id = randomUUID(); const createdAt = new Date().toISOString();
  const videoClips = manifest.tracks.filter(t => t.kind === 'video').flatMap(t => t.clips).filter(c => c.assetId);
  if (!videoClips.length) return res.status(400).json({ error: 'Add at least one uploaded clip to the video track before exporting.' });
  // An asset ID is not an authorization token. Validate every referenced media object against
  // the current account before placing the manifest on the shared worker queue.
  if (dbReady && db) {
    const assetIds = [...new Set(manifest.tracks.flatMap(track => track.clips.map(clip => clip.assetId).filter((value): value is string => Boolean(value))))];
    const principal = actor(req); const owner = userId(req);
    const canReadAllAssets = Boolean(principal?.roles.includes('admin') || principal?.source === 'service' || devAuthBypass);
    const owned = canReadAllAssets
      ? await db.query('SELECT asset_id FROM media_assets WHERE asset_id = ANY($1::text[])', [assetIds])
      : owner
        ? await db.query('SELECT asset_id FROM media_assets WHERE asset_id = ANY($1::text[]) AND owner_user_id=$2', [assetIds, owner])
        : { rows: [], rowCount: 0 };
    if (owned.rowCount !== assetIds.length) return res.status(403).json({ error: 'One or more media assets are unavailable to this account', code: 'ASSET_ACCESS_DENIED' });
  }
  if (!renderQueue) {
    if (IS_PROD) return res.status(503).json({ error:'Render queue is unavailable' });
    const snapshot: RenderJobSnapshot = { id,status:'queued-local-only',progress:0,message:'Redis is not configured; job was not sent to a worker.',createdAt };
    localJobs.set(id,snapshot); return res.status(202).json(snapshot);
  }
  try {
    if (dbReady && db) await db.query("INSERT INTO render_jobs(id,user_id,project_id,title,status,progress,manifest) VALUES($1,$2,$3,$4,'queued',0,$5)",[id,userId(req),manifest.projectId,manifest.title,JSON.stringify(manifest)]);
    await renderQueue.add('render-video',{manifest},{jobId:id,attempts:2,backoff:{type:'exponential',delay:2000},removeOnComplete:100,removeOnFail:200});
    const snapshot: RenderJobSnapshot = { id,status:'queued',progress:0,message:'Waiting for render worker',createdAt };
    localJobs.set(id,snapshot); await audit(req,'render.submit','render_job',id,{title:manifest.title}); return res.status(202).json(snapshot);
  } catch (error) {
    if (dbReady && db) await db.query("UPDATE render_jobs SET status='failed',error_code='QUEUE_UNAVAILABLE',error_message='Queue unavailable',updated_at=now() WHERE id=$1",[id]).catch(()=>undefined);
    logger.error('Could not enqueue render job',error,{id}); return res.status(503).json({error:'Render queue is unavailable'});
  }
});
app.get('/api/v1/jobs', requireApiAuth, async (req,res) => {
  if (dbReady && db) {
    const owner=userId(req); const principal=actor(req); const result=principal?.roles.includes('admin') || principal?.source === 'service' ? await db.query('SELECT id,project_id,title,status,progress,output_key,error_message,created_at FROM render_jobs ORDER BY created_at DESC LIMIT 100') : owner ? await db.query('SELECT id,project_id,title,status,progress,output_key,error_message,created_at FROM render_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[owner]) : await db.query('SELECT id,project_id,title,status,progress,output_key,error_message,created_at FROM render_jobs WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 100');
    return res.json({jobs:result.rows.map(row=>({id:row.id,projectId:row.project_id,title:row.title,status:row.status,progress:row.progress,outputUrl:row.output_key?signMedia('outputs',basename(row.output_key)):undefined,error:row.error_message,createdAt:row.created_at}))});
  }
  res.json({jobs:[...localJobs.values()]});
});
app.get('/api/v1/jobs/:id', requireApiAuth, async (req,res) => {
  const id = req.params.id; if (!/^[0-9a-f-]{20,40}$/i.test(id)) return res.status(400).json({ error: 'Invalid job id' });
  if (renderQueue) {
    const job = await renderQueue.getJob(id);
    if (job) {
      const state = await job.getState(); const progress = typeof job.progress === 'number' ? job.progress : 0;
      const dbRow = dbReady && db ? (await db.query('SELECT user_id,created_at FROM render_jobs WHERE id=$1',[id])).rows[0] as {user_id:string|null;created_at:Date}|undefined : undefined;
      const requester=userId(req); const principal=actor(req);
      if (dbReady && db && (!dbRow || (dbRow.user_id !== requester && !principal?.roles.includes('admin') && principal?.source !== 'service'))) return res.status(404).json({error:'Render job not found'});
      const returnValue = job.returnvalue as {outputUrl?:string}|undefined;
      const outputFilename=returnValue?.outputUrl ? basename(returnValue.outputUrl) : '';
      const snapshot: RenderJobSnapshot = { id,status:state==='completed'?'completed':state==='failed'?'failed':state==='active'?'active':'queued',progress,message:state==='completed'?'Render complete':state==='failed'?'Render failed':state==='active'?'Rendering with FFmpeg':'Waiting for worker',createdAt:dbRow?.created_at ? new Date(dbRow.created_at).toISOString() : new Date(job.timestamp).toISOString() };
      if (state==='completed' && outputFilename) snapshot.outputUrl=signMedia('outputs',outputFilename);
      if (state==='failed') snapshot.error=job.failedReason;
      if (dbReady && db) await db.query('UPDATE render_jobs SET status=$1,progress=$2,output_key=$3,error_message=$4,updated_at=now(),started_at=CASE WHEN $1=\'active\' THEN COALESCE(started_at,now()) ELSE started_at END,completed_at=CASE WHEN $1 IN (\'completed\',\'failed\') THEN now() ELSE completed_at END WHERE id=$5',[snapshot.status==='active'?'active':snapshot.status,snapshot.progress,outputFilename||null,snapshot.error??null,id]).catch(()=>undefined);
      return res.json(snapshot);
    }
  }
  const local = localJobs.get(id); return local ? res.json(local) : res.status(404).json({ error: 'Render job not found' });
});

// This endpoint deliberately gives no password hashes or service tokens to the browser.
app.get('/api/v1/admin/summary', requireAdmin, async (_req,res) => {
  if (!dbReady || !db) return res.json({users:0,projects:localProjects.size,assets:0,jobs:localJobs.size,queue:renderQueue?'redis-bullmq':'local-only',persistence:'development-memory',flags:Object.fromEntries(localFlags)});
  const [users,projects,assets,jobs,activeJobs,flags] = await Promise.all([
    db.query("SELECT count(*)::int AS count FROM app_users WHERE status='active'"),db.query('SELECT count(*)::int AS count FROM video_projects'),db.query('SELECT count(*)::int AS count FROM media_assets'),db.query('SELECT count(*)::int AS count FROM render_jobs'),db.query("SELECT count(*)::int AS count FROM render_jobs WHERE status IN ('queued','active')"),db.query('SELECT key,enabled FROM system_feature_flags ORDER BY key')
  ]);
  res.json({users:users.rows[0].count,projects:projects.rows[0].count,assets:assets.rows[0].count,jobs:jobs.rows[0].count,activeJobs:activeJobs.rows[0].count,queue:renderQueue?'redis-bullmq':'local-only',persistence:'postgresql',flags:Object.fromEntries(flags.rows.map(row=>[row.key,row.enabled]))});
});
app.get('/api/v1/admin/users', requireAdmin, async (_req,res) => {
  if (!dbReady || !db) return res.json({users:[]});
  const result=await db.query("SELECT u.id,u.email,u.display_name,u.status,u.created_at,COALESCE(array_agg(r.name) FILTER(WHERE r.name IS NOT NULL),'{}') AS roles FROM app_users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.status <> 'deleted' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500");
  res.json({users:result.rows.map(row=>({id:row.id,email:row.email,name:row.display_name,status:row.status,roles:row.roles,createdAt:row.created_at}))});
});
app.post('/api/v1/admin/users', requireAdmin, async (req,res) => {
  const schema=z.object({email:z.string().email().max(254),displayName:z.string().min(1).max(120),role:z.enum(['admin','editor','viewer'])}); const parsed=schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error:'Invalid user payload'});
  if (!dbReady || !db) return res.status(503).json({error:'User management requires PostgreSQL'});
  const email=parsed.data.email.trim().toLowerCase(); const rawToken=randomBytes(32).toString('base64url'); const tokenHash=createHash('sha256').update(rawToken).digest('hex');
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const existing=await client.query('SELECT id FROM app_users WHERE lower(email)=lower($1)',[email]); if(existing.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({error:'An account with this email already exists'}); }
    const inserted=await client.query("INSERT INTO app_users(external_subject,email,display_name,status) VALUES($1,$2,$3,'invited') RETURNING id,email,display_name,status,created_at",[`invite:${email}`,email,parsed.data.displayName]);
    await client.query('INSERT INTO user_roles(user_id,role_id,granted_by) SELECT $1,r.id,$2 FROM roles r WHERE r.name=$3',[inserted.rows[0].id,userId(req),parsed.data.role]);
    await client.query("INSERT INTO user_invitations(user_id,email,token_hash,expires_at,created_by) VALUES($1,$2,$3,now()+interval '72 hours',$4)",[inserted.rows[0].id,email,tokenHash,userId(req)]);
    await client.query('COMMIT');
    await audit(req,'admin.user_invite','user',inserted.rows[0].id,{role:parsed.data.role});
    const base=(process.env.INVITE_BASE_URL??process.env.PUBLIC_APP_URL??'http://localhost:5173').replace(/\/$/,'');
    const invitationUrl=`${base}/?invite=${encodeURIComponent(rawToken)}`;
    let emailStatus:'sent'|'not-configured'|'failed'='not-configured';
    if(process.env.SMTP_HOST?.trim()&&process.env.SMTP_FROM?.trim()) {
      try {
        const port=Math.max(1,Math.min(65535,Number(process.env.SMTP_PORT??587)));
        const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST.trim(),port,secure:process.env.SMTP_SECURE==='true'||port===465,connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:20_000,...(process.env.SMTP_USER&&process.env.SMTP_PASSWORD?{auth:{user:process.env.SMTP_USER,password:process.env.SMTP_PASSWORD}}:{})});
        await transporter.sendMail({from:process.env.SMTP_FROM,to:email,subject:'Lời mời tham gia Hendy Video Studio Pro',text:`Xin chào ${parsed.data.displayName},\n\nBạn được mời tham gia Hendy Video Studio Pro với vai trò ${parsed.data.role}.\nMở liên kết sau để thiết lập mật khẩu (hết hạn sau 72 giờ):\n${invitationUrl}\n\nNếu bạn không mong đợi lời mời này, hãy bỏ qua email.`,headers:{'X-Entity-Ref-ID':randomUUID()}});
        emailStatus='sent';
      } catch(error) { emailStatus='failed'; logger.warn('Invitation email delivery failed',{email,error:error instanceof Error?error.message:String(error)}); }
    }
    return res.status(201).json({...inserted.rows[0],role:parsed.data.role,emailStatus, ...(emailStatus==='sent'?{}:{invitationUrl}),expiresInHours:72});
  } catch(error) { await client.query('ROLLBACK').catch(()=>undefined); logger.error('Invite user failed',error); return res.status(500).json({error:'Could not create invitation'}); }
  finally { client.release(); }
});
app.patch('/api/v1/admin/users/:id', requireAdmin, async (req,res) => {
  const schema=z.object({status:z.enum(['active','suspended','deleted']).optional(),role:z.enum(['admin','editor','viewer']).optional()}).refine(v=>v.status||v.role);
  const parsed=schema.safeParse(req.body); const parsedId=z.string().uuid().safeParse(req.params.id);
  if (!parsed.success || !parsedId.success) return res.status(400).json({error:'Provide a valid user id and status and/or role'});
  if(!dbReady||!db) return res.status(503).json({error:'User management requires PostgreSQL'});
  const id=parsedId.data; const actingUserId=userId(req);
  if(actingUserId===id&&((parsed.data.status&&parsed.data.status!=='active')||(parsed.data.role&&parsed.data.role!=='admin'))) return res.status(409).json({error:'You cannot suspend, delete, or remove admin access from your own account'});
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    // Serialize administrator mutations so two concurrent requests cannot remove the last active admin.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('hendy-admin-user-mutations'))");
    const target=await client.query('SELECT id,status FROM app_users WHERE id=$1 FOR UPDATE',[id]);
    if(!target.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'User not found'});}
    const currentStatus=String(target.rows[0].status);
    const roleResult=await client.query('SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=$1',[id]);
    const currentRoles=roleResult.rows.map(row=>String(row.name)); const hadAdmin=currentRoles.includes('admin');
    const nextStatus=parsed.data.status??currentStatus; const nextRole=parsed.data.role??(hadAdmin?'admin':currentRoles[0]??'viewer');
    const removesAdmin=hadAdmin&&(nextRole!=='admin'||nextStatus!=='active');
    if(removesAdmin){
      const activeAdmins=await client.query("SELECT count(DISTINCT u.id)::int AS count FROM app_users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='active' AND r.name='admin'");
      const count=Number(activeAdmins.rows[0]?.count??0); const targetCurrentlyCounted=currentStatus==='active'?1:0; const targetWillBeCounted=nextStatus==='active'&&nextRole==='admin'?1:0;
      if(count-targetCurrentlyCounted+targetWillBeCounted<1){await client.query('ROLLBACK');return res.status(409).json({error:'At least one active administrator must remain'});}
    }
    if(parsed.data.status) await client.query('UPDATE app_users SET status=$1,updated_at=now() WHERE id=$2',[parsed.data.status,id]);
    if(parsed.data.role){await client.query('DELETE FROM user_roles WHERE user_id=$1',[id]);await client.query('INSERT INTO user_roles(user_id,role_id,granted_by) SELECT $1,r.id,$2 FROM roles r WHERE r.name=$3',[id,actingUserId,parsed.data.role]);}
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK').catch(()=>undefined); logger.error('Admin user update failed',error,{userId:id}); return res.status(500).json({error:'Could not update user'}); }
  finally { client.release(); }
  await audit(req,'admin.user_update','user',id,parsed.data); res.json({ok:true,id,...parsed.data});
});
app.get('/api/v1/admin/jobs', requireAdmin, async (_req,res) => {
  if(dbReady&&db) { const result=await db.query('SELECT id,project_id,title,status,progress,output_key,error_message,created_at FROM render_jobs ORDER BY created_at DESC LIMIT 200'); return res.json({jobs:result.rows.map(row=>({id:row.id,projectId:row.project_id,title:row.title,status:row.status,progress:row.progress,outputUrl:row.output_key?signMedia('outputs',basename(row.output_key)):undefined,error:row.error_message,createdAt:row.created_at}))}); }
  res.json({jobs:[...localJobs.values()]});
});
app.post('/api/v1/admin/jobs/:id/retry', requireAdmin, async (req,res) => {
  if(!dbReady||!db||!renderQueue) return res.status(503).json({error:'Persistent database and render queue are required'});
  const row=await db.query('SELECT manifest,title FROM render_jobs WHERE id=$1',[req.params.id]); if(!row.rowCount) return res.status(404).json({error:'Render job not found'});
  const id=randomUUID(); const manifest=row.rows[0].manifest as RenderManifest;
  await db.query("INSERT INTO render_jobs(id,user_id,project_id,title,status,progress,manifest) VALUES($1,$2,$3,$4,'queued',0,$5)",[id,userId(req),manifest.projectId,manifest.title,JSON.stringify(manifest)]);
  await renderQueue.add('render-video',{manifest},{jobId:id,attempts:2,backoff:{type:'exponential',delay:2000},removeOnComplete:100,removeOnFail:200});
  await audit(req,'admin.render_retry','render_job',id,{sourceJobId:req.params.id}); res.status(202).json({id,status:'queued'});
});
app.get('/api/v1/admin/feature-flags', requireAdmin, async (_req,res) => {
  if(!dbReady||!db) return res.json({flags:Object.fromEntries(localFlags)});
  const result=await db.query('SELECT key,enabled,description,updated_at FROM system_feature_flags ORDER BY key'); res.json({flags:result.rows});
});
app.put('/api/v1/admin/feature-flags/:key', requireAdmin, async (req,res) => {
  const key=req.params.key; const parsed=z.object({enabled:z.boolean(),description:z.string().max(500).optional()}).safeParse(req.body);
  if(!/^[a-z][a-zA-Z0-9]{1,80}$/.test(key)||!parsed.success) return res.status(400).json({error:'Invalid feature flag'});
  if(!dbReady||!db) { localFlags.set(key,parsed.data.enabled); return res.json({key,enabled:parsed.data.enabled}); }
  await db.query('INSERT INTO system_feature_flags(key,enabled,description,updated_by,updated_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(key) DO UPDATE SET enabled=EXCLUDED.enabled,description=EXCLUDED.description,updated_by=EXCLUDED.updated_by,updated_at=now()',[key,parsed.data.enabled,parsed.data.description??'',userId(req)]);
  await audit(req,'admin.feature_flag_update','feature_flag',key,{enabled:parsed.data.enabled}); res.json({key,enabled:parsed.data.enabled});
});
app.get('/api/v1/admin/audit', requireAdmin, async (req,res) => {
  if(!dbReady||!db) return res.json({events:[]}); const limit=Math.min(200,Math.max(1,Number(req.query.limit)||50));
  const result=await db.query('SELECT id,actor_user_id,action,resource_type,resource_id,request_id,metadata,created_at FROM audit_events ORDER BY created_at DESC LIMIT $1',[limit]); res.json({events:result.rows});
});

app.post('/api/v1/ai/translate-subtitles', requireEditor, enforceMaintenanceWrites, requireFeature('aiTranslation'), async (req,res) => {
  if(rateLimited(req,res,'ai-translate',30,60*60_000)) return;
  const parsed=translationSchema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:'Provide 1-100 subtitle cues and a target language'});
  if(!GEMINI_API_KEY) return res.status(503).json({error:'GEMINI_API_KEY is not configured'});
  try {
    const prompt = `Translate these video subtitles into ${parsed.data.targetLanguage}. Preserve meaning, tone, names, cue ids and timestamps. Keep output concise for reading on screen. Return only valid JSON in the form {"translations":[{"id":"same id","text":"translated subtitle"}]}. Do not add commentary.\n${JSON.stringify(parsed.data.cues.map(c=>({id:c.id,start:c.start,end:c.end,text:c.text})))}`;
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.2,responseMimeType:'application/json'}}),signal:AbortSignal.timeout(90_000)});
    const body=await response.json() as {candidates?:{content?:{parts?:{text?:string}[]}}[];error?:{message?:string}};
    if(!response.ok) { logger.warn('Gemini subtitle translation rejected',{status:response.status,message:body.error?.message}); return res.status(502).json({error:'AI translation provider returned an error'}); }
    const raw=body.candidates?.[0]?.content?.parts?.map(p=>p.text??'').join('')??''; const cleaned=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
    const output=JSON.parse(cleaned) as {translations?:{id:string;text:string}[]}; const translations=output.translations;
    if(!Array.isArray(translations)||translations.length!==parsed.data.cues.length||translations.some(t=>typeof t.id!=='string'||typeof t.text!=='string')) return res.status(502).json({error:'AI returned a translation payload with an invalid schema'});
    const originals=new Map(parsed.data.cues.map(c=>[c.id,c]));
    res.json({translations:translations.map(t=>({id:t.id,text:t.text.slice(0,2000)})).filter(t=>originals.has(t.id)),model:GEMINI_MODEL}); await audit(req,'ai.subtitle_translate','subtitle_batch',undefined,{count:translations.length,targetLanguage:parsed.data.targetLanguage});
  } catch(error) { logger.error('Subtitle translation failed',error); res.status(502).json({error:'AI translation failed or timed out'}); }
});
app.post('/api/v1/ai/tts', requireEditor, enforceMaintenanceWrites, requireFeature('aiTranslation'), async (req,res) => {
  if(rateLimited(req,res,'ai-tts',20,60*60_000)) return;
  const parsed=ttsSchema.safeParse(req.body); if(!parsed.success) return res.status(400).json({error:'Provide text (1-8000 characters), voice and a supported audio format'});
  const providerUrl=process.env.TTS_API_URL;
  if(!providerUrl) return res.status(503).json({error:'TTS_API_URL is not configured'});
  let parsedProviderUrl:URL; try { parsedProviderUrl=new URL(providerUrl); } catch { return res.status(503).json({error:'TTS_API_URL must be a valid HTTPS URL'}); }
  if(parsedProviderUrl.protocol!=='https:'&&!(NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(parsedProviderUrl.hostname))) return res.status(503).json({error:'TTS_API_URL must use HTTPS in production'});
  const contentTypes:Record<string,string>={mp3:'audio/mpeg',wav:'audio/wav',opus:'audio/opus',aac:'audio/aac',flac:'audio/flac'};
  const fileId=`${randomUUID()}.${parsed.data.format}`; const filePath=join(UPLOAD_DIR,fileId); let fileCreated=false;
  try {
    const headers:Record<string,string>={'content-type':'application/json','accept':'audio/*'}; if(process.env.TTS_API_TOKEN) headers.authorization=`Bearer ${process.env.TTS_API_TOKEN}`;
    const response=await fetch(providerUrl,{method:'POST',headers,body:JSON.stringify({model:parsed.data.model??process.env.TTS_MODEL??'tts-1',input:parsed.data.text,voice:parsed.data.voice,response_format:parsed.data.format}),signal:AbortSignal.timeout(120_000)});
    if(!response.ok||!response.body) return res.status(502).json({error:'TTS provider returned an error'});
    const rawType=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
    if(!rawType.startsWith('audio/')&&rawType!=='application/octet-stream') return res.status(502).json({error:'TTS provider did not return audio bytes'});
    const declaredSize=Number(response.headers.get('content-length')??0); const maxBytes=30*1024*1024;
    if(declaredSize>maxBytes) return res.status(502).json({error:'TTS output exceeds the 30 MB limit'});
    const chunks:Buffer[]=[]; let total=0;
    for await (const chunk of response.body) { const part=Buffer.from(chunk); total+=part.length; if(total>maxBytes) return res.status(502).json({error:'TTS output exceeds the 30 MB limit'}); chunks.push(part); }
    if(!total) return res.status(502).json({error:'TTS provider returned an empty audio file'});
    await writeFile(filePath,Buffer.concat(chunks),{flag:'wx'}); fileCreated=true;
    const info=await stat(filePath); const checksum=await sha256File(filePath); const mimeType=rawType.startsWith('audio/')?rawType:contentTypes[parsed.data.format];
    await putMediaObject('uploads',fileId,filePath,mimeType);
    if(dbReady&&db) await db.query('INSERT INTO media_assets(asset_id,owner_user_id,original_name,mime_type,byte_size,storage_key,sha256) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(asset_id) DO NOTHING',[fileId,userId(req),`tts-${parsed.data.voice}.${parsed.data.format}`,mimeType,info.size,fileId,checksum]);
    await audit(req,'ai.tts_generate','asset',fileId,{bytes:info.size,voice:parsed.data.voice,format:parsed.data.format});
    return res.status(201).json({assetId:fileId,name:`tts-${parsed.data.voice}.${parsed.data.format}`,mimeType,size:info.size,sha256:checksum,url:signMedia('uploads',fileId)});
  } catch(error) { if(fileCreated) await unlink(filePath).catch(()=>undefined); logger.error('TTS generation failed',error); return res.status(502).json({error:'TTS provider failed or timed out'}); }
});

app.post('/api/v1/ai/transcribe', requireEditor, enforceMaintenanceWrites, requireFeature('aiTranslation'), (req,res,next)=>{if(rateLimited(req,res,'ai-transcribe',10,60*60_000)) return; next();}, upload.single('file'), async (req,res) => {
  if(!req.file) return res.status(400).json({error:'Upload an audio/video file in form field file'});
  if(!req.file.mimetype.startsWith('audio/')&&!req.file.mimetype.startsWith('video/')) { await unlink(req.file.path).catch(()=>undefined); return res.status(415).json({error:'Transcription requires an audio or video file'}); }
  const maxTranscriptionMB=Math.max(10,Math.min(200,Number(process.env.MAX_TRANSCRIPTION_MB??100))); if(req.file.size>maxTranscriptionMB*1024*1024){await unlink(req.file.path).catch(()=>undefined);return res.status(413).json({error:`Transcription input exceeds ${maxTranscriptionMB} MB limit`});}
  const providerUrl=process.env.WHISPER_API_URL; if(!providerUrl) { await unlink(req.file.path).catch(()=>undefined); return res.status(503).json({error:'WHISPER_API_URL is not configured'}); }
  let parsedProviderUrl:URL; try { parsedProviderUrl=new URL(providerUrl); } catch { await unlink(req.file.path).catch(()=>undefined); return res.status(503).json({error:'WHISPER_API_URL must be a valid HTTPS URL'}); }
  if(parsedProviderUrl.protocol!=='https:' && !(NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(parsedProviderUrl.hostname))) { await unlink(req.file.path).catch(()=>undefined); return res.status(503).json({error:'WHISPER_API_URL must use HTTPS in production'}); }
  try {
    const bytes=await readFile(req.file.path); const form=new FormData(); form.append('file',new Blob([new Uint8Array(bytes)],{type:req.file.mimetype}),req.file.originalname); form.append('response_format','verbose_json');
    const headers:Record<string,string>={}; if(process.env.WHISPER_API_TOKEN) headers.authorization=`Bearer ${process.env.WHISPER_API_TOKEN}`;
    const response=await fetch(providerUrl,{method:'POST',headers,body:form,signal:AbortSignal.timeout(180_000)}); const body=await response.json().catch(()=>({}));
    if(!response.ok) return res.status(502).json({error:'Transcription provider returned an error'});
    await audit(req,'ai.transcribe','media',req.file.filename); res.json(body);
  } catch(error) { logger.error('Transcription failed',error); res.status(502).json({error:'Transcription provider failed or timed out'}); }
  finally { await unlink(req.file.path).catch(()=>undefined); }
});

// Express error boundary: do not leak stack traces or internal filesystem paths to clients.
const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const message = err instanceof Error ? err.message : 'Unexpected error';
  const error = err as Error & { status?: number; statusCode?: number; code?: string };
  const statusFromError = Number(error.statusCode ?? error.status);
  const status = message.includes('File too large') || error.code === 'LIMIT_FILE_SIZE' ? 413
    : message.includes('CORS') || message.includes('Origin not allowed') ? 403
    : message.includes('Unsupported media') ? 415
    : error.code?.startsWith('LIMIT_') ? 400
    : err instanceof SyntaxError && statusFromError === 400 ? 400
    : Number.isInteger(statusFromError) && statusFromError >= 400 && statusFromError <= 599 ? statusFromError
    : 500;
  if (status >= 500) logger.error('Unhandled API error', err, { status });
  else logger.warn('Request rejected', { message, status });
  const publicMessage = status === 413 ? `File exceeds ${MAX_UPLOAD_MB} MB limit`
    : status === 415 ? 'Unsupported media file type'
    : status >= 500 ? 'Internal server error'
    : 'Request could not be processed';
  res.status(status).json({ error: publicMessage, requestId: res.getHeader('x-request-id') });
};
app.use(errorHandler);
const studioDist = join(ROOT, 'apps/studio-web/dist');
if (process.env.SERVE_FRONTEND === 'true' && existsSync(studioDist)) { app.use(express.static(studioDist, { index:false })); app.get('*', (_req,res) => res.sendFile(join(studioDist,'index.html'))); }

const server = createServer(app); const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  void (async()=>{
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (!url.pathname.startsWith('/ws/jobs/')) { socket.destroy(); return; }
    const token=url.searchParams.get('token')??''; const mockReq={header:(name:string)=>name.toLowerCase()==='authorization'?`Bearer ${token}`:undefined} as unknown as Request;
    const raw=principalFor(mockReq); const principal=await loadCurrentPrincipal(raw);
    if((!principal&&!devAuthBypass)||(raw&&!principal)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    const jobId=url.pathname.split('/').pop()??'';
    if(dbReady&&db&&jobId){const row=await db.query('SELECT user_id FROM render_jobs WHERE id=$1',[jobId]);const accountId=principal?.sub; if(!row.rowCount||(row.rows[0].user_id!==accountId&&!principal?.roles.includes('admin')&&principal?.source!=='service')){socket.write('HTTP/1.1 404 Not Found\r\n\r\n');socket.destroy();return;}}
    wss.handleUpgrade(request, socket, head, ws => { wss.emit('connection', ws, request); });
  })().catch(error=>{logger.warn('WebSocket auth failed',{error:error instanceof Error?error.message:String(error)});socket.destroy();});
});
wss.on('connection', (ws, request) => {
  const url=new URL(request.url??'/',`http://${request.headers.host??'localhost'}`); const id=url.pathname.split('/').pop()??''; let closed=false;
  const send=async()=>{ if(closed||ws.readyState!==ws.OPEN)return; try { const job=localJobs.get(id); if(job){ws.send(JSON.stringify(job));return;} if(renderQueue){const queued=await renderQueue.getJob(id); if(queued){const state=await queued.getState();const snapshot={id,status:state,progress:typeof queued.progress==='number'?queued.progress:0};ws.send(JSON.stringify(snapshot));}} } catch { /* transient read */ } };
  void send(); const timer=setInterval(()=>void send(),1500); ws.on('close',()=>{closed=true;clearInterval(timer);});
});
server.listen(PORT, () => logger.info('API Gateway listening', { port: PORT, queue: renderQueue ? 'redis' : 'local-only', persistence:dbReady?'postgresql':'development-memory',environment:NODE_ENV }));
const shutdown = async () => { logger.info('Shutting down API Gateway'); await new Promise<void>(resolveClose => server.close(() => resolveClose())); await renderQueue?.close(); await redis?.quit(); await db?.end(); process.exit(0); };
process.on('SIGINT', () => void shutdown()); process.on('SIGTERM', () => void shutdown());

async function verifyPassword(password:string, encoded:string):Promise<boolean> {
  const [algorithm,salt,hex]=encoded.split('$'); if(algorithm!=='scrypt'||!salt||!hex||!/^[0-9a-f]{128}$/i.test(hex)) return false;
  const actual=Buffer.from(await scrypt(password,salt,64) as Buffer); const expected=Buffer.from(hex,'hex'); return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
