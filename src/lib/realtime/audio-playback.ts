/**
 * Web Audio sink for Int16 PCM streamed by the Gemini provider.
 *
 * Gemini Live emits assistant audio as base64-encoded PCM chunks at 24 kHz
 * (see provider parsing). We convert each chunk to Float32 normalized
 * samples and enqueue an AudioBufferSourceNode that plays directly after
 * the previous one — a simple "play next when current ends" queue is good
 * enough for a demo. A small look-ahead avoids hairline gaps at sub-50ms
 * chunk boundaries by scheduling on a monotonic `nextStartTime` rather
 * than relying on `onended` callbacks (which have higher jitter).
 *
 * OpenAI's WebRTC transport plays audio via a media track and never calls
 * into this module — so this is provider-specific glue, not shared
 * infrastructure.
 */

// Use 32768 (2^15) — the magnitude of Int16's negative end — so the most
// negative sample (-32768) maps exactly to -1.0. Dividing by 32767 (Int16's
// max positive) would push -32768 to -1.0000305..., a hairline clip on every
// silent-trough sample. The asymmetry (+32767 → 0.99996...) is inaudible.
const INT16_MAGNITUDE = 0x8000;

export interface AudioPlaybackHandle {
  /** Schedule an Int16 PCM chunk for playback. */
  enqueue(pcm: Int16Array, sampleRate: number): void;
  /** Stop all in-flight audio and drop the queue. Used for barge-in. */
  flush(): void;
  /** Release the audio context. */
  dispose(): Promise<void>;
}

function int16ToFloat32(pcm: Int16Array): Float32Array<ArrayBuffer> {
  // Allocate the backing ArrayBuffer explicitly so the resulting view is
  // typed as `Float32Array<ArrayBuffer>` (vs `ArrayBufferLike`), which is
  // what `AudioBuffer.copyToChannel` expects under TS 5.7+ stricter typing.
  const out = new Float32Array(new ArrayBuffer(pcm.length * 4));
  for (let i = 0; i < pcm.length; i++) {
    out[i] = pcm[i] / INT16_MAGNITUDE;
  }
  return out;
}

export function createAudioPlayback(): AudioPlaybackHandle {
  if (typeof window === "undefined") {
    throw new Error("createAudioPlayback must be called in the browser");
  }
  // The cast covers Safari's `webkitAudioContext` prefix — TS lib.dom doesn't
  // declare it, but Safari needs it for AudioContext support.
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("AudioContext is not supported in this browser");
  }

  const context = new AudioContextCtor();
  // Chrome's autoplay policy can leave a fresh AudioContext suspended when
  // it's constructed after async hops away from the originating user gesture.
  // We resume() best-effort; the audio context tolerates this being awaited
  // post-construction so we don't need to block the caller on it.
  if (context.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
  // Track each active source so flush() can stop them mid-flight. We keep
  // them in a Set rather than an array so `delete` on `onended` is O(1).
  const activeSources = new Set<AudioBufferSourceNode>();
  let nextStartTime = 0;

  return {
    enqueue(pcm: Int16Array, sampleRate: number) {
      if (pcm.length === 0) return;
      // The browser only allows a small set of sample rates per buffer; 24
      // kHz is one of them. If the provider ever ships a different rate,
      // the createBuffer call below will resample implicitly on play.
      const buffer = context.createBuffer(1, pcm.length, sampleRate);
      buffer.copyToChannel(int16ToFloat32(pcm), 0);

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);

      const now = context.currentTime;
      // 0.05s look-ahead absorbs scheduling jitter without adding audible
      // latency. If we're behind the current clock, start immediately.
      const startAt = Math.max(now + 0.05, nextStartTime);
      source.start(startAt);
      nextStartTime = startAt + buffer.duration;

      activeSources.add(source);
      source.onended = () => {
        activeSources.delete(source);
      };
    },
    flush() {
      for (const src of activeSources) {
        try {
          src.stop();
        } catch {
          /* already stopped — fine */
        }
      }
      activeSources.clear();
      nextStartTime = context.currentTime;
    },
    async dispose() {
      for (const src of activeSources) {
        try {
          src.stop();
        } catch {
          /* ignore */
        }
      }
      activeSources.clear();
      await context.close().catch(() => undefined);
    },
  };
}
