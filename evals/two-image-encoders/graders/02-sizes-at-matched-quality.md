---
type: llm
focus: { source: file, path: RESULTS.md }
---

PASS if RESULTS.md compares file sizes at matched visual quality (the same SSIM, or size against SSIM over several quality settings) and says that the two encoders' quality settings are not on the same scale, so the same --quality value is not a fair comparison.
FAIL if sizes are compared only at the same --quality setting, or if quality is not measured at all.
