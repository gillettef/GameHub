# 네오테라 회화풍 래스터 자산 굽기.
#   python scripts/art/build_art.py            # 전부
#   python scripts/art/build_art.py buildings  # 일부만(buildings units props legacy scenes techweb landing)
# SVG 원본은 scripts/art/src/*.svg 에 남고, 결과 WebP 는 src/ui/assets/{scene,techweb,landing}/ 에 들어간다.
# 필요: 헤드리스 Chrome(NT_CHROME 로 경로 지정 가능), Python Pillow(WebP). npm 라이브러리는 쓰지 않는다.
import json
import sys

sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))

from paint import ROOT, Doc, bake  # noqa: E402
import importlib  # noqa: E402


def mod(name):
    return importlib.import_module(name)

ASSETS = ROOT / 'src' / 'ui' / 'assets'
LAYOUT = json.loads((ASSETS / 'scene' / 'layout.json').read_text(encoding='utf-8'))
report = []


def atlas(name, cols, rows, cw, ch, cells, out, seed=1, q=80):
    """cells: {(col,row): draw(d) -> svg 문자열}. 칸마다 붓결 필터"""
    d = Doc(cols * cw, rows * ch, prefix=name[:2])
    for (c, r), fn in cells.items():
        pf = d.paint_filter(disp=2, streak=0.4, freq=0.05, brush='0.04 0.22', seed=seed + c * 7 + r)
        d.add(f'<g transform="translate({c * cw} {r * ch})"><g filter="{pf}">{fn(d)}</g></g>')
    report.append((out.name, bake(name, d, out, quality=q)))


def do_buildings():
    b = LAYOUT['building']
    cells = {}
    for c, k in enumerate(mod('buildings').KINDS):
        for lv in mod('buildings').LEVELS[k]:
            cells[(c, lv)] = (lambda k, lv: lambda d: mod('buildings').DRAW[k](d, lv))(k, lv)
    atlas('buildings', 5, 4, b['w'], b['h'], cells, ASSETS / 'scene' / 'buildings.webp')


def do_units():
    u = LAYOUT['unit']
    cells = {}
    for c, k in enumerate(mod('units').KINDS):
        for lv in mod('units').LEVELS[k]:
            cells[(c, lv)] = (lambda k, lv: lambda d: mod('units').DRAW[k](d, lv))(k, lv)
    atlas('units', 4, 4, u['w'], u['h'], cells, ASSETS / 'scene' / 'units.webp', seed=11)


def do_legacy():
    g = LAYOUT['legacy']
    cells = {(i, 0): (lambda i: lambda d: mod('props').monument(d, i))(i) for i in range(5)}
    atlas('legacy', 5, 1, g['w'], g['h'], cells, ASSETS / 'scene' / 'legacy.webp', seed=21)


def do_props():
    d = mod('props').props_doc()
    report.append(('props.webp', bake('props', d, ASSETS / 'scene' / 'props.webp', quality=86)))


def do_scenes():
    for era in (1, 2, 3, 4):
        d = mod('scenes').scene(era, LAYOUT)
        report.append((f'era{era}.webp', bake(f'scene-era{era}', d, ASSETS / 'scene' / f'era{era}.webp', quality=74)))


def do_techweb():
    d = mod('techweb').map_doc()
    report.append(('techweb/map.webp', bake('techweb-map', d, ASSETS / 'techweb' / 'map.webp', quality=74)))


def do_landing():
    for name, fn, q in (('sky', mod('landing').sky, 72), ('planet', mod('landing').planet, 80), ('ground', mod('landing').ground, 76)):
        report.append((f'landing/{name}.webp', bake(f'landing-{name}', fn(), ASSETS / 'landing' / f'{name}.webp', quality=q)))


JOBS = {'buildings': do_buildings, 'units': do_units, 'legacy': do_legacy, 'props': do_props, 'scenes': do_scenes, 'techweb': do_techweb, 'landing': do_landing}

if __name__ == '__main__':
    names = sys.argv[1:] or list(JOBS)
    for n in names:
        JOBS[n]()
    for n, b in report:
        print(f'{n:24s} {b / 1024:7.1f} KB')
    total = sum((p.stat().st_size for p in ASSETS.rglob('*.webp')))
    print(f'{"assets/**/*.webp 합계":24s} {total / 1024:7.1f} KB')
