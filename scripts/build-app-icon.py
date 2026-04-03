from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT_DIR = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT_DIR / "app-logo.png"
BUILD_DIR = ROOT_DIR / "build"
RESOURCES_DIR = ROOT_DIR / "resources"
PNG_OUTPUT_PATHS = [BUILD_DIR / "icon.png", RESOURCES_DIR / "icon.png"]
ICO_OUTPUT_PATH = BUILD_DIR / "icon.ico"
CANVAS_SIZE = 512
ICON_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
MAX_CONTENT_SIZE = 448


def build_square_icon(source: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    icon = source.convert("RGBA")
    icon.thumbnail((MAX_CONTENT_SIZE, MAX_CONTENT_SIZE), Image.Resampling.LANCZOS)

    offset_x = (CANVAS_SIZE - icon.width) // 2
    offset_y = (CANVAS_SIZE - icon.height) // 2
    canvas.paste(icon, (offset_x, offset_y), icon)
    return canvas


def main() -> None:
    if not SOURCE_PATH.exists():
      raise FileNotFoundError(f"Missing icon source: {SOURCE_PATH}")

    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    RESOURCES_DIR.mkdir(parents=True, exist_ok=True)

    with Image.open(SOURCE_PATH) as source:
        square_icon = build_square_icon(source)
        for path in PNG_OUTPUT_PATHS:
            square_icon.save(path, format="PNG")

        square_icon.save(ICO_OUTPUT_PATH, format="ICO", sizes=ICON_SIZES)

    print(f"Built PNG icons at: {', '.join(str(path) for path in PNG_OUTPUT_PATHS)}")
    print(f"Built ICO icon at: {ICO_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
