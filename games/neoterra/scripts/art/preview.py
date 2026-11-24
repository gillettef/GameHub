# 미리보기: WebP 를 어두운 땅색 위에 얹어 PNG 로 저장(검수용, 산출물 아님)
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 1
im = Image.open(src).convert('RGBA')
bg = Image.new('RGBA', im.size, (58, 52, 50, 255))
bg.alpha_composite(im)
if scale != 1:
    bg = bg.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
bg.convert('RGB').save(dst)
