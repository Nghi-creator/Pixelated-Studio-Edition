export const BLACK_VIDEO_SAMPLE_THRESHOLD = 6;
export const FALLBACK_BAD_SAMPLE_COUNT = 3;
export const FALLBACK_HEALTHY_SAMPLE_COUNT = 4;
export const BLACK_FRAME_FAILURE_SAMPLE_COUNT = 12;

export type StreamPlaybackSampleResult = {
  fallbackActive: boolean;
  shouldReportStall: boolean;
};

export function createStreamPlaybackSampleTracker() {
  let blackSamples = 0;
  let healthySamples = 0;
  let fallbackActive = false;
  let stallReported = false;

  return {
    recordSample(isBlackSample: boolean): StreamPlaybackSampleResult {
      if (isBlackSample) {
        blackSamples += 1;
        healthySamples = 0;
      } else {
        blackSamples = 0;
        healthySamples += 1;
      }

      if (blackSamples >= FALLBACK_BAD_SAMPLE_COUNT) {
        fallbackActive = true;
      } else if (healthySamples >= FALLBACK_HEALTHY_SAMPLE_COUNT) {
        fallbackActive = false;
        stallReported = false;
      }

      const shouldReportStall =
        blackSamples >= BLACK_FRAME_FAILURE_SAMPLE_COUNT && !stallReported;
      if (shouldReportStall) {
        stallReported = true;
      }

      return {
        fallbackActive,
        shouldReportStall,
      };
    },
  };
}
