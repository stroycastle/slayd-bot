# make-previews.js yordamchisi: 20 uslub rasmini (titul + 4-slayd) bitta jpg ga yigʻadi.
import glob, sys
from PIL import Image, ImageDraw, ImageFont

d, out, keys, names = sys.argv[1], sys.argv[2], sys.argv[3].split(','), sys.argv[4].split(',')
COLS, TW = 5, 232
GAP, LABEL = 8, 24
first = Image.open(glob.glob(f'{d}/{keys[0]}-*1.png')[0])
TH = round(TW * first.height / first.width)
cell_h = TH * 2 + 2 + LABEL
rows = (len(keys) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * (TW + GAP) + GAP, rows * (cell_h + GAP) + GAP), (244, 244, 244))
dr = ImageDraw.Draw(sheet)

def font(size):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()

f = font(15)
for i, k in enumerate(keys):
    pages = sorted(glob.glob(f'{d}/{k}-*.png'))
    cover, body = Image.open(pages[0]).convert('RGB'), Image.open(pages[3]).convert('RGB')
    x = GAP + (i % COLS) * (TW + GAP)
    y = GAP + (i // COLS) * (cell_h + GAP)
    sheet.paste(cover.resize((TW, TH), Image.LANCZOS), (x, y))
    sheet.paste(body.resize((TW, TH), Image.LANCZOS), (x, y + TH + 2))
    for yy in (y, y + TH + 2):
        dr.rectangle([x, yy, x + TW - 1, yy + TH - 1], outline=(205, 205, 205))
    label = f'{i + 1}. {names[i]}'
    dr.text((x + 2, y + TH * 2 + 6), label, fill=(30, 30, 30), font=f)
sheet.save(out, 'JPEG', quality=84, optimize=True)
print(out, sheet.size)
