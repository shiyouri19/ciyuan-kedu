from PIL import Image
src = r'C:/Users/tx5pro/.workbuddy/clipboard-images/clipboard-2026-10-26T16-11-42-576Z-b6529399.jpg'
im = Image.open(src).convert('RGB')

crops = {
    'chibi': (822, 498, 1060, 884),   # 左避色块，右包含完整人物
}
for name, box in crops.items():
    c = im.crop(box)
    c.save(f'.compare/keke2/{name}.png')
    print(f'{name}: {box} -> {c.size}')
