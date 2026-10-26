from PIL import Image
src = r'C:/Users/tx5pro/.workbuddy/clipboard-images/clipboard-2026-10-26T16-11-42-576Z-b6529399.jpg'
im = Image.open(src).convert('RGB')
W, H = im.size

# 精确坐标（像素）
crops = {
    'portrait': (196, 8, 452, 448),    # 主立绘：从人物左侧头发到右边缘，避开左侧 Logo 和底部标题
    'chibi':    (640, 470, 830, 880),  # Q版：避开左侧"Q版形象"标题和右侧表情列
}
for name, box in crops.items():
    c = im.crop(box)
    c.save(f'.compare/keke2/{name}.png')
    print(f'{name}: {box} -> {c.size}')

# 顺便标出人物实际像素范围，便于二次微调
print('\n提示：原图 1254x1254')
