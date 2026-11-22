#!/usr/bin/env python3
"""Recalculate OpenStruct controls and H-W05 without GeoStruct or dependencies.

Run from any directory: python scripts/references/openstruct_reference.py
Use --check to compare generated data with the versioned fixture, ignoring
whitespace/exponent spelling added by the repository's JSON formatter.
The extra H-W05 case uses a prescribed line 5 ft below the terrain: positive
pressure on the middle of the mass, without the source's coincident end cuts.
It does not replace either original A01 reference or its geometry diagnostic.

This is an analytical straight-terrain/lower-circle reference, not a second
implementation of the application's general polygon preparation. Mandatory
water/load cuts are split into equal angular intervals of at most 3 degrees.
The area primitive integrates the circular base exactly; the base length is
the endpoint chord, and pressure is sampled at the angular midpoint. Surcharge
uses its own clipped centroid and moment arm. Bishop uses undamped fixed-point
iteration and returns the evaluated F, never G(F), when its residual passes.

All fixture input/output values are SI. The original control's rounding of
mandatory cut abscissas to 12 decimal places in feet is retained explicitly.
Published P0/P1 checkpoints remain separate from this recalculation. These
controls and zero admissibility thresholds are not universal solver defaults
or independent engineering acceptance of the software.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


FT = 0.3048
LBF = 0.0044482216152605
PSF = LBF / FT**2
PCF = LBF / FT**3
FORCE_PER_WIDTH = LBF / FT
REPORT = "https://github.com/ricardocorsini/openstruct-front/issues/31#issuecomment-7047662690"
ISSUE = "https://github.com/ricardocorsini/geo-struct/issues/6"

# Literal source inputs, transcribed into the SI input by make_input(). The
# source uses pounds-force for a one-foot strip, not force per metre.
TERRAIN_FT = [(0, 0), (120, 48), (135, 48), (255, 0)]
WATER_FT = [
    (0, 40), (100, 40), (102.3, 39), (106, 38), (110.1, 37.2),
    (115, 36.3), (119.6, 35.5), (125.9, 34.6), (130.8, 33.8),
    (135.3, 33), (140.2, 32.3), (145.1, 31.4), (150.5, 30.6),
    (155.7, 29.7), (160, 28.9), (165.1, 28), (170.6, 26.9),
    (175.4, 25.9), (180.3, 25), (184.7, 24), (190.5, 22.7),
    (195.4, 21.6), (200.5, 20.4), (205.5, 19), (209.9, 17.8),
    (216.7, 15.3), (220.4, 13.8), (226, 11.6), (240.5, 5.8), (255, 0),
]
DEFINITIONS = [
    ("G01", 230, False, None),
    ("A01", 230, True, None),
    ("Q-total", 230, False, (185, 205)),
    ("Q-parcial", 230, False, (150, 170)),
    ("Q-fora", 230, False, (135, 150)),
    ("C-B", 225, False, None),
    ("A01-B", 225, True, None),
]

# Previously reviewed independent checkpoints, unchanged (dimensionless FS).
# Order: slices, Fellenius, P0 F/G/residual/k, P1 F/G/residual/k.
PUBLISHED = {
    "G01": [15, 2.093586037304625,
            2.141384778969102, 2.1413855641045565, 7.851354544285982e-7, 7,
            2.1413856393712685, 2.1413856465866807, 7.215412267669308e-9, 9],
    "A01": [23, 1.515515769812614,
            1.483098185707694, 1.4830988151837172, 6.29476023306097e-7, 7,
            1.4830989176265066, 1.4830989194460946, 1.8195880358007344e-9, 10],
    "Q-total": [16, 2.0648755760308566,
                2.1103999677930645, 2.1104007585978293, 7.90804764783104e-7, 7,
                2.110400835231005, 2.1104008426571634, 7.426158354917334e-9, 9],
    "Q-parcial": [16, 2.032477839017414,
                  2.0843462515186078, 2.084347151673944, 9.001553360477033e-7, 7,
                  2.0843472416071926, 2.0843472505922924, 8.98509977531603e-9, 9],
    "Q-fora": [15, 2.093586037304625,
               2.141384778969102, 2.1413855641045565, 7.851354544285982e-7, 7,
               2.1413856393712685, 2.1413856465866807, 7.215412267669308e-9, 9],
    "C-B": [17, 1.9914781633819232,
            2.0527350660164543, 2.052735863051332, 7.970348776531466e-7, 7,
            2.0527359419178666, 2.0527359497217006, 7.80383402343432e-9, 9],
    "A01-B": [25, 1.4152818931804636,
              1.394753553571059, 1.394753208924971, 3.4464608789086526e-7, 6,
              1.3947531570016125, 1.3947531491789913, 7.822621217457026e-9, 8],
}

# Original denominator (lbf per 1-ft strip), P0/P1 minimum effective normal
# stress (psf); retain these checkpoints as well as the dimensionless results.
PUBLISHED_DIMENSIONAL = {
    "G01": (12681.966877614675, 44.70573345166612, 44.705750627199606),
    "A01": (12682.308136821257, -6.440333255477146, -6.440311438338856),
    "Q-total": (13381.100350082646, 41.484697280455265, 41.48471481856115),
    "Q-parcial": (13258.242356431198, 93.052091235264, 93.05209209659813),
    "Q-fora": (12681.966877614675, 44.70573345166612, 44.705750627199606),
    "C-B": (17670.46865884219, 47.382332451330505, 47.382353038714946),
    "A01-B": (17670.700990169848, 14.775710519290547, 14.775694837593733),
}


def point(x: float, z: float) -> dict:
    return {"x": x, "z": z}


def make_input(xc_ft: float, wet: bool, load_ft: tuple | None) -> dict:
    return {
        "terrain": [point(x * FT, z * FT) for x, z in TERRAIN_FT],
        # GeoStruct requires the registered base strictly below every terrain
        # vertex. The source's z=0 foundation boundary stays separate: lowering
        # only this remote domain closure by 1 ft never intersects these masses.
        "baseElevationM": -FT,
        "sourceBaseElevationM": 0.0,
        "regions": [],
        "material": {
            "id": "homogeneous-effective",
            "unitWeightKNPerM3": 100 * PCF,
            "cohesionKPa": 100 * PSF,
            "frictionAngleDegrees": 30.0,
            "strengthMode": "effective",
        },
        "water": {
            "condition": "piezometric" if wet else "dry",
            "unitWeightKNPerM3": 62.4 * PCF,
            "line": [point(x * FT, z * FT) for x, z in WATER_FT] if wet else [],
            "externalWater": "none-on-the-analyzed-downstream-mass",
        },
        "loads": [] if load_ft is None else [{
            "id": "uniform-vertical",
            "leftXM": load_ft[0] * FT,
            "rightXM": load_ft[1] * FT,
            "intensityKPa": 100 * PSF,
            "enabled": True,
        }],
        "circle": {"center": point(xc_ft * FT, 110 * FT), "radiusM": 100 * FT},
        "movement": "left-to-right",
    }


def circle_line_roots(xc: float, zc: float, radius: float, slope: float, h: float) -> list:
    offset = slope * xc + h - zc
    a, b, c = 1 + slope**2, 2 * slope * offset, offset**2 - radius**2
    discriminant = b * b - 4 * a * c
    if discriminant < 0:
        return []
    root = math.sqrt(discriminant)
    return [xc + (-b - root) / (2 * a), xc + (-b + root) / (2 * a)]


def interpolate(points: list, x: float) -> tuple:
    for index, (a, b) in enumerate(zip(points, points[1:]), 1):
        if a["x"] <= x <= b["x"]:
            slope = (b["z"] - a["z"]) / (b["x"] - a["x"])
            return a["z"] + slope * (x - a["x"]), index
    raise ValueError("Reference line does not cover sample")


def bishop(slices: list, denominator: float, material: dict, tolerance: float) -> dict:
    tangent = math.tan(math.radians(material["frictionAngleDegrees"]))
    cohesion = material["cohesionKPa"]
    if not slices or not math.isfinite(denominator) or denominator <= 0:
        raise ValueError("Reference requires slices and a finite, positive driving denominator")
    if not math.isfinite(tangent) or not math.isfinite(cohesion):
        raise ValueError("Reference requires finite strength parameters")
    if not math.isfinite(tolerance) or tolerance <= 0:
        raise ValueError("Reference requires a finite, positive residual tolerance")
    required = ["sinAlpha", "cosAlpha", "bishopReducedNumeratorKNPerM", "weightKNPerM",
                "loadKNPerM", "pressureKPa", "widthM", "baseLengthM"]
    for s in slices:
        if any(not math.isfinite(s[key]) for key in required) or s["baseLengthM"] <= 0 or s["widthM"] <= 0:
            raise ValueError("Reference requires finite slice values and positive widths/base lengths")
    evaluated_f = 1.4
    history = []
    for k in range(1, 21):
        if not math.isfinite(evaluated_f) or evaluated_f <= 0:
            raise ValueError("Reference fixed-point iteration left the finite, positive F domain")
        factors = [s["cosAlpha"] + s["sinAlpha"] * tangent / evaluated_f for s in slices]
        if any(not math.isfinite(m) or m <= 0 for m in factors):
            raise ValueError("Reference requires finite, strictly positive Bishop m factors")
        mapped_f = math.fsum(s["bishopReducedNumeratorKNPerM"] / m for s, m in zip(slices, factors)) / denominator
        if not math.isfinite(mapped_f):
            raise ValueError("Nonfinite Bishop map outside the reference domain")
        residual = abs(mapped_f - evaluated_f)
        history.append({"k": k, "F": evaluated_f, "G": mapped_f,
                        "residual": residual, "minM": min(factors)})
        if residual <= tolerance or k == 20:
            break
        evaluated_f = mapped_f
    per_slice = []
    for s, m in zip(slices, factors):
        normal = (s["weightKNPerM"] + s["loadKNPerM"] - s["pressureKPa"] * s["widthM"]
                  - cohesion * s["baseLengthM"] * s["sinAlpha"] / evaluated_f) / m
        if not math.isfinite(normal) or not math.isfinite(normal / s["baseLengthM"]):
            raise ValueError("Nonfinite normal outside the reference domain")
        per_slice.append({"slice": s["number"], "m": m,
                          "normalForceKNPerM": normal,
                          "normalStressKPa": normal / s["baseLengthM"]})
    minimum_stress = min(s["normalStressKPa"] for s in per_slice)
    converged = residual <= tolerance
    return {
        "mathematicalStatus": "CONVERGIU" if converged else "NAO_CONVERGIU",
        "contactStatus": "TRACAO_NA_BASE" if minimum_stress < 0 else "OK",
        "eligibleFS": evaluated_f if converged and minimum_stress >= 0 else None,
        "F": evaluated_f, "G": mapped_f, "residual": residual, "evaluations": k,
        "minMAtF": min(factors),
        "minMOverIterations": min(h["minM"] for h in history),
        "minNormalForceKNPerM": min(s["normalForceKNPerM"] for s in per_slice),
        "minNormalStressKPa": minimum_stress,
        "tensionSliceCount": sum(s["normalStressKPa"] < 0 for s in per_slice),
        "history": history,
        "slicesAtReturnedF": per_slice,
    }


def calculate(model: dict) -> dict:
    xc = model["circle"]["center"]["x"]
    zc = model["circle"]["center"]["z"]
    radius = model["circle"]["radiusM"]
    # All seven controls intersect only the downstream straight terrain segment.
    a, b = model["terrain"][-2:]
    slope = (b["z"] - a["z"]) / (b["x"] - a["x"])
    intercept = a["z"] - slope * a["x"]
    crosses = [x for x in circle_line_roots(xc, zc, radius, slope, intercept)
               if a["x"] <= x <= b["x"] and slope * x + intercept <= zc]
    if len(crosses) != 2:
        raise ValueError("Expected two lower-circle intersections on downstream segment")
    left, right = sorted(crosses)
    mandatory = [left, right]
    water = model["water"]["line"]
    if water:
        mandatory.extend(p["x"] for p in water if left < p["x"] < right)
        for a, b in zip(water, water[1:]):
            wm = (b["z"] - a["z"]) / (b["x"] - a["x"])
            wh = a["z"] - wm * a["x"]
            mandatory.extend(x for x in circle_line_roots(xc, zc, radius, wm, wh)
                             if max(a["x"], left) < x < min(b["x"], right) and wm * x + wh <= zc)
    for load in model["loads"]:
        mandatory.extend(x for x in [load["leftXM"], load["rightXM"]] if left < x < right)
    # Reproduce the documented source's discretisation before SI conversion.
    mandatory = sorted({round(x / FT, 12) * FT for x in mandatory})
    material = model["material"]
    gamma, c = material["unitWeightKNPerM3"], material["cohesionKPa"]
    tangent = math.tan(math.radians(material["frictionAngleDegrees"]))
    slices, segments, cut_positions = [], [], [mandatory[0]]
    for segment, (a, b) in enumerate(zip(mandatory, mandatory[1:]), 1):
        ta, tb = math.asin((a - xc) / radius), math.asin((b - xc) / radius)
        count = math.ceil(math.degrees(tb - ta) / 3)
        segments.append({"number": segment, "leftXM": a, "rightXM": b, "sliceCount": count})
        for j in range(count):
            tl, tr = ta + (tb - ta) * j / count, ta + (tb - ta) * (j + 1) / count
            tm = (tl + tr) / 2
            xl, xr = xc + radius * math.sin(tl), xc + radius * math.sin(tr)
            zl, zr = zc - radius * math.cos(tl), zc - radius * math.cos(tr)
            width, ell = xr - xl, math.hypot(xr - xl, zr - zl)
            # Local coordinates avoid subtracting large global x^2 terms.
            dl, dr = xl - xc, xr - xc
            primitive = lambda t: radius**2 / 2 * (math.sin(t) * math.cos(t) + t)
            area = (slope * xc + intercept - zc) * width + slope / 2 * (dr**2 - dl**2) + primitive(tr) - primitive(tl)
            weight = gamma * area
            alpha = -tm
            sine, cosine = math.sin(alpha), math.cos(alpha)
            sample = point(xc + radius * math.sin(tm), zc - radius * math.cos(tm))
            water_z, water_segment = interpolate(water, sample["x"]) if water else (None, None)
            head = water_z - sample["z"] if water_z is not None else 0.0
            pressure = model["water"]["unitWeightKNPerM3"] * max(0.0, head)
            contributions = []
            for load in model["loads"]:
                clip_left, clip_right = max(xl, load["leftXM"]), min(xr, load["rightXM"])
                if clip_right <= clip_left:
                    continue
                load_x = (clip_left + clip_right) / 2
                force = load["intensityKPa"] * (clip_right - clip_left)
                arm = xc - load_x
                contributions.append({"loadId": load["id"], "leftXM": clip_left,
                                      "rightXM": clip_right, "widthM": clip_right - clip_left,
                                      "application": point(load_x, slope * load_x + intercept),
                                      "forceKNPerM": force, "drivingArmM": arm,
                                      "drivingMomentKN": force * arm,
                                      "drivingContributionKNPerM": force * arm / radius})
            load_force = math.fsum(p["forceKNPerM"] for p in contributions)
            load_moment = math.fsum(p["drivingMomentKN"] for p in contributions)
            load_driving = math.fsum(p["drivingContributionKNPerM"] for p in contributions)
            normal = (weight + load_force - pressure * width) * cosine
            friction, cohesive = normal * tangent, c * ell
            slices.append({
                "number": len(slices) + 1, "segment": segment,
                "left": point(xl, zl), "right": point(xr, zr),
                "thetaLeftRadians": tl, "thetaRightRadians": tr,
                "widthM": width, "baseLengthM": ell,
                "alphaRadians": alpha, "alphaDegrees": math.degrees(alpha),
                "sinAlpha": sine, "cosAlpha": cosine,
                "areaM2": area, "weightKNPerM": weight,
                "pressureSample": sample, "waterSegment": water_segment,
                "waterElevationM": water_z, "signedWaterHeadM": head,
                "pressureKPa": pressure, "pressureTimesWidthKNPerM": pressure * width,
                "loadContributions": contributions, "loadKNPerM": load_force,
                "loadDrivingMomentKN": load_moment, "loadDrivingKNPerM": load_driving,
                "weightDrivingKNPerM": weight * sine,
                "drivingKNPerM": weight * sine + load_driving,
                "felleniusNormalForceKNPerM": normal,
                "felleniusNormalStressKPa": normal / ell,
                "felleniusFrictionKNPerM": friction, "cohesionKNPerM": cohesive,
                "bishopReducedNumeratorKNPerM": c * width + (weight + load_force - pressure * width) * tangent,
            })
            cut_positions.append(xr)
    total_keys = ["areaM2", "weightKNPerM", "loadKNPerM", "loadDrivingMomentKN",
                  "loadDrivingKNPerM", "weightDrivingKNPerM", "drivingKNPerM",
                  "felleniusFrictionKNPerM", "cohesionKNPerM"]
    totals = {k: math.fsum(s[k] for s in slices) for k in total_keys}
    denominator = totals["drivingKNPerM"]
    fs = (totals["felleniusFrictionKNPerM"] + totals["cohesionKNPerM"]) / denominator
    minimum_stress = min(s["felleniusNormalStressKPa"] for s in slices)
    return {
        "sliceCount": len(slices), "intersections": [point(x, slope * x + intercept) for x in [left, right]],
        "mandatoryCutsXM": mandatory, "cutsXM": cut_positions, "segments": segments,
        "slices": slices, "totals": totals,
        "fellenius": {
            "mathematicalFS": fs,
            "contactStatus": "TRACAO_NA_BASE" if minimum_stress < 0 else "OK",
            "eligibleFS": fs if minimum_stress >= 0 else None,
            "minNormalForceKNPerM": min(s["felleniusNormalForceKNPerM"] for s in slices),
            "minNormalStressKPa": minimum_stress,
        },
        "bishop": {"P0": bishop(slices, denominator, material, 1e-6),
                   "P1": bishop(slices, denominator, material, 1e-8)},
    }


def published(case_id: str) -> dict:
    values = PUBLISHED[case_id]
    dimensional = PUBLISHED_DIMENSIONAL[case_id]
    result = {"sourceUrl": REPORT, "sliceCount": values[0], "felleniusFS": values[1],
              "drivingKNPerM": dimensional[0] * FORCE_PER_WIDTH}
    for name, offset in [("P0", 2), ("P1", 6)]:
        f, g, residual, count = values[offset:offset + 4]
        minimum_stress = dimensional[1 if name == "P0" else 2] * PSF
        result[name] = {"F": f, "G": g, "residual": residual, "evaluations": count,
                        "minNormalStressKPa": minimum_stress,
                        "contactStatus": "TRACAO_NA_BASE" if minimum_stress < 0 else "OK",
                        "eligibleFS": f if minimum_stress >= 0 else None}
    return result


def build_catalog() -> dict:
    cases = []
    for case_id, xc, wet, load in DEFINITIONS:
        model = make_input(xc, wet, load)
        cases.append({"id": case_id, "sourceUrl": REPORT, "classification": "team-controlled-geometry",
                      "input": model, "expected": calculate(model), "published": published(case_id)})
    return {
        "schema": "geostruct-independent-reference-catalog/1",
        "version": 1,
        "id": "openstruct-controls-2026-11",
        "provenance": {
            "sourceUrl": REPORT, "implementationIssueUrl": ISSUE,
            "reviewedOn": "2026-11-19",
            "sourceDescription": "OpenStruct controls G01/A01/Q/C using team-defined circles A/B and the downstream straight terrain from Duncan, Wright and Brandon (2014), section 7.7.7.",
            "materialConvention": "These geometry controls use gamma=100 pcf from the figure, not gamma=125 pcf from the manual slice tables. They are not a reproduction of the published critical circle.",
            "waterConvention": "The upstream reservoir does not act on the analyzed downstream mass; A01 uses only the prescribed piezometric pressure.",
            "domainBaseConvention": "The source foundation boundary is z=0 m. The registration domain closes at z=-0.3048 m (one foot lower), strictly below all terrain vertices. This domain extension never intersects the circular sliding masses, so physical inputs and numerical expectations are unchanged.",
            "independence": "Python standard library; closed-form circle/line intersections and area integral; no GeoStruct imports or production outputs.",
            "scope": "Regression/reference comparison only. Does not establish general solver tolerances, engineering acceptance or a global critical surface.",
        },
        "units": {"length": "m", "area": "m2", "unitWeight": "kN/m3", "stress": "kPa",
                  "forcePerWidth": "kN/m", "momentPerWidth": "kN", "angle": "rad (explicit degree fields also provided)"},
        "conversion": {"metresPerFoot": FT, "kilonewtonsPerPoundForce": LBF,
                       "kPaPerPsf": PSF, "kNPerM3PerPcf": PCF,
                       "kNPerMPerSourcePoundForce": FORCE_PER_WIDTH,
                       "sourceForceConvention": "lbf for a one-foot out-of-plane strip; divide by 0.3048 m when converting to kN/m"},
        "profiles": {
            "geometry": {"toleranceM": 1e-8, "maxArcDegrees": 3.0,
                         "sourceMandatoryCutRoundingFeetDecimals": 12},
            "P0": {"F0": 1.4, "residualTolerance": 1e-6, "maxEvaluations": 20},
            "P1": {"F0": 1.4, "residualTolerance": 1e-8, "maxEvaluations": 20},
            "admissibility": {"drivingThresholdKNPerM": 0.0, "mThreshold": 0.0,
                              "tensionToleranceKPa": 0.0,
                              "scope": "Strict reference screening only; not product defaults"},
            "comparison": {"absoluteFS": 1e-9,
                           "scope": "Only these identical inputs/discretisation/profiles"},
        },
        "caseCount": len(cases), "sliceCount": sum(c["expected"]["sliceCount"] for c in cases),
        "cases": cases,
    }


def build_homogeneous_water(profiles: dict) -> dict:
    model = make_input(230, False, None)
    model["water"]["condition"] = "piezometric"
    model["water"]["line"] = [point(x * FT, (z - 5) * FT) for x, z in TERRAIN_FT]
    expected = calculate(model)
    gaps = [b - a for a, b in zip(expected["mandatoryCutsXM"], expected["mandatoryCutsXM"][1:])]
    if min(gaps) <= profiles["geometry"]["toleranceM"]:
        raise ValueError("The additional water reference has unresolved mandatory cuts")
    if max(s["pressureKPa"] for s in expected["slices"]) <= 0:
        raise ValueError("The additional water reference must exercise positive pore pressure")
    if any(v["contactStatus"] != "OK" or v["mathematicalStatus"] != "CONVERGIU"
           for v in expected["bishop"].values()):
        raise ValueError("The additional water reference must retain converged compressive contact")
    return {
        "schema": "geostruct-independent-reference-case/1",
        "version": 1,
        "id": "H-W05",
        "classification": "own-extra",
        "publication": None,
        "provenance": {
            "sourceUrl": None,
            "baselineControlsSourceUrl": REPORT,
            "implementationIssueUrl": ISSUE,
            "description": "Additional team-defined homogeneous wet control. Same terrain, effective soil and circle A as G01; prescribed water is 5 ft (1.524 m) below every terrain vertex, interpolated through all four vertices.",
            "publication": None,
            "reviewStatus": "Not a previously published or independently reviewed control. Automatically reproduced for issue #6; human engineering review remains deferred.",
            "independence": "Recalculated with analytical areas, prescribed pressure, clipped load moments and equilibrium equations in this Python standard-library script; no production imports or outputs.",
            "sourceBaseElevationM": 0.0,
            "domainBaseConvention": "Registration domain closes 1 ft below the source foundation boundary, outside the entire sliding mass; no physical change to the analyzed mass.",
            "scope": "Additional regression reference with positive pore pressure. Original A01/A01-B inputs and expectations remain unchanged; their coincident-end-cut diagnostic is not bypassed.",
        },
        "units": {"length": "m", "area": "m2", "unitWeight": "kN/m3", "stress": "kPa",
                  "forcePerWidth": "kN/m", "momentPerWidth": "kN", "angle": "rad (explicit degree fields also provided)"},
        "profiles": profiles,
        "input": model,
        "expected": expected,
    }


def validate_checkpoints(catalog: dict) -> float:
    maximum = 0.0
    for case in catalog["cases"]:
        expected, checkpoint = case["expected"], case["published"]
        if expected["sliceCount"] != checkpoint["sliceCount"]:
            raise ValueError(f"Slice count changed for {case['id']}")
        if abs(expected["totals"]["drivingKNPerM"] - checkpoint["drivingKNPerM"]) > 1e-9:
            raise ValueError(f"Denominator changed for {case['id']}")
        deltas = [abs(expected["fellenius"]["mathematicalFS"] - checkpoint["felleniusFS"])]
        for profile in ["P0", "P1"]:
            a, b = expected["bishop"][profile], checkpoint[profile]
            if a["evaluations"] != b["evaluations"]:
                raise ValueError(f"Evaluation count changed for {case['id']}/{profile}")
            if a["contactStatus"] != b["contactStatus"] or abs(a["minNormalStressKPa"] - b["minNormalStressKPa"]) > 1e-9:
                raise ValueError(f"Contact checkpoint changed for {case['id']}/{profile}")
            deltas.extend(abs(a[key] - b[key]) for key in ["F", "G", "residual"])
        maximum = max(maximum, *deltas)
    if maximum > 1e-9:
        raise ValueError(f"Published FS checkpoints changed: max delta {maximum}")
    return maximum


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify committed fixture data without writing")
    parser.add_argument("--output", type=Path, help="override controls JSON path (default: repository fixture)")
    parser.add_argument("--water-output", type=Path, help="override H-W05 JSON path (default: homogeneous-water.json beside controls)")
    args = parser.parse_args()
    default_output = Path(__file__).resolve().parents[2] / "tests/fixtures/reference-catalog/openstruct.json"
    output = args.output or default_output
    catalog = build_catalog()
    delta = validate_checkpoints(catalog)
    water = build_homogeneous_water(catalog["profiles"])
    water_output = args.water_output or output.with_name("homogeneous-water.json")
    for destination, data in [(output, catalog), (water_output, water)]:
        rendered = (json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode("utf-8")
        if args.check:
            if not destination.exists() or json.loads(destination.read_text(encoding="utf-8")) != data:
                raise SystemExit(f"Reference fixture differs: {destination}")
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(rendered)
    print(f"{catalog['caseCount']} cases; {catalog['sliceCount']} slices; maximum published FS/G/residual delta={delta:.3g}")
    print(f"Additional own reference H-W05: {water['expected']['sliceCount']} slices; positive pore pressure; no prior publication or human review")


if __name__ == "__main__":
    main()
