from pathlib import Path
import json
from PIL import Image, ImageChops, ImageFilter, ImageStat

SOURCE = Path("/Users/ITAdmin/Downloads/football jersey photos")
OUTPUT = Path("public/kits/processed/standardized-source")
CANVAS = 1200
FILL_RATIO = 0.84
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


def background_color(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    size = max(8, min(rgb.size) // 30)
    corners = [
        rgb.crop((0, 0, size, size)),
        rgb.crop((rgb.width - size, 0, rgb.width, size)),
        rgb.crop((0, rgb.height - size, size, rgb.height)),
        rgb.crop((rgb.width - size, rgb.height - size, rgb.width, rgb.height)),
    ]
    samples = [ImageStat.Stat(corner).median for corner in corners]
    return tuple(int(sorted(sample[channel] for sample in samples)[1]) for channel in range(3))


def subject_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgb = image.convert("RGB")
    bg = Image.new("RGB", rgb.size, background_color(rgb))
    difference = ImageChops.difference(rgb, bg).convert("L")
    mask = difference.point(lambda value: 255 if value > 13 else 0)
    mask = mask.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(5))
    bbox = mask.getbbox()
    if not bbox:
        return (0, 0, rgb.width, rgb.height)
    left, top, right, bottom = bbox
    pad_x = max(6, int((right - left) * 0.035))
    pad_y = max(6, int((bottom - top) * 0.035))
    return (
        max(0, left - pad_x),
        max(0, top - pad_y),
        min(rgb.width, right + pad_x),
        min(rgb.height, bottom + pad_y),
    )


def standardize(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    cropped = rgb.crop(subject_bbox(rgb))
    limit = int(CANVAS * FILL_RATIO)
    cropped.thumbnail((limit, limit), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (CANVAS, CANVAS), "white")
    x = (CANVAS - cropped.width) // 2
    y = (CANVAS - cropped.height) // 2
    canvas.paste(cropped, (x, y))
    return canvas


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sources = sorted(path for path in SOURCE.iterdir() if path.suffix.lower() in IMAGE_SUFFIXES)
    manifest = []
    product_number = 1

    for source_index, path in enumerate(sources):
        # The first file is a Manchester United crest rather than a product photo.
        if source_index == 0:
            manifest.append({"sourceIndex": source_index, "source": path.name, "type": "excluded-logo"})
            continue

        with Image.open(path) as opened:
            image = opened.convert("RGB")
            is_pair = image.width / image.height >= 1.22
            if is_pair:
                midpoint = image.width // 2
                halves = [("front", image.crop((0, 0, midpoint, image.height))),
                          ("back", image.crop((midpoint, 0, image.width, image.height)))]
                outputs = {}
                for side, half in halves:
                    output_name = f"source-{source_index:02d}-{side}.webp"
                    standardize(half).save(OUTPUT / output_name, "WEBP", quality=92, method=6)
                    outputs[side] = f"/kits/processed/standardized-source/{output_name}"
                manifest.append({
                    "product": product_number,
                    "sourceIndex": source_index,
                    "source": path.name,
                    "type": "front-back-pair",
                    **outputs,
                })
                product_number += 1
            else:
                side = "single"
                output_name = f"source-{source_index:02d}-{side}.webp"
                standardize(image).save(OUTPUT / output_name, "WEBP", quality=92, method=6)
                manifest.append({
                    "sourceIndex": source_index,
                    "source": path.name,
                    "type": "single-view",
                    "output": f"/kits/processed/standardized-source/{output_name}",
                })

    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Processed {len(sources) - 1} source photos into {len(list(OUTPUT.glob('*.webp')))} standardized images.")


if __name__ == "__main__":
    main()
