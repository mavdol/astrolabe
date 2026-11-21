# Inter

The README card draws its text as paths with Inter, so it looks the same on every device.

- Source: `@fontsource/inter` 5.3.0, latin subset, weights 400, 500, 600 and 700 (`.woff`).
- Licence: SIL Open Font License 1.1, in `OFL.txt`. Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter).

The renderer reads no font at run time. `scripts/extract-font-data.py` turns these files into `src/render/fonts/inter.json`: outlines and advance widths of the characters drawn, tabular figures and kerning pairs. Run it after changing a file here:

```bash
uv run --no-project --with fonttools==4.60.1 python scripts/extract-font-data.py
```

# Geist Mono

The site sets its labels, ticks and figures in Geist Mono.

- Source: the `geist` package 1.9.2, weights 400 and 500, subset to Latin and the signs the page uses (`pyftsubset`, `.woff2`).
- Licence: SIL Open Font License 1.1, in `OFL-Geist.txt`. Copyright 2023 Vercel, in collaboration with basement.studio.
