# shop-images

Product photos for the shop, and the tools we use to prepare them.

- `images/`: the current product photos, in our `.photo` capture format.
- `encoders/`: two encoders we are evaluating. Both take `--quality=0-100` (default 80): `node encoders/pixo.mjs images/boots.photo out/boots.pixo --quality=80`.
- `tools/ssim.mjs`: compares an encoded photo with its original (`node tools/ssim.mjs images/boots.photo out/boots.pixo`); 1 means identical.
