import zipfile, re, sys

path = r'C:/Users/tx5pro/Desktop/gemini4的评价和建议.docx'
with zipfile.ZipFile(path) as z:
    xml = z.read('word/document.xml').decode('utf-8')

# 按表格切分：<w:tbl> ... </w:tbl>
tables = re.findall(r'<w:tbl>.*?</w:tbl>', xml, re.S)
print(f'表格数: {len(tables)}\n')

def cell_text(tc):
    # 段落用换行，单元格内所有 w:t 拼起来
    paras = re.findall(r'<w:p[ >].*?</w:p>', tc, re.S)
    out = []
    for p in paras:
        runs = re.findall(r'<w:t[^>]*>(.*?)</w:t>', p, re.S)
        s = ''.join(runs)
        s = s.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
        if s.strip():
            out.append(s.strip())
    return '\n'.join(out)

for i, tbl in enumerate(tables, 1):
    print(f'{"="*20} 表格 {i} {"="*20}')
    rows = re.findall(r'<w:tr[ >].*?</w:tr>', tbl, re.S)
    for row in rows:
        cells = re.findall(r'<w:tc>.*?</w:tc>', row, re.S)
        texts = [cell_text(c) for c in cells]
        print('\n' + ' | '.join(texts))
    print()
