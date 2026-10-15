import { reduceSamplesToBars } from './audioWaveformCore';

/**
 * Decode a local audio clip and generate a compact waveform in a Web Worker.
 * Audio longer than ten minutes is intentionally skipped to cap decoded-memory use.
 */
export async function buildAudioWaveform(file: File, bars = 120): Promise<Float32Array> {
  if (!file.type.startsWith('audio/')) throw new Error('Chỉ hỗ trợ tạo waveform cho tệp audio.');
  if (file.size > 40 * 1024 * 1024) throw new Error('Waveform chỉ xử lý tệp audio tối đa 40 MB.');
  if (!Number.isInteger(bars) || bars < 1 || bars > 512) throw new RangeError('Số cột waveform không hợp lệ.');
  if (typeof window === 'undefined' || typeof Worker === 'undefined' || !window.AudioContext) {
    throw new Error('Trình duyệt không hỗ trợ Web Audio Worker.');
  }

  const knownDuration = await readAudioMetadataDuration(file);
  if (knownDuration > 600) throw new Error('Audio dài hơn 10 phút; hãy dùng đoạn ngắn hơn để tạo waveform.');

  const context = new AudioContext();
  let worker: Worker | undefined;
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration > 600) throw new Error('Audio dài hơn 10 phút; hãy dùng đoạn ngắn hơn để tạo waveform.');
    const channel = decoded.getChannelData(0);
    if (!channel.length) throw new Error('Không có dữ liệu âm thanh để phân tích.');

    // Downsample to at most 200k peak samples before transferring the buffer.
    const stride = Math.max(1, Math.ceil(channel.length / 200_000));
    const compact = new Float32Array(Math.ceil(channel.length / stride));
    for (let i = 0; i < compact.length; i++) {
      let peak = 0;
      const start = i * stride;
      const end = Math.min(channel.length, start + stride);
      for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(channel[j]));
      compact[i] = peak;
    }

    return await new Promise<Float32Array>((resolve, reject) => {
      worker = new Worker(new URL('../workers/audioWaveWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ type?: string; bars?: Float32Array }>) => {
        if (event.data?.type !== 'waveform' || !event.data.bars) {
          reject(new Error('Worker trả về dữ liệu waveform không hợp lệ.'));
          return;
        }
        resolve(event.data.bars);
      };
      worker.onerror = () => reject(new Error('Không thể phân tích waveform trong worker.'));
      worker.postMessage({ type: 'sample', samples: compact, bars }, [compact.buffer]);
    });
  } finally {
    worker?.terminate();
    await context.close().catch(() => undefined);
  }
}


/** Read container metadata before PCM decoding, preventing very long compressed files from allocating huge buffers. */
function readAudioMetadataDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    let settled = false;
    const cleanup = () => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
    };
    audio.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      const duration = audio.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) reject(new Error('Không đọc được thời lượng audio.'));
      else resolve(duration);
    };
    audio.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Không đọc được metadata audio; hãy dùng WAV, MP3 hoặc M4A được trình duyệt hỗ trợ.'));
    };
    audio.src = url;
    audio.load();
  });
}
