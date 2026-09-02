# Generates the extension icons: a dark rounded square with a 4x4 heatmap grid
# of greens and one orange "today" cell. Pure stdlib (zlib + struct PNG writer).
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)

BG = (0x1E, 0x24, 0x30, 0xFF)
LEVELS = [
    (0x0E, 0x44, 0x29, 0xFF),
    (0x00, 0x6D, 0x32, 0xFF),
    (0x26, 0xA6, 0x41, 0xFF),
    (0x39, 0xD3, 0x53, 0xFF),
]
ORANGE = (0xFF, 0x9F, 0x1C, 0xFF)

GRID = [
    [1, 2, 2, 3],
    [2, 3, 3, 2],
    [2, 3, 3, 3],
    [3, 3, 4, 3],  # 4 = the orange "today" cell
]


def in_rounded(x, y, size, radius_frac=0.22):
    r = size * radius_frac
    if r <= 0:
        return True
    cx = min(max(x, r), size - r)
    cy = min(max(y, r), size - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_rounded_rect(x, y, x0, y0, w, h, r):
    if not (x0 <= x < x0 + w and y0 <= y < y0 + h):
        return False
    dx = min(x - x0, x0 + w - 1 - x)
    dy = min(y - y0, y0 + h - 1 - y)
    if dx >= r or dy >= r:
        return True
    return dx * dx + dy * dy <= r * r


def make_pixel_fn(size):
    pad = size * 0.16
    gap = size * 0.055
    cell = (size - 2 * pad - 3 * gap) / 4
    cr = cell * 0.22
    br = size * 0.22

    def px(x, y):
        if not in_rounded(x, y, size, br / size):
            return (0, 0, 0, 0)
        col = int((x - pad) / (cell + gap))
        row = int((y - pad) / (cell + gap))
        if 0 <= col < 4 and 0 <= row < 4:
            x0 = pad + col * (cell + gap)
            y0 = pad + row * (cell + gap)
            if in_rounded_rect(x, y, x0, y0, cell, cell, cr):
                level = GRID[row][col]
                return ORANGE if level == 4 else LEVELS[level]
        return BG

    return px


def write_png(path, size):
    fn = make_pixel_fn(size)
    raw = b""
    for y in range(size):
        raw += b"\x00"
        for x in range(size):
            raw += struct.pack("4B", *fn(x, y))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


for s in (16, 32, 48, 128):
    write_png(OUT / f"icon{s}.png", s)
    print(f"wrote {OUT / f'icon{s}.png'}")
