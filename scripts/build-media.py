# /// script
# requires-python = ">=3.9"
# dependencies = ["pillow"]
# ///
"""Turns the frames from scripts/record.js into the README media.

    npx electron scripts/record.js /tmp/pet-frames
    uv run scripts/build-media.py /tmp/pet-frames docs/images

Writes docs/images/tour.gif (on a flat cream card) and docs/images/state-<name>.png
(transparent, so they sit on GitHub's light and dark pages alike).
"""
import glob
import sys

from PIL import Image

STATES = ["thinking", "typing", "searching", "reading", "waiting", "sleeping"]
FPS = 12
# A flat fill: gradients band once the GIF palette is applied.
BACKGROUND = (246, 238, 228)


def union_bbox(images, threshold=10):
    box = None
    for im in images:
        b = im.getchannel("A").point(lambda a: 255 if a > threshold else 0).getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box


def padded(box, pad, size):
    return (max(0, box[0] - pad), max(0, box[1] - pad), min(size[0], box[2] + pad), min(size[1], box[3] + pad))


def main(src, out):
    frames = [Image.open(f).convert("RGBA") for f in sorted(glob.glob(f"{src}/tour-*.png"))]
    crop = padded(union_bbox(frames), 24, frames[0].size)
    card = Image.new("RGB", (crop[2] - crop[0], crop[3] - crop[1]), BACKGROUND)
    rgb = []
    for im in frames:
        f = card.copy()
        part = im.crop(crop)
        f.paste(part, (0, 0), part)
        rgb.append(f)

    # One palette shared by all frames, sampled across the tour, avoids flicker.
    sample = rgb[:: max(1, len(rgb) // 10)][:10]
    sheet = Image.new("RGB", (card.width, card.height * len(sample)))
    for i, f in enumerate(sample):
        sheet.paste(f, (0, i * card.height))
    palette = sheet.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    gif = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in rgb]
    gif[0].save(f"{out}/tour.gif", save_all=True, append_images=gif[1:], duration=round(1000 / FPS), loop=0, optimize=True)

    stills = {name: Image.open(f"{src}/{name}.png").convert("RGBA") for name in STATES}
    crop = padded(union_bbox(stills.values()), 16, frames[0].size)
    for name, im in stills.items():
        im.crop(crop).save(f"{out}/state-{name}.png", optimize=True)


if __name__ == "__main__":
    main(*sys.argv[1:3])
