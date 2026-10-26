from PIL import Image, ImageDraw
src = r'C:/Users/tx5pro/.workbuddy/clipboard-images/clipboard-2026-10-26T16-11-42-576Z-b6529399.jpg'
im = Image.open(src).convert('RGB')

box = (820, 496, 1064, 888)
c = im.crop(box).convert('RGB')
w, h = c.size
bg = c.getpixel((6, 6))

# 只刷最右上角那一小块（文字区），不碰头发
d = ImageDraw.Draw(c)
d.rectangle([int(w*0.76), 0, w, int(h*0.155)], fill=bg)

c.save('.compare/keke2/chibi_clean.png')
print('chibi_clean:', c.size, '刷白区: x>', int(w*0.76), ' y<', int(h*0.155))
