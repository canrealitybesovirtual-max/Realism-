"""Shared geography for the real-Manhattan city view.

Game frame: origin at the apartment (111 W 57th St), y up, x along the street
grid's east (Manhattan "east"), -z along the grid's north (up the avenues), so the
grid lines up with the game axes. Real world: lat / lon (WGS84), Web Mercator for
the aerial service. All distances in metres.
"""
import json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WORLD = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(WORLD, '.cache', 'nyc')        # downloads (not committed)
OUT = os.path.join(WORLD, 'bake', 'data')            # processed data the baker reads
os.makedirs(CACHE, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

CFG = json.load(open(os.path.join(HERE, 'config.json')))
LAT0, LON0 = CFG['lat0'], CFG['lon0']
GRID = math.radians(CFG['gridDeg'])                  # street grid, clockwise from true north
CA, SA = math.cos(GRID), math.sin(GRID)
PHI = math.radians(LAT0)
MLAT = 111132.92 - 559.82 * math.cos(2 * PHI) + 1.175 * math.cos(4 * PHI)
MLON = 111412.84 * math.cos(PHI) - 93.5 * math.cos(3 * PHI)
R_MERC = 6378137.0
R_EARTH = 6371000.0


def ll_to_game(lat, lon):
    """lat / lon (arrays ok) -> game x, z."""
    e = (np.asarray(lon) - LON0) * MLON
    n = (np.asarray(lat) - LAT0) * MLAT
    x = e * CA - n * SA
    z = -(e * SA + n * CA)
    return x, z


def game_to_ll(x, z):
    x = np.asarray(x, dtype=np.float64); m = -np.asarray(z, dtype=np.float64)
    e = x * CA + m * SA
    n = -x * SA + m * CA
    return LAT0 + n / MLAT, LON0 + e / MLON


def ll_to_merc(lat, lon):
    lat = np.asarray(lat, dtype=np.float64); lon = np.asarray(lon, dtype=np.float64)
    X = R_MERC * np.radians(lon)
    Y = R_MERC * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
    return X, Y


def curvature_drop(x, z):
    """Height the ground falls below the origin's tangent plane (m)."""
    d2 = np.asarray(x) ** 2 + np.asarray(z) ** 2
    return d2 / (2 * R_EARTH)
