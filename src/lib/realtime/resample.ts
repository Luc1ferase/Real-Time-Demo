/**
 * Linear downsample of mono Float32 PCM (the shape `getUserMedia` exposes
 * through an `AudioWorkletProcessor` or `ScriptProcessorNode`) into 16-bit
 * little-endian PCM at a target sample rate.
 *
 * Both providers want signed 16-bit PCM at runtime — OpenAI at 24 kHz,
 * Gemini at 16 kHz. The math here is the same for both; only the target
 * rate differs.
 *
 * This file is intentionally framework-free so it can run in an
 * `AudioWorkletGlobalScope` (no `window`/`document` deps). PR3 wires it
 * into a worklet.
 */

const INT16_MAX = 0x7fff;

function clampSample(f: number): number {
  if (f > 1) return 1;
  if (f < -1) return -1;
  return f;
}

/**
 * Downsample a Float32 buffer recorded at `inputRate` to a Int16 buffer at
 * `targetRate`. Linear interpolation between samples — good enough for
 * speech; not music-grade. If `inputRate === targetRate` the function just
 * converts the float buffer to int16.
 */
export function resampleFloat32ToInt16(
  input: Float32Array,
  inputRate: number,
  targetRate: number,
): Int16Array {
  if (inputRate <= 0 || targetRate <= 0) {
    throw new Error("Sample rates must be positive");
  }
  if (inputRate === targetRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      out[i] = Math.round(clampSample(input[i]) * INT16_MAX);
    }
    return out;
  }

  const ratio = inputRate / targetRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Int16Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIndex - i0;
    const sample = input[i0] * (1 - frac) + input[i1] * frac;
    out[i] = Math.round(clampSample(sample) * INT16_MAX);
  }

  return out;
}
