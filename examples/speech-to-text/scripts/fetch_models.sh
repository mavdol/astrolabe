#!/bin/sh
# Download the five official ggml Whisper models and check them against the SHA-1 list
# published in https://huggingface.co/ggerganov/whisper.cpp (README).
set -eu
cd "$(dirname "$0")/../models"
for m in tiny base small medium large-v3-turbo; do
  [ -f "ggml-$m.bin" ] || curl -fL -o "ggml-$m.bin" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$m.bin"
done
shasum -a 1 -c <<SUMS
bd577a113a864445d4c299885e0cb97d4ba92b5f  ggml-tiny.bin
465707469ff3a37a2b9b8d8f89f2f99de7299dac  ggml-base.bin
55356645c2b361a969dfd0ef2c5a50d530afd8d5  ggml-small.bin
fd9727b6e1217c2f614f9b698455c4ffd82463b4  ggml-medium.bin
4af2b29d7ec73d781377bfd1758ca957a807e941  ggml-large-v3-turbo.bin
SUMS
