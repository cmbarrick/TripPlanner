import { Platform } from 'react-native';

// Web-first voice capture using the browser MediaRecorder API. Native (expo-audio) recording is a
// follow-up; we cast through `any` so this compiles without DOM lib types in the RN tsconfig.

const g: any = globalThis as any;

export const audioRecordingSupported =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  !!(navigator as any).mediaDevices?.getUserMedia &&
  typeof g.MediaRecorder !== 'undefined';

export const audioPlaybackSupported = Platform.OS === 'web' && typeof g.Audio !== 'undefined';

export interface AudioRecording {
  blob: Blob;
  durationSeconds: number;
  mimeType: string;
  fileName: string;
}

export interface Recorder {
  start(): Promise<void>;
  stop(): Promise<AudioRecording>;
  cancel(): void;
}

export function createRecorder(): Recorder {
  let mediaRecorder: any = null;
  let chunks: any[] = [];
  let stream: any = null;
  let startedAt = 0;

  return {
    async start() {
      stream = await (navigator as any).mediaDevices.getUserMedia({ audio: true });
      const MR = g.MediaRecorder;
      const mimeType = pickMimeType(MR);
      mediaRecorder = mimeType ? new MR(stream, { mimeType }) : new MR(stream);
      chunks = [];
      mediaRecorder.ondataavailable = (e: any) => {
        if (e?.data?.size > 0) chunks.push(e.data);
      };
      mediaRecorder.start();
      startedAt = Date.now();
    },

    stop() {
      return new Promise<AudioRecording>((resolve, reject) => {
        if (!mediaRecorder) {
          reject(new Error('Not recording'));
          return;
        }
        mediaRecorder.onstop = () => {
          const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
          const mimeType: string = mediaRecorder.mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type: mimeType });
          stopTracks(stream);
          resolve({ blob, durationSeconds, mimeType, fileName: fileNameFor(mimeType) });
        };
        mediaRecorder.stop();
      });
    },

    cancel() {
      try {
        mediaRecorder?.stop();
      } catch {
        // ignore
      }
      stopTracks(stream);
    },
  };
}

function stopTracks(stream: any) {
  stream?.getTracks?.().forEach((t: any) => t.stop());
}

function pickMimeType(MR: any): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (!MR?.isTypeSupported) return undefined;
  return candidates.find((c) => MR.isTypeSupported(c));
}

function fileNameFor(mime: string): string {
  if (mime.includes('mp4')) return 'voice-note.mp4';
  if (mime.includes('ogg')) return 'voice-note.ogg';
  if (mime.includes('webm')) return 'voice-note.webm';
  return 'voice-note.dat';
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
