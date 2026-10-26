from PIL import Image
src = r'C:/Users/tx5pro/.workbuddy/clipboard-images/clipboard-2026-10-26T16-11-42-576Z-b6529399.jpg'
im = Image.open(src).convert('RGB')

# 头部特写：只要 Q 版的头和肩，绝对避开右上角文字和右下宠物
c = im.crop((845, 512, 1005, 690))
c.save('.compare/keke2/chibi_head.png')
print('chibi_head:', c.size)
