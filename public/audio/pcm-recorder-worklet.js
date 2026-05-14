/**
 * AudioWorkletProcessor that forwards mic input as Float32 frames to the
 * main thread.
 *
 * Why this lives in /public instead of a TS file: AudioWorklets execute in
 * a separate `AudioWorkletGlobalScope` and must be loaded via a URL. Next's
 * static asset pipeline serves files under /public verbatim, which is the
 * simplest way to get a stable URL without webpack-specific worklet loaders.
 *
 * The processor batches `BATCH_SIZE` (4096 samples, ~85ms at 48 kHz) of
 * input before posting to the main thread to keep message overhead low.
 * The main thread is responsible for resampling and Int16 conversion (see
 * src/lib/realtime/resample.ts) — those routines need WASM-free vanilla
 * math which is easier to test outside the worklet sandbox.
 */

class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batchSize = 4096;
    this.buffer = new Float32Array(this.batchSize);
    this.bufferIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    // Mono downmix: average channels if stereo, take channel 0 otherwise.
    const channel0 = input[0];
    if (!channel0) return true;

    for (let i = 0; i < channel0.length; i++) {
      let sample = channel0[i];
      if (input.length > 1) {
        let sum = sample;
        for (let c = 1; c < input.length; c++) {
          sum += input[c][i];
        }
        sample = sum / input.length;
      }
      this.buffer[this.bufferIndex++] = sample;
      if (this.bufferIndex >= this.batchSize) {
        // Transfer a copy so we can keep recording into the same buffer.
        const out = new Float32Array(this.buffer);
        this.port.postMessage(
          { type: "pcm", data: out.buffer, sampleRate: sampleRate },
          [out.buffer],
        );
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-recorder-worklet", PcmRecorderProcessor);
