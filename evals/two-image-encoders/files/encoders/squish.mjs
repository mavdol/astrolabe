#!/usr/bin/env node
// squish: block transform with a perceptual quantizer and an entropy coder tuned for photos.
import { encode, qualityArgument } from "./encode.mjs";

const quality = qualityArgument(80);

encode({ encoder: "squish", step: 1 + (100 - quality) * 0.18, bitsPerCoefficient: 1.04 });
