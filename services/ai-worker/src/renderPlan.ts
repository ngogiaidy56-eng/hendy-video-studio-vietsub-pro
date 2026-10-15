import { basename, extname } from 'node:path';
import type { RenderManifest, TimelineClip, TimelineTrack } from '@hendy/shared-types';

export type ResolvedClip = { track: TimelineTrack; clip: TimelineClip; filePath: string; inputIndex: number; hasAudio: boolean; isStill: boolean };
export type RenderPlan = { args: string[]; duration: number; outputName: string; inputCount: number; audioInputCount: number; filterComplex: string };

function num(value: number) { if (!Number.isFinite(value)) throw new Error('A timeline value is not finite'); return String(Number(value.toFixed(4))); }
function filterEscapePath(path: string) { return path.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'").replace(/,/g,'\\,').replace(/\[/g,'\\[').replace(/\]/g,'\\]'); }
function colorToAss(color: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return alpha ? '&HFF000000' : '&H00FFFFFF';
  const hex = m[1]; const r=hex.slice(0,2),g=hex.slice(2,4),b=hex.slice(4,6); return `&H${alpha.toString(16).padStart(2,'0').toUpperCase()}${b}${g}${r}`;
}
function assTime(seconds: number) { const centiseconds=Math.round(Math.max(0,seconds)*100); const h=Math.floor(centiseconds/360000); const m=Math.floor((centiseconds%360000)/6000); const s=Math.floor((centiseconds%6000)/100); const cs=centiseconds%100; return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`; }
function assText(text: string) { return text.replace(/\r\n?/g,'\n').replace(/\n/g,'\\N').replace(/\{/g,'\\{').replace(/\}/g,'\\}').replace(/\u0000/g,''); }
export function buildAss(manifest: RenderManifest) {
  const styles: string[]=[]; const events: string[]=[];
  const defaultStyle={fontFamily:'Arial',fontSize:28,color:'#ffffff',outlineColor:'#000000',outlineWidth:2,bold:true,italic:false,alignment:2,marginV:35};
  const unique=new Map<string,string>();
  for(let i=0;i<manifest.subtitles.length;i++) {
    const cue=manifest.subtitles[i]; const style={...defaultStyle,...cue.style}; const fingerprint=JSON.stringify(style); let styleName=unique.get(fingerprint);
    if(!styleName) { styleName=`CueStyle${unique.size+1}`; unique.set(fingerprint,styleName); styles.push(`Style: ${styleName},${String(style.fontFamily).replace(/[,\r\n]/g,' ')},${Math.max(8,Math.min(128,Number(style.fontSize)||28))},${colorToAss(String(style.color))},${colorToAss(String(style.color))},${colorToAss(String(style.outlineColor))},&H80000000,${style.bold?-1:0},${style.italic?-1:0},0,0,100,100,0,0,1,${Math.max(0,Math.min(12,Number(style.outlineWidth)||0))},0,${Number(style.alignment)||2},20,20,${Number(style.marginV)||35},1`); }
    events.push(`Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},${styleName},,0,0,0,,${assText(cue.text)}`);
  }
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${manifest.width}\nPlayResY: ${manifest.height}\nScaledBorderAndShadow: yes\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${styles.join('\n')}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`;
}
function exprForKeyframes(clip: TimelineClip, property: 'x'|'y'|'scale'|'opacity', defaultValue: number, pixelScale = 1, timelineTime = false) {
  const keyframes=(clip.keyframes??[]).filter(k=>typeof k[property]==='number').sort((a,b)=>a.time-b.time);
  if(!keyframes.length) return num(defaultValue*pixelScale);
  const points=[...keyframes.map(k=>({time:k.time,value:k[property] as number}))];
  if(points[0].time>0) points.unshift({time:0,value:defaultValue});
  const unique=points.filter((p,i)=>i===0||p.time!==points[i-1].time);
  let expression=num(unique[unique.length-1].value*pixelScale);
  for(let i=unique.length-2;i>=0;i--) {
    const a=unique[i],b=unique[i+1];
    const t0=num(a.time),t1=num(b.time),v0=num(a.value*pixelScale),v1=num(b.value*pixelScale);
    const relative=timelineTime?`(t-${num(clip.start)})`:'t';
    expression=`if(lt(${relative},${t1})\\,${v0}+(${v1}-${v0})*(${relative}-${t0})/max(0.001\\,${t1}-${t0})\\,${expression})`;
  }
  return expression;
}
function makeClipFilter(input: ResolvedClip, manifest: RenderManifest, label: string) {
  const {clip,track}=input; const width=manifest.width,height=manifest.height;
  const isOverlay=track.kind==='overlay';
  const transform=clip.transform??(isOverlay?{x:0.66,y:0.06,width:0.30,height:0.30,opacity:1}:{x:0,y:0,width:1,height:1,opacity:1});
  const rectW=Math.max(2,Math.round(width*transform.width/2)*2); const rectH=Math.max(2,Math.round(height*transform.height/2)*2);
  const filters:string[]=[`trim=start=${num(clip.sourceStart??0)}:duration=${num(clip.duration)}`,'setpts=PTS-STARTPTS'];
  if(transform.crop) filters.push(`crop=w=iw*${num(transform.crop.width)}:h=ih*${num(transform.crop.height)}:x=iw*${num(transform.crop.x)}:y=ih*${num(transform.crop.y)}`);
  filters.push(`scale=${rectW}:${rectH}:force_original_aspect_ratio=decrease`,`pad=${rectW}:${rectH}:(ow-iw)/2:(oh-ih)/2:color=black@0`,`setsar=1`,`fps=${num(manifest.fps)}`,'format=rgba');
  const scalePoints=(clip.keyframes??[]).filter(k=>typeof k.scale==='number').sort((a,b)=>a.time-b.time);
  if(scalePoints.length) {
    const scaleExpr=exprForKeyframes(clip,'scale',1);
    filters.push(`scale=w='iw*(${scaleExpr})':h='ih*(${scaleExpr})':eval=frame`);
  }
  const start=clip.start; const end=clip.start+clip.duration;
  const opacity=exprForKeyframes(clip,'opacity',transform.opacity??1);
  if((clip.keyframes??[]).some(k=>typeof k.opacity==='number')) filters.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${opacity})`);
  else if((transform.opacity??1)<1) filters.push(`colorchannelmixer=aa=${num(transform.opacity??1)}`);
  if(clip.transitionIn && clip.transitionIn.duration>0) filters.push(`fade=t=in:st=0:d=${num(clip.transitionIn.duration)}:alpha=1`);
  if(clip.transitionOut && clip.transitionOut.duration>0) filters.push(`fade=t=out:st=${num(Math.max(0,clip.duration-clip.transitionOut.duration))}:d=${num(clip.transitionOut.duration)}:alpha=1`);
  filters.push(`setpts=PTS-STARTPTS+${num(start)}/TB`);
  const baseX=transform.x*width,baseY=transform.y*height;
  const xExpr=exprForKeyframes(clip,'x',transform.x,width,true); const yExpr=exprForKeyframes(clip,'y',transform.y,height,true);
  return {filter:`[${input.inputIndex}:v]${filters.join(',')}[${label}]`,x: (clip.keyframes??[]).some(k=>typeof k.x==='number')?`'${xExpr}'`:num(baseX),y:(clip.keyframes??[]).some(k=>typeof k.y==='number')?`'${yExpr}'`:num(baseY),start,end};
}
export function buildRenderPlan(manifest: RenderManifest, inputs: ResolvedClip[], outputName: string, assPath?: string): RenderPlan {
  if(!inputs.some(input=>input.track.kind==='video'&&input.clip.assetId)) throw new Error('A video track must contain at least one uploaded video clip.');
  const duration=Math.max(0.1,...inputs.map(input=>input.clip.start+input.clip.duration));
  const filters:string[]=[`color=c=black:s=${manifest.width}x${manifest.height}:r=${num(manifest.fps)}:d=${num(duration)},format=rgba[base0]`];
  const videos=inputs.filter(input=>input.track.kind==='video'||input.track.kind==='overlay').sort((a,b)=>manifest.tracks.indexOf(a.track)-manifest.tracks.indexOf(b.track)||a.clip.start-b.clip.start);
  let current='base0';
  videos.forEach((input,index)=>{
    const label=`clip${index}`; const next=`base${index+1}`; const info=makeClipFilter(input,manifest,label);
    filters.push(info.filter);
    filters.push(`[${current}][${label}]overlay=x=${info.x}:y=${info.y}:eof_action=pass:shortest=0:enable='between(t,${num(info.start)},${num(info.end)})'[${next}]`);
    current=next;
  });
  const audioInputs: {label:string;track:TimelineTrack;start:number}[]=[];
  inputs.filter(input=>input.hasAudio&&!input.track.muted&&input.track.kind!=='subtitle').forEach((input,index)=>{
    const label=`aud${index}`; const clip=input.clip; const volume=Math.max(0,Math.min(2,(input.track.volume??1)*(clip.volume??1)));
    filters.push(`[${input.inputIndex}:a]atrim=start=${num(clip.sourceStart??0)}:duration=${num(clip.duration)},asetpts=PTS-STARTPTS,volume=${num(volume)},adelay=${Math.round(clip.start*1000)}:all=1,apad=whole_dur=${num(duration)},atrim=duration=${num(duration)}[${label}]`);
    audioInputs.push({label,track:input.track,start:clip.start});
  });
  let audioOutput='';
  const duck=manifest.export.audioDucking;
  const bgm=audioInputs.filter(a=>a.track.kind==='audio'&&/(bgm|music|background|nhạc nền|nhac nen)/i.test(a.track.name));
  const sidechain=audioInputs.filter(a=>!bgm.includes(a)&&/(voice|tts|narr|dialog|speech|giọng|giong|lời thoại|loi thoai)/i.test(a.track.name));
  const mixedOthers=audioInputs.filter(a=>!bgm.includes(a));
  if(duck?.enabled&&bgm.length&&sidechain.length) {
    filters.push(`${bgm.map(a=>`[${a.label}]`).join('')}amix=inputs=${bgm.length}:duration=longest:normalize=0[bgmMix]`);
    filters.push(`${sidechain.map(a=>`[${a.label}]`).join('')}amix=inputs=${sidechain.length}:duration=longest:normalize=0[voiceMix]`);
    filters.push(`[bgmMix][voiceMix]sidechaincompress=threshold=${num(Math.pow(10,duck.thresholdDb/20))}:ratio=${num(duck.ratio)}:attack=${num(duck.attackMs)}:release=${num(duck.releaseMs)}[duckedBgm]`);
    const others=mixedOthers.filter(a=>!sidechain.includes(a)); const labels=[...others.map(a=>`[${a.label}]`),'[duckedBgm]'];
    filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0[aout]`); audioOutput='aout';
  } else if(audioInputs.length) {
    filters.push(`${audioInputs.map(a=>`[${a.label}]`).join('')}amix=inputs=${audioInputs.length}:duration=longest:normalize=0,alimiter=limit=0.95[aout]`); audioOutput='aout';
  }
  if(manifest.export.burnSubtitles&&assPath) {
    const path=filterEscapePath(assPath);
    filters.push(`[${current}]subtitles='${path}'[vfinal]`); current='vfinal';
  }
  const args:string[]=['-hide_banner','-y'];
  // Inputs are passed separately from filter expressions; paths never go through a shell.
  for(const input of inputs) {
    if(input.isStill) args.push('-loop','1','-t',num(input.clip.duration));
    args.push('-i',input.filePath);
  }
  args.push('-filter_complex',filters.join(';'),'-map',`[${current}]`);
  if(audioOutput) args.push('-map','[aout]');
  const quality=manifest.export.quality==='high'?'18':manifest.export.quality==='draft'?'28':'23';
  args.push('-t',num(duration),'-r',num(manifest.fps),'-c:v','libx264','-preset',process.env.FFMPEG_PRESET??'veryfast','-crf',quality,'-pix_fmt','yuv420p');
  if(audioOutput) args.push('-c:a','aac','-b:a','192k'); else args.push('-an');
  args.push('-movflags','+faststart','-max_muxing_queue_size','2048',outputName);
  return {args,duration,outputName,inputCount:inputs.length,audioInputCount:audioInputs.length,filterComplex:filters.join(';')};
}
export function safeAssetName(assetId:string) {
  const name=basename(assetId);
  if(name!==assetId||!/^[-a-zA-Z0-9_.]{1,255}$/.test(name)||['.','..'].includes(name)||!extname(name)) throw new Error('Invalid asset identifier in render manifest.');
  return name;
}
