/**
 * Browser microphone capture pipeline for the Gemini provider.
 *
 * OpenAI's WebRTC transport handles mic capture internally — calling
 * `getUserMedia` again would either steal the SDK's stream or trigger a
 * double-permission prompt. So this module is wired only when the active
 * provider is Gemini (which uses a raw WebSocket and needs us to push PCM
 * chunks via `session.sendUserAudio`).
 *
 * Pipeline:
 *   getUserMedia → AudioContext → MediaStreamSource → AudioWorkletNode
 *   (pcm-recorder-worklet.js) → main thread → resampleFloat32ToInt16 →
 *   onChunk(Int16Array @ targetSampleRate)
 *
 * `start()` resolves once the worklet is wired and audio frames are
 * flowing. `stop()` releases the mic and audio context. EchoCancellation
 * and noiseSuppression are requested — without them, voice agents pick up
 * their own audio and feed back.
 */

import { resampleFloat32ToInt16 } from "./resample";

export interface AudioCaptureOptions {
  /** Target PCM sample rate (16 kHz for Gemini, 24 kHz for OpenAI). */
  targetSampleRate: number;
  /** Invoked for every PCM batch (~85 ms at 48 kHz capture). */
  onChunk(chunk: Int16Array): void;
  /** Optional error handler — fires for permission denial or worklet load failures. */
  onError?(error: Error): void;
}

export interface AudioCaptureHandle {
  /** Release mic + audio context. Idempotent. */
  stop(): Promise<void>;
}

const WORKLET_URL = "/audio/pcm-recorder-worklet.js";

export async function startAudioCapture(
  options: AudioCaptureOptions,
): Promise<AudioCaptureHandle> {
  if (typeof window === "undefined") {
    throw new Error("startAudioCapture must be called in the browser");
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("MediaDevices API is not available in this environment");
  }

  // EC/NS are critical — without echoCancellation the agent's own audio
  // bounces back through the mic as if the user is talking and you get an
  // immediate feedback loop on the second turn.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  // The AudioContext picks the device's native sample rate (typically 48 kHz);
  // we resample on the main thread to whatever the provider requires.
  // The cast covers Safari's `webkitAudioContext` prefix — TS lib.dom doesn't
  // declare it, but Safari needs it for AudioContext support.
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("AudioContext is not supported in this browser");
  }
  const audioContext = new AudioContextCtor();
  // Chrome's autoplay policy can start a freshly-constructed AudioContext in
  // `suspended` state if it isn't created during a synchronous user gesture.
  // Our call chain (Start click → setPhase → effect → connect await → effect →
  // here) crosses several await boundaries by the time we get here, so an
  // explicit resume() is the safe way to guarantee the worklet's clock runs.
  if (audioContext.state === "suspended") {
    await audioContext.resume().catch(() => undefined);
  }

  try {
    await audioContext.audioWorklet.addModule(WORKLET_URL);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    await audioContext.close().catch(() => undefined);
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load audio worklet (${WORKLET_URL}): ${cause}`);
  }

  const source = audioContext.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(audioContext, "pcm-recorder-worklet");

  worklet.port.onmessage = (event: MessageEvent) => {
    const msg = event.data as {
      type?: string;
      data?: ArrayBuffer;
      sampleRate?: number;
    };
    if (msg.type !== "pcm" || !msg.data) return;
    const inputRate = msg.sampleRate ?? audioContext.sampleRate;
    const floatBuf = new Float32Array(msg.data);
    try {
      const int16 = resampleFloat32ToInt16(
        floatBuf,
        inputRate,
        options.targetSampleRate,
      );
      options.onChunk(int16);
    } catch (err) {
      options.onError?.(
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  };

  source.connect(worklet);
  // We do NOT connect the worklet to the destination — that would route mic
  // audio to the speakers and cause an immediate howl. The worklet is a
  // pure data tap.

  let stopped = false;
  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      try {
        worklet.port.onmessage = null;
        source.disconnect();
        worklet.disconnect();
      } catch {
        /* swallow — disconnect of an already-stopped node throws */
      }
      stream.getTracks().forEach((t) => t.stop());
      await audioContext.close().catch(() => undefined);
    },
  };
}
