from PIL import Image, ImageDraw
src = r'C:/Users/tx5pro/.workbuddy/clipboard-images/clipboard-2026-10-26T16-11-42-576Z-b6529399.jpg'
im = Image.open(src).convert('RGB')

# 先裁大一点，再用背景色刷掉右上角的手写旁白
box = (820, 496, 1064, 888)
c = im.crop(box).convert('RGB')

# 取左上角像素判断背景色
bg = c.getpixel((6, 6))
print('背景色采样:', bg)

d = ImageDraw.Draw(c)
# 右上角的旁白文字区域（相对坐标）
w, h = c.size
d.rectangle([int(w*0.42), 0, w, int(h*0.20)], fill=bg)

c.save('.compare/keke2/chibi_clean.png')
print('chibi_clean:', c.size)

# 主立绘同样处理：裁一次干净的
p = im.crop((215, 6, 458, 448)).convert('RGB')
p.save('.compare/keke2/portrait_clean.png')
print('portrait_clean:', p.size)
