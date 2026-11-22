#!/usr/bin/env python3
"""Independent, standard-library reference for GeoStruct issue #6.

No GeoStruct module, process, exported result or solver is used.  The geometric
inputs below are transcribed from the illustrative default project.  Straight
line/circle roots and antiderivatives give all areas; the limit-equilibrium
equations are written directly from the documented source formulation.

Run from any directory:
    python scripts/references/stratified_search_reference.py
Use --output PATH to write elsewhere.  The default output is relative to this
script, not to a particular contributor's checkout or home directory.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from pathlib import Path


INPUTS = {
    "units": {"length": "m", "forcePerWidth": "kN/m", "stress": "kPa"},
    "movement": "left-to-right",
    "terrain": [[0, 22], [18, 22], [38, 10], [60, 10]],
    "domainBaseZM": 0,
    "materials": {
        "background": {
            "name": "Solo residual",
            "unitWeightKNPerM3": 19,
            "cohesionKPa": 0,
            "frictionDegrees": 28,
            "mode": "effective",
        },
        "fill": {
            "name": "Aterro compactado",
            "unitWeightKNPerM3": 18,
            "cohesionKPa": 0,
            "frictionDegrees": 30,
            "mode": "effective",
        },
    },
    "fillPolygon": [[0, 15], [0, 22], [18, 22], [38, 10], [60, 10],
                    [60, 6], [38, 6], [18, 15]],
    "fillLowerBoundary": [[0, 15], [18, 15], [38, 6], [60, 6]],
    "water": {
        "type": "piezometric",
        "line": [[0, 12], [18, 12], [38, 7], [60, 7]],
        "unitWeightKNPerM3": 9.81,
    },
    "surcharge": {"enabled": True, "fromXM": 5, "toXM": 14,
                  "intensityKPa": 20},
    "fixedCircle": {"centerXM": 32, "centerZM": 32, "radiusM": 25},
    "searchAxes": {"centerXM": [30, 32, 34], "centerZM": [30, 32, 34],
                   "radiusM": [23, 25, 27]},
}

PROFILE = {
    "name": "P1 (approved reference profile; not a universal design criterion)",
    "geometry": {"toleranceM": 1e-8, "maxArcDegrees": 3},
    "equilibrium": {"drivingThresholdKNPerM": 0, "tensionToleranceKPa": 0},
    "bishop": {"initialFactor": 1.4, "residualTolerance": 1e-8,
               "maxIterations": 20, "singularityThreshold": 0},
    "nearTieTolerance": 1e-6,
}

EPS = PROFILE["geometry"]["toleranceM"]


def validate_scope() -> None:
    """Refuse extensions that the intentionally specialised oracle cannot model."""
    if set(INPUTS["materials"]) != {"background", "fill"}:
        raise ValueError("Reference is limited to background and one overlying fill")
    for material in INPUTS["materials"].values():
        if material["cohesionKPa"] != 0 or material["mode"] != "effective":
            raise ValueError("Equations here require c=0 and effective mode in both materials")
    load = INPUTS["surcharge"]
    if (set(load) != {"enabled", "fromXM", "toXM", "intensityKPa"}
            or load["enabled"] is not True or load["fromXM"] >= load["toXM"]
            or load["intensityKPa"] < 0):
        raise ValueError("Reference supports one enabled, uniform downward surcharge only")
    terrain = INPUTS["terrain"]
    lower = INPUTS["fillLowerBoundary"]
    expected_polygon = [lower[0], *terrain, *reversed(lower[1:])]
    if (INPUTS["fillPolygon"] != expected_polygon
            or [p[0] for p in lower] != [p[0] for p in terrain]
            or any(a[1] >= b[1] for a, b in zip(lower, terrain))):
        raise ValueError("Not a general polygon oracle: fill must occupy terrain down to fillLowerBoundary")
    if INPUTS["movement"] != "left-to-right":
        raise ValueError("This reference has explicitly left-to-right moment signs")
    if INPUTS["water"]["type"] != "piezometric":
        raise ValueError("This reference requires the prescribed piezometric line")


def ordinate(polyline: list[list[float]], x: float) -> float:
    for (xa, za), (xb, zb) in zip(polyline, polyline[1:]):
        if xa - EPS <= x <= xb + EPS:
            return za + (zb - za) * (x - xa) / (xb - xa)
    raise ValueError("Reference would require extrapolation")


def circle_z(circle: dict, x: float) -> float:
    s = x - circle["centerXM"]
    return circle["centerZM"] - math.sqrt(circle["radiusM"] ** 2 - s * s)


def roots(polyline: list[list[float]], circle: dict) -> list[float]:
    """Solve s² + (h - m s)² = R² separately on every straight segment."""
    xc, zc, radius = (circle[k] for k in ("centerXM", "centerZM", "radiusM"))
    result = []
    for (xa, za), (xb, zb) in zip(polyline, polyline[1:]):
        m = (zb - za) / (xb - xa)
        h = zc - (za + m * (xc - xa))
        discriminant = (1 + m * m) * radius * radius - h * h
        if discriminant < 0:
            continue
        root = math.sqrt(discriminant)
        for s in ((h * m - root) / (1 + m * m),
                  (h * m + root) / (1 + m * m)):
            x = xc + s
            if xa - EPS <= x <= xb + EPS and h - m * s >= 0:
                # Anchor a root at an original vertex only within the explicit
                # geometric tolerance. This is a stated cut convention.
                if abs(x - xa) <= EPS:
                    x = float(xa)
                elif abs(x - xb) <= EPS:
                    x = float(xb)
                if not any(abs(x - old) <= EPS for old in result):
                    result.append(x)
    return sorted(result)


def line_integral(polyline: list[list[float]], left: float, right: float) -> float:
    """Exact trapezoidal integral of a piecewise linear profile."""
    xs = [left] + [p[0] for p in polyline if left < p[0] < right] + [right]
    return math.fsum((b - a) * (ordinate(polyline, a) + ordinate(polyline, b)) / 2
                     for a, b in zip(xs, xs[1:]))


def circle_integral(circle: dict, left: float, right: float) -> float:
    """Integral of zc - sqrt(R²-s²), using its analytic antiderivative."""
    radius = circle["radiusM"]
    def primitive(x: float) -> float:
        s = x - circle["centerXM"]
        return (s * math.sqrt(radius * radius - s * s)
                + radius * radius * math.asin(s / radius)) / 2
    return circle["centerZM"] * (right - left) - primitive(right) + primitive(left)


def mandatory_cuts(circle: dict) -> tuple[list[dict], list[str]]:
    crossings = roots(INPUTS["terrain"], circle)
    if len(crossings) != 2:
        return [], ["terrain-crossings-not-two"]
    left, right = crossings
    if left <= INPUTS["terrain"][0][0] + EPS or right >= INPUTS["terrain"][-1][0] - EPS:
        return [], ["terrain-domain-contact"]
    if circle["centerZM"] - circle["radiusM"] <= INPUTS["domainBaseZM"] + EPS:
        return [], ["domain-base-contact"]
    # On each straight terrain segment, terrain minus the lower arc is concave.
    # Once all roots are enumerated, checking an interior point per segment
    # establishes the positive side between the two transversal crossings.
    xs = [left] + [p[0] for p in INPUTS["terrain"] if left < p[0] < right] + [right]
    for a, b in zip(xs, xs[1:]):
        x = (a + b) / 2
        if ordinate(INPUTS["terrain"], x) <= circle_z(circle, x):
            return [], ["mass-not-above-lower-arc"]
    raw = [(left, "terrain-intersection:entry"),
           (right, "terrain-intersection:exit")]
    for i, (x, _) in enumerate(INPUTS["terrain"]):
        raw.append((float(x), f"terrain-node:{i}"))
    # All polygon boundaries matter for arc crossings, including the coincident
    # upper boundary. There is only one noncoincident internal interface here.
    for x in roots(INPUTS["fillLowerBoundary"], circle):
        raw.append((x, "fill-lower-interface-crossing"))
    for x in roots(INPUTS["water"]["line"], circle):
        raw.append((x, "water-arc-crossing"))
    for i, (x, _) in enumerate(INPUTS["water"]["line"]):
        raw.append((float(x), f"water-node:{i}"))
    for k in ("fromXM", "toXM"):
        raw.append((float(INPUTS["surcharge"][k]), f"surcharge:{k}"))
    cuts = []
    for x, reason in sorted(raw):
        if not left - EPS <= x <= right + EPS:
            continue
        if cuts and x == cuts[-1]["xM"]:
            cuts[-1]["reasons"].append(reason)
        elif cuts and x - cuts[-1]["xM"] <= EPS:
            return [], ["distinct-mandatory-cuts-too-close"]
        else:
            cuts.append({"xM": x, "reasons": [reason]})
    return cuts, []


def geometry(circle: dict, max_degrees: float) -> tuple[list[dict], list[dict], list[str]]:
    cuts, errors = mandatory_cuts(circle)
    if errors:
        return [], [], errors
    xc, radius = circle["centerXM"], circle["radiusM"]
    xs = [cuts[0]["xM"]]
    for a, b in zip(cuts, cuts[1:]):
        ta, tb = (math.asin((c["xM"] - xc) / radius) for c in (a, b))
        n = math.ceil(math.degrees(tb - ta) / max_degrees)
        xs.extend(xc + radius * math.sin(ta + (tb - ta) * j / n)
                  if j < n else b["xM"] for j in range(1, n + 1))
    slices = []
    for left, right in zip(xs, xs[1:]):
        tl, tr = (math.asin((x - xc) / radius) for x in (left, right))
        tm = (tl + tr) / 2
        xm = xc + radius * math.sin(tm)
        zm = circle["centerZM"] - radius * math.cos(tm)
        zl, zr = circle_z(circle, left), circle_z(circle, right)
        width = right - left
        chord = math.hypot(width, zr - zl)
        alpha = -tm
        # The top is the terrain; the fill occupies the portion above its lower
        # interface. Circle/interface crossings already split every interval.
        total_area = line_integral(INPUTS["terrain"], left, right) - circle_integral(circle, left, right)
        if zm >= ordinate(INPUTS["fillLowerBoundary"], xm):
            fill_area = total_area
            background_area = 0.0
            base_material = "fill"
        else:
            fill_area = (line_integral(INPUTS["terrain"], left, right)
                         - line_integral(INPUTS["fillLowerBoundary"], left, right))
            background_area = total_area - fill_area
            base_material = "background"
        areas = {"background": background_area, "fill": fill_area}
        weight = math.fsum(area * INPUTS["materials"][key]["unitWeightKNPerM3"]
                           for key, area in areas.items())
        head = ordinate(INPUTS["water"]["line"], xm) - zm
        pressure = INPUTS["water"]["unitWeightKNPerM3"] * max(0, head)
        qleft = max(left, INPUTS["surcharge"]["fromXM"])
        qright = min(right, INPUTS["surcharge"]["toXM"])
        load = INPUTS["surcharge"]["intensityKPa"] * max(0, qright - qleft)
        application_x = (qleft + qright) / 2 if load else None
        load_arm = xc - application_x if load else 0.0
        moment = load * load_arm
        dweight = weight * math.sin(alpha)
        dload = moment / radius
        material = INPUTS["materials"][base_material]
        slices.append({
            "number": len(slices) + 1,
            "leftXM": left, "rightXM": right,
            "topLeftZM": ordinate(INPUTS["terrain"], left),
            "topRightZM": ordinate(INPUTS["terrain"], right),
            "baseLeftZM": zl, "baseRightZM": zr,
            "widthM": width, "chordLengthM": chord,
            "arcLengthM": radius * (tr - tl),
            "arcDegrees": math.degrees(tr - tl),
            "midpoint": {"xM": xm, "zM": zm},
            "alphaRadians": alpha, "sinAlpha": math.sin(alpha),
            "cosAlpha": math.cos(alpha),
            "baseMaterial": base_material,
            "areaM2": total_area, "materialAreasM2": areas,
            "weightKNPerM": weight,
            "waterHeadM": head, "pressureKPa": pressure,
            "waterForceKNPerM": pressure * chord,
            "surchargeKNPerM": load, "surchargeApplicationXM": application_x,
            "surchargeArmM": load_arm, "surchargeMomentKNMPerM": moment,
            "drivingWeightKNPerM": dweight, "drivingLoadKNPerM": dload,
            "drivingKNPerM": dweight + dload,
            "tanPhi": math.tan(math.radians(material["frictionDegrees"])),
        })
    return slices, cuts, []


def fellenius(slices: list[dict], driving: float) -> dict:
    rows = []
    for s in slices:
        normal = (s["weightKNPerM"] + s["surchargeKNPerM"]
                  - s["pressureKPa"] * s["widthM"]) * s["cosAlpha"]
        rows.append({"number": s["number"], "normalKNPerM": normal,
                     "stressKPa": normal / s["chordLengthM"],
                     "resistanceKNPerM": normal * s["tanPhi"]})
    resistance = math.fsum(s["resistanceKNPerM"] for s in rows)
    min_stress = min(s["stressKPa"] for s in rows)
    factor = resistance / driving if driving > 0 else None
    eligible = factor is not None and factor > 0 and min_stress >= 0
    return {"status": "calculated" if eligible else "rejected",
            "eligible": eligible, "mathematicalFactor": factor,
            "factorOfSafety": factor if eligible else None,
            "drivingKNPerM": driving, "resistanceKNPerM": resistance,
            "minimumStressKPa": min_stress, "slices": rows}


def bishop(slices: list[dict], driving: float) -> dict:
    profile = PROFILE["bishop"]
    factor = profile["initialFactor"]
    history = []
    rows = []
    for iteration in range(1, profile["maxIterations"] + 1):
        rows = []
        for s in slices:
            m = s["cosAlpha"] + s["sinAlpha"] * s["tanPhi"] / factor
            if not math.isfinite(m) or m <= profile["singularityThreshold"]:
                return {"status": "rejected", "eligible": False,
                        "factorOfSafety": None, "iterations": iteration,
                        "reason": "singularity", "history": history}
            normal = (s["weightKNPerM"] + s["surchargeKNPerM"]
                      - s["pressureKPa"] * s["widthM"]) / m
            rows.append({"number": s["number"], "m": m,
                         "normalKNPerM": normal,
                         "stressKPa": normal / s["chordLengthM"],
                         "resistanceKNPerM": normal * s["tanPhi"]})
        resistance = math.fsum(s["resistanceKNPerM"] for s in rows)
        update = resistance / driving
        residual = abs(update - factor)
        history.append({"iteration": iteration, "evaluatedFactor": factor,
                        "update": update, "residual": residual,
                        "resistanceKNPerM": resistance})
        if residual <= profile["residualTolerance"]:
            min_stress = min(s["stressKPa"] for s in rows)
            eligible = factor > 0 and min_stress >= 0
            return {"status": "calculated" if eligible else "rejected",
                    "eligible": eligible, "mathematicalFactor": factor,
                    "factorOfSafety": factor if eligible else None,
                    "evaluatedFactor": factor, "update": update,
                    "residual": residual, "iterations": iteration,
                    "drivingKNPerM": driving, "resistanceKNPerM": resistance,
                    "minimumStressKPa": min_stress,
                    "history": history, "slices": rows}
        if not math.isfinite(update) or update <= 0:
            break
        factor = update
    last = history[-1]
    return {"status": "nonconverged", "eligible": False,
            "factorOfSafety": None, "iterations": len(history),
            "evaluatedFactor": last["evaluatedFactor"], "update": last["update"],
            "residual": last["residual"], "history": history}


def evaluate(circle: dict, max_degrees: float = 3, details: bool = False) -> dict:
    slices, cuts, errors = geometry(circle, max_degrees)
    record = {"circle": circle.copy(), "maxArcDegrees": max_degrees,
              "geometryStatus": "rejected" if errors else "prepared",
              "geometryDiagnostics": errors, "sliceCount": len(slices)}
    if errors:
        return record
    driving = math.fsum(s["drivingKNPerM"] for s in slices)
    assert driving > 32 * math.ulp(1.0) * math.fsum(abs(s["drivingKNPerM"]) for s in slices)
    assert all(s["areaM2"] > 0 and min(s["materialAreasM2"].values()) >= 0 for s in slices)
    assert all(abs(math.fsum(s["materialAreasM2"].values()) - s["areaM2"]) < 1e-10 for s in slices)
    totals = {
        "areaM2": math.fsum(s["areaM2"] for s in slices),
        "materialAreasM2": {m: math.fsum(s["materialAreasM2"][m] for s in slices)
                            for m in INPUTS["materials"]},
        "baseMaterialSliceCounts": dict(Counter(s["baseMaterial"] for s in slices)),
        "weightKNPerM": math.fsum(s["weightKNPerM"] for s in slices),
        "surchargeKNPerM": math.fsum(s["surchargeKNPerM"] for s in slices),
        "surchargeMomentKNMPerM": math.fsum(s["surchargeMomentKNMPerM"] for s in slices),
        "drivingKNPerM": driving,
    }
    record.update({"entryXM": slices[0]["leftXM"], "exitXM": slices[-1]["rightXM"],
                   "totals": totals, "fellenius": fellenius(slices, driving),
                   "bishop": bishop(slices, driving)})
    if details:
        record.update({"mandatoryCuts": cuts, "slices": slices})
    else:
        for method in ("fellenius", "bishop"):
            for key in ("slices", "history"):
                record[method].pop(key, None)
    return record


def search(max_degrees: float) -> dict:
    axes = INPUTS["searchAxes"]
    candidates = []
    for ix, x in enumerate(axes["centerXM"]):
        for iz, z in enumerate(axes["centerZM"]):
            for ir, radius in enumerate(axes["radiusM"]):
                candidate = evaluate({"centerXM": x, "centerZM": z, "radiusM": radius}, max_degrees)
                candidate.update({"number": len(candidates) + 1,
                                  "gridIndices": {"centerX": ix, "centerZ": iz, "radius": ir}})
                candidates.append(candidate)
    minima = {}
    counts = {"geometry": dict(Counter(c["geometryStatus"] for c in candidates))}
    for method in ("fellenius", "bishop"):
        counts[method] = dict(Counter(c.get(method, {}).get("status", "not-evaluated") for c in candidates))
        admissible = [c for c in candidates if c.get(method, {}).get("eligible")]
        if not admissible:
            minima[method] = None
            continue
        winner = min(admissible, key=lambda c: c[method]["factorOfSafety"])
        fs = winner[method]["factorOfSafety"]
        boundary_axes = [axis for axis, index in winner["gridIndices"].items() if index in (0, 2)]
        minima[method] = {
            "candidateNumber": winner["number"], "circle": winner["circle"],
            "factorOfSafety": fs, "sliceCount": winner["sliceCount"],
            "gridIndices": winner["gridIndices"], "boundaryAxes": boundary_axes,
            "exactTies": [c["number"] for c in admissible
                          if c["number"] != winner["number"] and c[method]["factorOfSafety"] == fs],
            "nearTies": [c["number"] for c in admissible
                         if 0 < c[method]["factorOfSafety"] - fs <= PROFILE["nearTieTolerance"]],
        }
    return {"maxArcDegrees": max_degrees, "candidateCount": len(candidates),
            "enumeration": "centerX ascending outer; centerZ ascending middle; radius ascending inner",
            "counts": counts, "minima": minima, "candidates": candidates}


def build_reference() -> dict:
    validate_scope()
    fixed = evaluate(INPUTS["fixedCircle"], details=True)
    coarse = search(3)
    refined = search(1.5)
    # Check independently enumerated search identity, not only its winning FS.
    fixed_candidate = next(c for c in coarse["candidates"] if c["circle"] == INPUTS["fixedCircle"])
    assert fixed_candidate["number"] == 14
    assert fixed_candidate["sliceCount"] == fixed["sliceCount"]
    for method in ("fellenius", "bishop"):
        assert fixed_candidate[method]["factorOfSafety"] == fixed[method]["factorOfSafety"]
    return {
        "schema": "geostruct-independent-reference/1", "id": "stratified-search",
        "title": "Illustrative two-material slope with piezometric line and own-arm surcharge",
        "provenance": {
            "inputSource": ["src/domain/default-project.ts", "src/domain/model.ts:exampleProject"],
            "inputKind": "Repository-owned illustrative inputs; not site, experimental or normative parameters",
            "oracle": "Standalone Python standard library; no imports, execution or outputs of GeoStruct solvers",
            "geometry": "Line-circle quadratic roots; analytic antiderivative of sqrt(R^2-(x-xc)^2); exact piecewise-linear integrals",
            "sources": [
                {"title": "Duncan, Wright and Brandon (2014), Soil Strength and Slope Stability, 2nd ed.",
                 "locator": "Sections 6.5.1-6.5.3, pp. 89-93; section 14.5.2, pp. 242-245; Fellenius equation 6.59",
                 "role": "Equation formulation as documented in the approved technical base; not a published benchmark geometry"},
                {"title": "USACE EM 1110-2-1902 (2003)",
                 "url": "https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1902.pdf",
                 "locator": "C-12 projected-water Fellenius; F-4/F-6 simplified Bishop; section 4-2e circular search",
                 "role": "Equations; does not prescribe this profile or illustrative geometry"},
                {"title": "Approved D1-D5 technical base",
                 "url": "https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6850038580",
                 "role": "Slice convention and formulation selected by the project"},
            ],
            "equations": {
                "arc": "z=zc-sqrt(R^2-(x-xc)^2)",
                "primitive": "Integral sqrt(R^2-s^2) ds = (s sqrt(R^2-s^2)+R^2 asin(s/R))/2",
                "weight": "W=sum(gamma_material * area_material)",
                "pressure": "u=gamma_w max(0,z_water(x_mid_arc)-z_mid_arc)",
                "surcharge": "Q=q overlap_width; xq=overlap_midpoint; Mq=Q(xc-xq)",
                "driving": "D=sum(W sin(alpha)+Mq/R)",
                "fellenius": "N=(W+Q-u b) cos(alpha); FS=sum(N tan(phi))/D (c=0 here)",
                "bishop": "m=cos(alpha)+sin(alpha)tan(phi)/F; N=(W+Q-u b)/m; G(F)=sum(N tan(phi))/D (c=0 here)",
            },
        },
        "scope": {
            "supportedHere": ["lower circular arc", "two effective materials", "c=0",
                              "piezometric pressure", "one vertical uniform surcharge", "27 finite-grid candidates"],
            "limitations": ["Not a published engineering benchmark or approval of site stability",
                            "Not a global-minimum claim beyond the explicitly enumerated grid",
                            "Specialised fill-above-lower-boundary integration; not a general polygon or arbitrary layering oracle",
                            "No mixed total/effective base modes, vertical terrain faces, external water or interrupted writes",
                            "Binary64 math; keep unrounded intermediates; displaying FS to 3 decimals does not set acceptance tolerance"],
        },
        "inputs": INPUTS, "profile": PROFILE,
        "cutConvention": "Entry/exit, terrain vertices, circle/material-interface crossings, water vertices and circle-water crossings, active load bounds; angular subdivision preserves those mandatory cuts",
        "fixedCircle": fixed, "search": coarse,
        "refinement": {"purpose": "Keep all circles and mandatory cuts; reduce angular opening only",
                       "fixedCircle": evaluate(INPUTS["fixedCircle"], 1.5, details=True),
                       "search": refined},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[2] / "tests" / "fixtures" /
                        "reference-catalog" / "stratified-search.json")
    parser.add_argument("--check", action="store_true",
                        help="Recompute and compare parsed JSON without rewriting the fixture")
    args = parser.parse_args()
    reference = build_reference()
    if args.check:
        expected = json.loads(args.output.read_text(encoding="utf-8"))
        if expected != reference:
            raise SystemExit("Reference differs from recomputation")
        print("Reference matches independent recomputation (parsed JSON, full precision)")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(reference, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    for name, result in (("fixed", reference["fixedCircle"]),):
        print(f"{name}: {result['sliceCount']} slices")
        for method in ("fellenius", "bishop"):
            print(f"  {method}: {result[method]['status']}, FS={result[method]['factorOfSafety']}")
    for record in (reference["search"], reference["refinement"]["search"]):
        print(f"search {record['maxArcDegrees']} degrees: {record['counts']}")
        print(json.dumps(record["minima"], ensure_ascii=False))


if __name__ == "__main__":
    main()
