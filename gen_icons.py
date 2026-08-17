#!/usr/bin/env python3
"""生成 PWA 图标（纯标准库，无第三方依赖）。
输出：assets/icon-192.png / icon-512.png / icon-180.png
设计：品牌渐变圆角方形 + 白色「工」字（工商管理首字）。"""
import os, struct, zlib

BRAND_TOP = (240, 145, 63)   # #f0913f
BRAND_BOT = (217, 99, 31)    # #d9631f
WHITE = (255, 255, 255)


def make_png(size):
    # RGBA buffer
    buf = bytearray([0, 0, 0, 0]) * (size * size)
    px = [list(BRAND_TOP)] * (size * size)  # placeholder, fill properly below

    def idx(x, y):
        return y * size + x

    # vertical gradient background
    for y in range(size):
        t = y / (size - 1)
        r = int(BRAND_TOP[0] + (BRAND_BOT[0] - BRAND_TOP[0]) * t)
        g = int(BRAND_TOP[1] + (BRAND_BOT[1] - BRAND_TOP[1]) * t)
        b = int(BRAND_TOP[2] + (BRAND_BOT[2] - BRAND_TOP[2]) * t)
        for x in range(size):
            px[idx(x, y)] = [r, g, b]

    def set_px(x, y, color):
        if 0 <= x < size and 0 <= y < size:
            px[idx(x, y)] = list(color)

    def fill_rect(x0, y0, x1, y1, color):
        for y in range(max(0, y0), min(size, y1)):
            for x in range(max(0, x0), min(size, x1)):
                set_px(x, y, color)

    def fill_round_rect(cx0, cy0, cx1, cy1, radius, color):
        for y in range(cy0, cy1):
            for x in range(cx0, cx1):
                # rounded corner test
                if (x < cx0 + radius and y < cy0 + radius):
                    if (x - (cx0 + radius)) ** 2 + (y - (cy0 + radius)) ** 2 > radius * radius:
                        continue
                if (x > cx1 - radius - 1 and y < cy0 + radius):
                    if (x - (cx1 - radius - 1)) ** 2 + (y - (cy0 + radius)) ** 2 > radius * radius:
                        continue
                if (x < cx0 + radius and y > cy1 - radius - 1):
                    if (x - (cx0 + radius)) ** 2 + (y - (cy1 - radius - 1)) ** 2 > radius * radius:
                        continue
                if (x > cx1 - radius - 1 and y > cy1 - radius - 1):
                    if (x - (cx1 - radius - 1)) ** 2 + (y - (cy1 - radius - 1)) ** 2 > radius * radius:
                        continue
                set_px(x, y, color)

    # 白色「工」字（居中，基于比例）
    m = size // 2
    bar_w = max(4, size // 9)          # 笔画粗细
    glyph_w = int(size * 0.52)         # 字形宽度
    gx0 = m - glyph_w // 2
    gx1 = m + glyph_w // 2
    top_y = int(size * 0.30)
    mid_y = int(size * 0.50)
    bot_y = int(size * 0.70)
    # 顶横
    fill_rect(gx0, top_y - bar_w // 2, gx1, top_y + bar_w // 2, WHITE)
    # 底横（略长）
    fill_rect(gx0 - bar_w, bot_y - bar_w // 2, gx1 + bar_w, bot_y + bar_w // 2, WHITE)
    # 中竖
    fill_rect(m - bar_w // 2, top_y, m + bar_w // 2, bot_y, WHITE)

    # 整体圆角外框（把画布四角裁成透明）
    radius = int(size * 0.22)
    for y in range(size):
        for x in range(size):
            corner = None
            if x < radius and y < radius:
                corner = (radius, radius)
            elif x > size - radius - 1 and y < radius:
                corner = (size - radius - 1, radius)
            elif x < radius and y > size - radius - 1:
                corner = (radius, size - radius - 1)
            elif x > size - radius - 1 and y > size - radius - 1:
                corner = (size - radius - 1, size - radius - 1)
            if corner:
                dx = x - corner[0]
                dy = y - corner[1]
                if dx * dx + dy * dy > radius * radius:
                    px[idx(x, y)] = [0, 0, 0, 0]

    # 编码 PNG
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            r, g, b = px[idx(x, y)][:3]
            a = px[idx(x, y)][3] if len(px[idx(x, y)]) > 3 else 255
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
    return png


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    assets = os.path.join(here, 'assets')
    os.makedirs(assets, exist_ok=True)
    for s in (192, 512, 180):
        png = make_png(s)
        out = os.path.join(assets, f'icon-{s}.png')
        with open(out, 'wb') as f:
            f.write(png)
        print(f'wrote {out} ({len(png)} bytes)')


if __name__ == '__main__':
    main()
