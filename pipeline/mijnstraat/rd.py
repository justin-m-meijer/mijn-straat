"""Rijksdriehoekscoördinaten (EPSG:28992) naar WGS84, benadering van Schreutelkamp & Strang van Hees.

Nauwkeurig tot ongeveer een meter; ruim voldoende voor 'binnen 500 m'.
"""
from __future__ import annotations

X0, Y0 = 155_000.0, 463_000.0
PHI0, LAM0 = 52.15517440, 5.38720621

_K = [
    (0, 1, 3235.65389), (2, 0, -32.58297), (0, 2, -0.24750), (2, 1, -0.84978),
    (0, 3, -0.06550), (2, 2, -0.01709), (1, 0, -0.00738), (4, 0, 0.00530),
    (2, 3, -0.00039), (4, 1, 0.00033), (1, 1, -0.00012),
]
_L = [
    (1, 0, 5260.52916), (1, 1, 105.94684), (1, 2, 2.45656), (3, 0, -0.81885),
    (1, 3, 0.05594), (3, 1, -0.05607), (0, 1, 0.01199), (3, 2, -0.00256),
    (1, 4, 0.00128), (0, 2, 0.00022), (2, 0, -0.00022), (5, 0, 0.00026),
]


def rd_to_wgs84(x: float, y: float) -> tuple[float, float]:
    dx = (x - X0) * 1e-5
    dy = (y - Y0) * 1e-5
    phi = PHI0 + sum(k * dx**p * dy**q for p, q, k in _K) / 3600
    lam = LAM0 + sum(l * dx**p * dy**q for p, q, l in _L) / 3600
    return round(phi, 6), round(lam, 6)
