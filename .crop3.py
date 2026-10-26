from PIL import Image
import os

src = r'C:/Users/tx5pro/.workbuddy/clipboard-images/clipboard-2026-10-26T16-11-42-576Z-b6529399.jpg'
im = Image.open(src).convert('RGB')
W, H = im.size
print(f'原图: {W} x {H}')

os.makedirs('.compare/keke2', exist_ok=True)

# 按比例定位几个区域，先粗裁看位置
regions = {
    'A_portrait': (0.03, 0.01, 0.39, 0.42),   # 左上主立绘
    'B_chibi':    (0.50, 0.36, 0.67, 0.72),   # Q版形象
    'C_face':     (0.68, 0.03, 0.76, 0.13),   # 微笑表情
    'D_pet':      (0.69, 0.77, 0.79, 0.94),   # 小宠物
}
for name, (l, t, r, b) in regions.items():
    box = (int(W*l), int(H*t), int(W*r), int(H*b))
    c = im.crop(box)
    c.save(f'.compare/keke2/{name}.png')
    print(f'  {name}: {box} -> {c.size}')
