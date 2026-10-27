"""
Turn "STREET between A and B" closure text into GeoJSON LineStrings,
using DataSF "Streets - Active and Retired" (3psu-pn9h) centerlines.

    python closures_to_geojson.py closures.txt > closures.geojson

closures.txt = one closure per line (exactly the format you pasted).
Paste the output into geojson.io; each feature's "name" is the closure text.
"""
import heapq, json, re, sys, urllib.request
from collections import defaultdict

URL = "https://data.sfgov.org/resource/3psu-pn9h.geojson?$limit=100000"


def norm(s):
    """Normalize names: 06TH -> 6TH, O'FARRELL -> OFARRELL, collapse spaces."""
    s = (s or "").upper().replace("'", "").replace(".", "")
    s = re.sub(r"\b0+(\d)", r"\1", s)
    return re.sub(r"\s+", " ", s).strip()


def names_at(field):
    """f_st / t_st can hold several names, e.g. 'MARKET ST \\ 17TH ST'."""
    return {norm(p) for p in re.split(r"[\\/&]| AND ", field or "") if p.strip()}


def lines_of(geom):
    if geom["type"] == "LineString":
        return geom["coordinates"]
    return [pt for part in geom["coordinates"] for pt in part]  # MultiLineString


def load_streets():
    with urllib.request.urlopen(URL.replace("$", "%24"), timeout=120) as r:
        feats = json.load(r)["features"]
    by_street = defaultdict(list)
    for f in feats:
        p = f["properties"]
        if str(p.get("active", "true")).lower() not in ("true", "1"):
            continue
        if not f.get("geometry"):
            continue
        by_street[norm(p.get("streetname"))].append(f)
    return by_street


def seg_len(coords):
    return sum(((a[0]-b[0])**2 + (a[1]-b[1])**2) ** .5 for a, b in zip(coords, coords[1:]))


def build_graph(segs):
    g = defaultdict(list)          # node -> [(neighbor, seg_index, forward?)]
    cross = defaultdict(set)       # node -> cross-street names at that node
    for i, f in enumerate(segs):
        p = f["properties"]
        a, b = p["f_node_cnn"], p["t_node_cnn"]
        g[a].append((b, i, True))
        g[b].append((a, i, False))
        cross[a] |= names_at(p.get("f_st"))
        cross[b] |= names_at(p.get("t_st"))
    return g, cross


def endpoints(name, g, cross, other_nodes=None):
    name = norm(name)
    if "STREET END" in name or name.startswith("START"):
        # dead ends of this street; pick the ones nearest the other end later
        return [n for n in g if len(g[n]) == 1]
    return [n for n in g if name in cross[n]]


def shortest(g, segs, starts, goals):
    goals = set(goals)
    pq = [(0, s, None) for s in starts]
    prev, seen = {}, set()
    while pq:
        d, n, via = heapq.heappop(pq)
        if n in seen:
            continue
        seen.add(n)
        prev[n] = via
        if n in goals:
            path = []
            while prev[n]:
                frm, i, fwd = prev[n]
                path.append((i, fwd))
                n = frm
            return path[::-1]
        for nb, i, fwd in g[n]:
            if nb not in seen:
                c = seg_len(lines_of(segs[i]["geometry"]))
                heapq.heappush(pq, (d + c, nb, (n, i, fwd)))
    return None


def stitch(segs, path):
    out = []
    for i, fwd in path:
        c = lines_of(segs[i]["geometry"])
        c = c if fwd else c[::-1]
        out.extend(c if not out else c[1:])
    return out


def split_closures(line):
    # "A between X and Y, B between Z and street end" -> two closures
    return [p.strip() for p in re.split(r",\s*(?=[^,]+ between )", line) if p.strip()]


def main(path):
    streets = load_streets()
    features, problems = [], []
    for group_id, raw in enumerate(open(path), 1):
        raw = raw.strip()
        if not raw or " between " not in raw.lower():
            continue
        for part in split_closures(raw):
            m = re.match(r"(.+?) between (.+?) and (.+)$", part, re.I)
            if not m:
                problems.append((part, "could not parse"))
                continue
            street, a, b = m.groups()
            segs = streets.get(norm(street))
            if not segs:
                problems.append((part, "street not found"))
                continue
            g, cross = build_graph(segs)
            na, nb = endpoints(a, g, cross), endpoints(b, g, cross)
            if norm(a) == norm(b):
                problems.append((part, "same cross street on both ends; check manually"))
                continue
            p = shortest(g, segs, na, nb) if na and nb else None
            if not p:
                problems.append((part, "no connected route between cross streets"))
                continue
            features.append({
                "type": "Feature",
                "properties": {"name": part, "street": street.strip(),
                               "from": a.strip(), "to": b.strip(),
                               "group": group_id,
                               "cnns": [segs[i]["properties"]["cnn"] for i, _ in p]},
                "geometry": {"type": "LineString", "coordinates": stitch(segs, p)},
            })
    json.dump({"type": "FeatureCollection", "features": features}, sys.stdout, indent=2)
    for part, why in problems:
        print(f"NEEDS REVIEW: {part}  ({why})", file=sys.stderr)


if __name__ == "__main__":
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "closures.txt")
    if not os.path.exists(src):
        sys.exit(f"Can't find {src}. Put your closure list in a file named "
                 f"closures.txt next to this script, or pass its path.")
    if len(sys.argv) > 1:
        main(src)                      # prints GeoJSON to the terminal / redirect
    else:
        out = os.path.join(here, "closures.geojson")
        with open(out, "w") as fh:
            sys.stdout = fh
            main(src)
        sys.stdout = sys.__stdout__
        print(f"Wrote {out}")
