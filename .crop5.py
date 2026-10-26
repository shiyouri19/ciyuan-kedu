from PIL import Image
src = r'C:/Users/tx5pro/.workbuddy/clipboard-images/clipboard-2026-10-26T16-11-42-576Z-b6529399.jpg'
im = Image.open(src).convert('RGB')

crops = {
    'portrait': (215, 6, 458, 448),    # 再右移，避开"度"字
    'chibi':    (800, 490, 1030, 900), # Q版在右半部分
}
for name, box in crops.items():
    c = im.crop(box)
    c.save(f'.compare/keke2/{name}.png')
    print(f'{name}: {box} -> {c.size}')
