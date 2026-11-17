#!/usr/bin/env node
// pixo: block transform with a uniform quantizer.
import { encode, qualityArgument } from "./encode.mjs";

const quality = qualityArgument(80);

encode({ encoder: "pixo", step: 1 + (100 - quality) * 0.12, bitsPerCoefficient: 1.0 });
