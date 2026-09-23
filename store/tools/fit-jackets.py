"""Fit flat jacket photos onto the A-pose model photo.

For each jacket: remove the background, cut the inner back collar out of the
neck opening, scale/position it on the model (collar at her neck, centred),
then rotate each sleeve about its shoulder point so the cuff lands on her
wrist. The underarm wedge between torso and rotated sleeve is filled by
stretching the fabric there, and sleeves are shortened radially to arm length.
Output: a transparent PNG on the model's canvas (aligned mode in the store).
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

IMG = 'images/'  # folder with the model photo and the jacket photos
OUT = 'out/'

MODEL = dict(file='11.jpg', cx=488, collar_top=184, hem_y=548,
             wrist={'L': (228, 512), 'R': (750, 508)}, hem_width=262)

# Landmarks in each jacket photo's own pixels.
JACKETS = {
    'olive': dict(lift=4, file='10.jpg', zip_x=905, collar_top=185, hem=(545, 1273, 1420),
                  pivot={'L': (415, 482), 'R': (1400, 482)},
                  cuff={'L': (291, 1855), 'R': (1519, 1855)}, cuff_in={'L': (391, 1882), 'R': (1437, 1882)},
                  pit={'L': (545, 1300), 'R': (1273, 1300)},
                  neck=[(736, 178), (738, 186), (800, 215), (860, 246), (905, 268), (950, 246), (1010, 215), (1080, 186), (1084, 178)]),
    'red': dict(lift=26, file='4.webp', zip_x=640, collar_top=200, hem=(393, 904, 1009),
                pivot={'L': (334, 432), 'R': (944, 432)},
                cuff={'L': (190, 1225), 'R': (1114, 1206)}, cuff_in={'L': (262, 1252), 'R': (1035, 1238)},
                pit={'L': (393, 1016), 'R': (904, 1029)},
                neck=[(544, 190), (548, 198), (600, 272), (638, 338), (690, 272), (748, 198), (752, 190)]),
    'black': dict(lift=14, file='5.webp', zip_x=641, collar_top=110, hem=(370, 940, 1017),
                  pivot={'L': (336, 345), 'R': (965, 336)},
                  cuff={'L': (147, 1324), 'R': (1188, 1303)}, cuff_in={'L': (215, 1345), 'R': (1103, 1331)},
                  pit={'L': (370, 1034), 'R': (940, 1034)},
                  neck=[(498, 104), (504, 116), (580, 190), (641, 238), (705, 190), (792, 114), (798, 104)]),
    'cream': dict(lift=24, file='6.webp', zip_x=650, collar_top=147, hem=(362, 905, 1034),
                  pivot={'L': (345, 345), 'R': (965, 362)},
                  cuff={'L': (157, 1302), 'R': (1109, 1288)}, cuff_in={'L': (233, 1314), 'R': (1031, 1307)},
                  pit={'L': (371, 1043), 'R': (900, 1034)},
                  neck=[(510, 132), (515, 142), (600, 232), (645, 282), (692, 238), (752, 142), (756, 132)]),
}


def load_rgba(path):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(np.float32)
    if a[..., 3].min() > 250:  # opaque photo on white: flood-fill the background away
        rgb = a[..., :3]
        border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
        bgc = np.median(border, axis=0)
        near = np.linalg.norm(rgb - bgc, axis=-1) < 38
        lab, _ = ndimage.label(near)
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        bg = np.isin(lab, list(edge))
        a[..., 3] = np.where(bg, 0, 255)
    # Drop the soft grey drop-shadow fringe some cut-outs carry.
    alpha = a[..., 3] > 128
    alpha = ndimage.binary_erosion(alpha, iterations=2)
    alpha = ndimage.binary_opening(alpha, iterations=2)
    lab, n = ndimage.label(alpha)
    if n > 1:  # keep the garment, drop specks
        sizes = ndimage.sum(alpha, lab, range(1, n + 1))
        alpha = lab == (1 + int(np.argmax(sizes)))
    soft = ndimage.gaussian_filter(alpha.astype(np.float32), 0.8) * 255
    a[..., 3] = np.minimum(a[..., 3], soft)
    return a


def cut_neck(a, poly):
    m = Image.new('L', (a.shape[1], a.shape[0]), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    m = np.asarray(m.filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    a[..., 3] *= 1 - m
    return a


def bilinear(a, xs, ys):
    h, w = a.shape[:2]
    out = np.zeros(xs.shape + (4,), np.float32)
    for c in range(4):
        out[..., c] = ndimage.map_coordinates(a[..., c], [ys, xs], order=1, mode='constant', cval=0)
    return out


def fit(name, debug=False):
    J = JACKETS[name]
    src = cut_neck(load_rgba(IMG + J['file']), J['neck'])
    model = Image.open(IMG + MODEL['file']).convert('RGB')
    W, H = model.size

    # Width from the hem, height from collar-to-hem, so every jacket lands on the same body line.
    kx = MODEL['hem_width'] / (J['hem'][1] - J['hem'][0])
    ky = (MODEL['hem_y'] - MODEL['collar_top']) / (J['hem'][2] - J['collar_top'])
    to_out = lambda p: (MODEL['cx'] + (p[0] - J['zip_x']) * kx, MODEL['collar_top'] + (p[1] - J['collar_top']) * ky)

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # Start from the plain similarity map (output -> "scaled source" coords).
    sx, sy = xx.copy(), yy.copy()

    for side, sig in (('L', -1), ('R', 1)):
        P = to_out(J['pivot'][side])
        C = to_out(J['cuff'][side])
        A = to_out(J['pit'][side])
        Wt = MODEL['wrist'][side]
        ang = lambda v: np.degrees(np.arctan2(sig * v[0], v[1]))  # outward angle from straight down
        psi_split = ang((A[0] - P[0], A[1] - P[1]))
        psi_axis = ang((C[0] - P[0], C[1] - P[1]))
        psi_t = ang((Wt[0] - P[0], Wt[1] - P[1]))
        delta = psi_t - psi_axis
        Ci = to_out(J['cuff_in'][side])
        psi_in = ang((Ci[0] - P[0], Ci[1] - P[1]))  # sleeve's inner edge
        # The flat-lay "armpit" sits at the hem where the sleeve parts from the body; the real
        # underarm is far higher, so the fabric gusset only fills the top of the wedge.
        r_pit = 0.42 * np.hypot(Wt[0] - P[0], Wt[1] - P[1])
        m_sleeve = np.hypot(C[0] - P[0], C[1] - P[1]) / np.hypot(Wt[0] - P[0], Wt[1] - P[1])

        dx, dy = xx - P[0], yy - P[1]
        r = np.hypot(dx, dy)
        psi = np.degrees(np.arctan2(sig * dx, dy))
        top = 165.0
        # Everything outward of the split line is sleeve and turns with it. Near the
        # shoulder a thin band of fabric next to the split is stretched into an underarm
        # gusset; below the underarm the opened wedge is the gap between arm and body.
        gus = 6.0
        wedge_hi = psi_split + gus + delta
        src_psi = psi.copy()
        m = np.ones_like(psi)
        w_mask = (psi > psi_split) & (psi < wedge_hi)
        t = np.clip((psi - psi_split) / max(wedge_hi - psi_split, 1e-3), 0, 1)
        src_psi[w_mask] = (psi_split + t * gus)[w_mask]
        m[w_mask] = (1 + t * (m_sleeve - 1))[w_mask]
        # Gap: beyond the underarm, the part of the wedge the sleeve rotated away from.
        gap = w_mask & (psi < psi_split + delta) & (r > r_pit * (1 - 0.3 * t))
        # Past the gap, sample the sleeve rigidly (continuous with the gusset's outer edge).
        after = w_mask & (psi >= psi_split + delta) & (r > r_pit * (1 - 0.3 * t))
        src_psi[after] = (psi - delta)[after]
        m[after] = m_sleeve
        rig = (psi >= wedge_hi) & (psi <= top)
        src_psi[rig] = (psi - delta)[rig]
        m[rig] = m_sleeve
        near = np.clip(r / 60.0, 0, 1)
        m = 1 + (m - 1) * near
        rr = r * m
        rad = np.radians(src_psi)
        nx = P[0] + sig * rr * np.sin(rad)
        ny = P[1] + rr * np.cos(rad)
        moved = w_mask | rig
        sx = np.where(moved, nx, sx)
        sy = np.where(moved, ny, sy)
        sx = np.where(gap, -1e6, sx)  # samples outside the image -> transparent
        sy = np.where(gap, -1e6, sy)
        if debug:
            print(f'{name} {side}: split {psi_split:.1f} axis {psi_axis:.1f} target {psi_t:.1f} delta {delta:.1f} shorten x{m_sleeve:.2f}')

    # Lift the shoulders (not the collar) so they sit on hers instead of below them.
    wx = np.clip((np.abs(xx - MODEL['cx']) - 30) / 60, 0, 1)
    wy = np.clip((400 - yy) / 140, 0, 1)
    sy = sy + J.get('lift', 0) * wx * wy

    # Scaled-source -> original source pixels.
    ox = J['zip_x'] + (sx - MODEL['cx']) / kx
    oy = J['collar_top'] + (sy - MODEL['collar_top']) / ky
    out = bilinear(src, ox, oy)
    out = np.clip(out, 0, 255).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(OUT + f'{name}-aligned.png')
    comp = model.convert('RGBA')
    comp.alpha_composite(Image.fromarray(out, 'RGBA'))
    comp.convert('RGB').save(OUT + f'{name}-preview.jpg', quality=92)


if __name__ == '__main__':
    for n in (sys.argv[1:] or JACKETS):
        fit(n, debug=True)
