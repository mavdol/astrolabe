# Extracts what the SVG renderer needs from the bundled Inter files into src/render/fonts/inter.json:
# for each weight, the outline and advance width of every character drawn, the tabular figures,
# and the kerning pairs. Nothing parses a font at run time.
#
# Run from the repository root after changing assets/fonts/:
#   uv run --no-project --with fonttools==4.60.1 python scripts/extract-font-data.py

import json
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT_FOLDER = Path("assets/fonts")
OUTPUT_PATH = Path("src/render/fonts/inter.json")
WEIGHTS = [400, 500, 600, 700]

CHARACTER_RANGES = [
    (0x0020, 0x007E),  # ASCII
    (0x00A0, 0x00FF),  # Latin-1: accents, ×, ±, ·, «»
    (0x2010, 0x2027),  # dashes, quotes, bullet, ellipsis
    (0x2030, 0x203A),
    (0x20AC, 0x20AC),  # euro
    (0x2122, 0x2122),
    (0x2190, 0x2193),  # arrows
    (0x2212, 0x2212),  # minus sign
]


def characters_in(font):
    cmap = font.getBestCmap()
    wanted = [code for first, last in CHARACTER_RANGES for code in range(first, last + 1)]
    return {chr(code): cmap[code] for code in wanted if code in cmap}


def outline(glyph_set, glyph_name):
    pen = SVGPathPen(glyph_set, ntos=lambda number: str(round(number)))
    glyph_set[glyph_name].draw(TransformPen(pen, (1, 0, 0, 1, 0, 0)))
    return pen.getCommands()


def tabular_substitutions(font):
    substitutions = {}
    gsub = font["GSUB"].table
    for feature_record in gsub.FeatureList.FeatureRecord:
        if feature_record.FeatureTag != "tnum":
            continue
        for lookup_index in feature_record.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[lookup_index]
            for subtable in lookup.SubTable:
                if lookup.LookupType == 7:
                    subtable = subtable.ExtSubTable
                substitutions.update(getattr(subtable, "mapping", {}))
    return substitutions


def first_x_advance(value_record):
    return getattr(value_record, "XAdvance", 0) if value_record is not None else 0


def kerning_pairs(font, glyph_names):
    """Horizontal kerning of the kern feature, from pair adjustments of both formats, extensions included."""
    gpos = font["GPOS"].table
    wanted = set(glyph_names)
    kerning = {}
    lookup_indexes = sorted(
        {index for record in gpos.FeatureList.FeatureRecord if record.FeatureTag == "kern" for index in record.Feature.LookupListIndex}
    )
    for lookup_index in lookup_indexes:
        lookup = gpos.LookupList.Lookup[lookup_index]
        for subtable in lookup.SubTable:
            if lookup.LookupType == 9:
                subtable = subtable.ExtSubTable
            if getattr(subtable, "LookupType", 2) != 2:
                continue
            covered = [name for name in subtable.Coverage.glyphs if name in wanted]
            if subtable.Format == 1:
                for left, pair_set in zip(subtable.Coverage.glyphs, subtable.PairSet):
                    if left not in wanted:
                        continue
                    for pair in pair_set.PairValueRecord:
                        if pair.SecondGlyph in wanted:
                            kerning.setdefault((left, pair.SecondGlyph), first_x_advance(pair.Value1))
            elif subtable.Format == 2:
                class_of_left = subtable.ClassDef1.classDefs
                class_of_right = subtable.ClassDef2.classDefs
                for left in covered:
                    row = subtable.Class1Record[class_of_left.get(left, 0)]
                    for right in wanted:
                        value = first_x_advance(row.Class2Record[class_of_right.get(right, 0)].Value1)
                        if value != 0:
                            kerning.setdefault((left, right), value)
    return {pair: value for pair, value in kerning.items() if value != 0}


def extract_weight(weight):
    font = TTFont(FONT_FOLDER / f"inter-latin-{weight}-normal.woff")
    glyph_set = font.getGlyphSet()
    advance_of = font["hmtx"].metrics
    characters = characters_in(font)
    tabular = tabular_substitutions(font)
    glyphs = {
        character: {"advance": advance_of[name][0], "path": outline(glyph_set, name)} for character, name in sorted(characters.items())
    }
    tabular_glyphs = {
        character: {"advance": advance_of[tabular[name]][0], "path": outline(glyph_set, tabular[name])}
        for character, name in sorted(characters.items())
        if name in tabular
    }
    name_to_character = {name: character for character, name in characters.items()}
    kerning = {
        name_to_character[left] + name_to_character[right]: value
        for (left, right), value in sorted(kerning_pairs(font, list(characters.values())).items())
    }
    return font, {"glyphs": glyphs, "tabular": tabular_glyphs, "kerning": kerning}


def main():
    weights = {}
    for weight in WEIGHTS:
        font, data = extract_weight(weight)
        weights[str(weight)] = data
    head, hhea, os2 = font["head"], font["hhea"], font["OS/2"]
    output = {
        "family": "Inter",
        "copyright": "Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)",
        "license": "SIL Open Font License, Version 1.1; see assets/fonts/OFL.txt",
        "source": "@fontsource/inter 5.3.0, latin subset",
        "units_per_em": head.unitsPerEm,
        "ascender": hhea.ascent,
        "descender": hhea.descent,
        "cap_height": os2.sCapHeight,
        "weights": weights,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    for weight, data in weights.items():
        print(f"{weight}: {len(data['glyphs'])} glyphs, {len(data['tabular'])} tabular, {len(data['kerning'])} kerning pairs")
    print(f"wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size // 1024} KB)")


main()
