import zipfile
import xml.etree.ElementTree as ET
import json
import re
import os

xlsx_path = "scratch/mower.xlsx"
out_path = "scratch/sheet1_dump.json"

ns = {
    'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
}

with zipfile.ZipFile(xlsx_path, 'r') as z:
    shared_strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in tree.findall('main:si', ns):
            texts = [t.text or '' for t in si.findall('.//main:t', ns)]
            shared_strings.append(''.join(texts))

    sheet_tree = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    sheet_data = sheet_tree.find('main:sheetData', ns)

    rows_data = []
    for row_el in sheet_data.findall('main:row', ns):
        row_num = int(row_el.attrib['r'])
        row_obj = {'row': row_num}
        has_content = False

        for c_el in row_el.findall('main:c', ns):
            cell_ref = c_el.attrib['r']
            col_letter = re.match(r'([A-Z]+)', cell_ref).group(1)
            cell_type = c_el.attrib.get('t', 'n')

            val = None
            if cell_type == 's':
                v_el = c_el.find('main:v', ns)
                if v_el is not None and v_el.text:
                    idx = int(v_el.text)
                    val = shared_strings[idx]
            elif cell_type == 'inlineStr':
                is_el = c_el.find('main:is', ns)
                if is_el is not None:
                    texts = [t.text or '' for t in is_el.findall('.//main:t', ns)]
                    val = ''.join(texts)
            else:
                v_el = c_el.find('main:v', ns)
                if v_el is not None and v_el.text is not None:
                    val = v_el.text

            if val is not None:
                row_obj[col_letter] = val
                has_content = True

        if has_content:
            rows_data.append(row_obj)

os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(rows_data, f, ensure_ascii=False, indent=2)

print(f"Dumped {len(rows_data)} rows to {out_path}")
