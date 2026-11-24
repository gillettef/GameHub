"""기획안·규칙서용 그림 생성. 실행: python submission/tools/make_figures.py"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Polygon, FancyBboxPatch, Circle
from matplotlib import font_manager

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "figures")
for f in ["C:/Windows/Fonts/malgun.ttf", "C:/Windows/Fonts/malgunbd.ttf"]:
    if os.path.exists(f):
        font_manager.fontManager.addfont(f)
plt.rcParams["font.family"] = "Malgun Gothic"

# ---- 정원 설계도 A (룰북 그림 1과 같다) ----
DIRS = "NESW"
DV = {"N": (0, -1), "S": (0, 1), "E": (1, 0), "W": (-1, 0)}


def rot(x, y, d):
    return (8 - y, x, DIRS[(DIRS.index(d) + 1) % 4])


def orbit(c):
    o = [c]
    for _ in range(3):
        o.append(rot(*o[-1]))
    return o


HEDGES = set()
for seed in [(3, 3, "N"), (2, 2, "S"), (4, 1, "S")]:
    for (x, y, d) in orbit(seed):
        HEDGES.add((x, y, d))
        dx, dy = DV[d]
        HEDGES.add((x + dx, y + dy, DIRS[(DIRS.index(d) + 2) % 4]))
RV = {(3, 3), (5, 3), (5, 5), (3, 5)}
PAV = (4, 4)
SEAT = {"N": ("북 · 장미", "#c0392b"), "E": ("동 · 수국", "#2e6fbf"),
        "S": ("남 · 해바라기", "#c99a06"), "W": ("서 · 담쟁이", "#2e8b57")}
GARDEN = "#dfe9d3"
LINE = "#b9c8aa"
HEDGE = "#3f6b35"
START = {1: (2, 2, "S"), 2: (3, 2, "S"), 3: (5, 2, "E"), 4: (6, 2, "W"), 5: (2, 3, "N"), 6: (6, 3, "W"),
         7: (2, 5, "E"), 8: (6, 5, "S"), 9: (2, 6, "E"), 10: (3, 6, "W"), 11: (5, 6, "N"), 12: (6, 6, "N"),
         13: (4, 1, "S"), 14: (1, 4, "E"), 15: (7, 4, "W"), 16: (4, 7, "N")}


def covered(pieces, x, y, d):
    if (x, y, d) in HEDGES:
        return True
    dx, dy = DV[d]
    nxt = (x + dx, y + dy)
    if nxt == PAV:
        return True
    return any((px, py) == nxt for (px, py, _) in pieces.values())


def draw_board(ax, pieces, show_rays=True, tokens=(), ring=()):
    ax.set_xlim(-0.9, 7.9)
    ax.set_ylim(7.9, -0.9)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.add_patch(Rectangle((-0.15, -0.15), 7.3, 7.3, fc="#cfdcc0", ec="none"))
    for x in range(7):
        for y in range(7):
            rv = (x + 1, y + 1) in RV
            ax.add_patch(Rectangle((x, y), 1, 1, fc="#f3e3b0" if rv else GARDEN, ec=LINE, lw=0.8))
            if rv:
                ax.add_patch(Circle((x + .5, y + .5), .4, fc="none", ec="#b8902a", lw=1.2, ls=(0, (2, 2))))
    px, py = PAV[0] - 1, PAV[1] - 1
    ax.add_patch(FancyBboxPatch((px + .06, py + .06), .88, .88, boxstyle="round,pad=0.02",
                                fc="#e9e2d0", ec="#6b5b3e", lw=2.6))
    ax.add_patch(Polygon([(px + .5, py + .2), (px + .8, py + .5), (px + .5, py + .8), (px + .2, py + .5)],
                         fc="#c9b68a", ec="#6b5b3e", lw=1))
    ax.text(px + .5, py + .5, "정자", ha="center", va="center", fontsize=6.5, color="#4a3d28")
    for (x, y, d) in HEDGES:
        if d == "S":
            ax.add_patch(Rectangle((x - 1, y - .08), 1, .16, fc=HEDGE, ec="#2b4a24", lw=.8, zorder=5))
        if d == "E":
            ax.add_patch(Rectangle((x - .08, y - 1), .16, 1, fc=HEDGE, ec="#2b4a24", lw=.8, zorder=5))
    for s, (nm, col) in SEAT.items():
        if s == "N":
            r, t = Rectangle((0, -.75), 7, .45, fc=col), (3.5, -.52)
        elif s == "S":
            r, t = Rectangle((0, 7.3), 7, .45, fc=col), (3.5, 7.52)
        elif s == "W":
            r, t = Rectangle((-.75, 0), .45, 7, fc=col), (-.52, 3.5)
        else:
            r, t = Rectangle((7.3, 0), .45, 7, fc=col), (7.52, 3.5)
        r.set_alpha(.88)
        ax.add_patch(r)
        ax.text(*t, nm, ha="center", va="center", color="white", fontsize=8.5, fontweight="bold",
                rotation={"N": 0, "S": 0, "W": 90, "E": -90}[s])
    if show_rays:
        for (x, y, d) in pieces.values():
            if covered(pieces, x, y, d):
                continue
            col = SEAT[d][1]
            cx, cy = x - .5, y - .5
            end = {"N": (cx, -.3), "S": (cx, 7.3), "E": (7.3, cy), "W": (-.3, cy)}[d]
            ax.annotate("", xy=end, xytext=(cx + DV[d][0] * .42, cy + DV[d][1] * .42),
                        arrowprops=dict(arrowstyle="-|>", color=col, lw=2, alpha=.6, ls="--"), zorder=3)
    for n, (x, y, d) in pieces.items():
        cx, cy = x - .5, y - .5
        cov = covered(pieces, x, y, d)
        ax.add_patch(FancyBboxPatch((cx - .3, cy - .3), .6, .6, boxstyle="round,pad=0.03",
                                    fc="#f7f3ea", ec="#5a5246", lw=1.4, zorder=6))
        dx, dy = DV[d]
        mc = "#333333" if cov else SEAT[d][1]
        if d in "NS":
            ax.plot([cx - .24, cx + .24], [cy + dy * .33] * 2, color=mc, lw=3.4, zorder=7, solid_capstyle="round")
        else:
            ax.plot([cx + dx * .33] * 2, [cy - .24, cy + .24], color=mc, lw=3.4, zorder=7, solid_capstyle="round")
        tip = (cx + dx * .25, cy + dy * .25)
        b1 = (cx + dx * .1 - dy * .1, cy + dy * .1 + dx * .1)
        b2 = (cx + dx * .1 + dy * .1, cy + dy * .1 - dx * .1)
        ax.add_patch(Polygon([tip, b1, b2], fc="#5a5246", zorder=8))
        ax.text(cx - dx * .1, cy - dy * .1, str(n), ha="center", va="center", fontsize=8,
                fontweight="bold", color="#2d2a26", zorder=9)
    for n in ring:
        x, y, _ = pieces[n]
        ax.add_patch(Circle((x - .5, y - .5), .46, fc="none", ec="#7a6a50", lw=1, ls=":", zorder=11))
    for (n, s) in tokens:
        x, y, _ = pieces[n]
        ax.add_patch(Circle((x - .5 - .3, y - .5 + .3), .13, fc=SEAT[s][1], ec="#f5d76e", lw=2, zorder=10))


# 진행 중 장면 (4인, 4라운드쯤). (x, y, 방향)
SCENE = {
    1: (2, 2, "S"), 2: (4, 2, "E"), 3: (5, 1, "N"), 4: (6, 2, "W"),
    5: (3, 3, "N"), 6: (6, 3, "W"), 7: (2, 5, "E"), 8: (6, 5, "S"),
    9: (1, 7, "E"), 10: (3, 6, "W"), 11: (5, 6, "N"), 12: (6, 6, "N"),
    13: (2, 1, "W"), 14: (2, 4, "S"), 15: (5, 4, "W"), 16: (4, 7, "N"),
}


def fig_scene():
    fig, ax = plt.subplots(figsize=(6.2, 6.4), dpi=200)
    draw_board(ax, SCENE, tokens=[(5, "E")])
    fig.text(0.5, 0.012, "색 점선 화살표: 그 가면을 볼 수 있는 단 하나의 좌석   ·   검은 가면 면: 가려짐 (바로 앞에 무언가 있음)\n"
             "c3의 5번: 동쪽 좌석이 생울타리 쪽으로 숨겨 넣고 초대장 토큰(금테 원)을 놓았다. 동쪽을 쫓는 북쪽만 지목할 수 있다.",
             ha="center", fontsize=7.4, color="#333", linespacing=1.5)
    fig.subplots_adjust(0.01, 0.06, 0.99, 0.995)
    fig.savefig(os.path.join(OUT, "scene_topdown.png"))
    plt.close(fig)


def fig_layout():
    pcs = dict(START)
    fig, ax = plt.subplots(figsize=(6.2, 6.3), dpi=200)
    draw_board(ax, pcs, show_rays=False, ring=[13, 14, 15, 16])
    fig.text(0.5, 0.012, "시작 배치: 모든 가면이 생울타리에 붙어 가려진 채 시작한다   ·   점선 원(13~16): 4인 전용 시작 칸   ·   노란 칸: 접선 지점",
             ha="center", fontsize=7.2, color="#333")
    fig.subplots_adjust(0.01, 0.04, 0.99, 0.995)
    fig.savefig(os.path.join(OUT, "layout_A.png"))
    plt.close(fig)


def fig_piece():
    fig, axs = plt.subplots(1, 3, figsize=(9, 3.3), dpi=200)
    ax = axs[0]
    ax.set_xlim(0, 10); ax.set_ylim(10, 0); ax.set_aspect("equal"); ax.axis("off")
    ax.add_patch(FancyBboxPatch((2, 2.6), 6, 6, boxstyle="round,pad=0.15", fc="#f7f3ea", ec="#5a5246", lw=2))
    for r in [Rectangle((3.1, .6), .5, 2.1), Rectangle((6.4, .6), .5, 2.1), Rectangle((3.1, .6), 3.8, .5)]:
        r.set_facecolor("#d9d2c3"); r.set_edgecolor("#5a5246"); ax.add_patch(r)
    ax.add_patch(Polygon([(5, 3.1), (4.3, 4.2), (5.7, 4.2)], fc="#5a5246"))
    ax.text(5, 6.2, "7", ha="center", va="center", fontsize=26, fontweight="bold", color="#2d2a26")
    ax.set_title("위에서: 번호와 방향 화살표 (모두에게 공개)", fontsize=9.5)
    ax = axs[1]
    ax.set_xlim(0, 10); ax.set_ylim(0, 10); ax.set_aspect("equal"); ax.axis("off")
    ax.add_patch(Rectangle((2, 1), 6, 6.5, fc="#f7f3ea", ec="#5a5246", lw=2))
    ax.add_patch(Rectangle((3.4, 2.5), 3.2, 3.8, fc="#3a3530", ec="#5a5246", lw=1.5))
    ax.add_patch(Polygon([(5, 3.0), (5.9, 4.4), (5, 5.8), (4.1, 4.4)], fc="#c0392b", ec="white", lw=1))
    for r in [Rectangle((3.0, 2.5), .4, 4.2), Rectangle((6.6, 2.5), .4, 4.2), Rectangle((3.0, 6.3), 4.0, .4)]:
        r.set_facecolor("#d9d2c3"); r.set_edgecolor("#5a5246"); ax.add_patch(r)
    ax.set_title("앞에서: 차양 속 가면 홈과 문양 타일", fontsize=9.5)
    ax = axs[2]
    ax.set_xlim(-6, 6); ax.set_ylim(-1.6, 9.4); ax.set_aspect("equal"); ax.axis("off")
    ax.add_patch(Polygon([(0, 1), (-3.1, 8.5), (3.1, 8.5)], fc="#c0392b", alpha=.18, ec="none"))
    ax.add_patch(Rectangle((-1.2, -.6), 2.4, 1.6, fc="#f7f3ea", ec="#5a5246", lw=2))
    ax.plot([-1, 1], [1, 1], color="#c0392b", lw=4)
    ax.text(0, 8.9, "정면 좌석만 보인다", ha="center", fontsize=9, color="#c0392b", fontweight="bold")
    ax.text(-4.4, 2.6, "옆 좌석:\n차양에 막힘", ha="center", fontsize=8.5, color="#555")
    ax.text(4.4, 2.6, "옆 좌석:\n차양에 막힘", ha="center", fontsize=8.5, color="#555")
    ax.text(0, -1.3, "바로 앞에 생울타리·정자·다른 말이 붙으면 아무도 못 본다", ha="center", fontsize=7.6, color="#333")
    ax.set_title("보이는 범위 (정면 ±22°)", fontsize=9.5)
    fig.subplots_adjust(0.01, 0.03, 0.99, 0.9, wspace=0.05)
    fig.savefig(os.path.join(OUT, "piece_design.png"))
    plt.close(fig)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    fig_scene()
    fig_layout()
    fig_piece()
    print("ok")
