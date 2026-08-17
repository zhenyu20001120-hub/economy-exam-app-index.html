from PIL import Image, ImageDraw, ImageFont

W = H = 1080
img = Image.new('RGB', (W, H))
px = img.load()
top = (255, 138, 0)      # 橙
bot = (255, 64, 48)      # 红
for y in range(H):
    t = y / H
    r = int(top[0] + (bot[0] - top[0]) * t)
    g = int(top[1] + (bot[1] - top[1]) * t)
    b = int(top[2] + (bot[2] - top[2]) * t)
    for x in range(W):
        px[x, y] = (r, g, b)

d = ImageDraw.Draw(img)
FONT = "C:/Windows/Fonts/simhei.ttf"

def font(sz):
    return ImageFont.truetype(FONT, sz)

white = (255, 255, 255)
gold = (255, 238, 200)

# 主标题（带描边，醒目）
d.text((W/2, H/2 - 200), "中级经济师", font=font(128), fill=white,
       anchor="mm", stroke_width=5, stroke_fill=(120, 30, 0))
d.text((W/2, H/2 - 40), "刷题神器", font=font(150), fill=white,
       anchor="mm", stroke_width=6, stroke_fill=(120, 30, 0))

# 小字说明
d.text((W/2, H/2 + 130), "502题 · 三轮学习 · 离线可用", font=font(54),
       fill=white, anchor="mm")
d.text((W/2, H/2 + 215), "手机电脑都能刷 · 几块钱带走", font=font(50),
       fill=gold, anchor="mm")

out = "C:/Users/Johnny/WorkBuddy/2026-08-15-08-07-13/economy-exam-app/闲鱼封面.png"
img.save(out)
print("saved", out)
