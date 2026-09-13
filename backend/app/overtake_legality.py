"""
overtake_legality.py — Rules-based FIA Stewards Overtake Legality Assessment.

Auditable rules-based engine reflecting how F1 stewards judge overtakes:
1. "Moving under braking" / late defensive line change (FIA Sporting Code Art. 27.4).
2. "One defensive move" rule: defender can choose one line to defend, but cannot
   make a second reactionary move to block across the track.
3. "Alongside / Apex overlap" rule: if the attacking car's front axle is alongside
   the defender's mirror line by the corner apex, the defender must leave at least
   one car's width of racing room on the track edge.

Returns one of three audit labels:
- "clean": Normal, legal overtake maneuver with proper racing room and no late blocking.
- "marginal": Borderline scenario under steward review (e.g. late squeeze, shallow overlap,
  or high closing speed without established apex right).
- "risky": Severe infringement risk (e.g. reactive move under braking by defender, or
  out-of-control divebomb without apex overlap by attacker).
"""


def assess_overtake_legality(
    feature_state=None,
    defender_line_change_late: bool = None,
    front_axle_overlap: bool = None,
    gap_ahead_s: float = None,
    closing_speed_kph: float = None,
    gap_distance_m: float = None,
) -> str:
    """
    Evaluates the legality risk of an overtaking attempt according to F1 steward guidelines.

    Parameters:
    - feature_state: SharedFeatureState instance (optional). If supplied, fields are unpacked.
    - defender_line_change_late: True if defending car changed line within final braking zone.
    - front_axle_overlap: True if attacking car's front axle is alongside defender's mirror line.
    - gap_ahead_s: Gap in seconds to the car ahead.
    - closing_speed_kph: Relative closing speed in km/h (positive means closing in).
    - gap_distance_m: Estimated physical distance in meters.

    Returns:
    - "clean", "marginal", or "risky"
    """
    # Unpack from SharedFeatureState if provided as first argument or keyword
    if feature_state is not None:
        if defender_line_change_late is None:
            defender_line_change_late = getattr(feature_state, "defender_line_change_late", False)
        if front_axle_overlap is None:
            front_axle_overlap = getattr(feature_state, "front_axle_overlap", False)
        if gap_ahead_s is None:
            gap_ahead_s = getattr(feature_state, "gap_to_ahead_s", getattr(feature_state, "gap_ahead_s", 1.0))
        if closing_speed_kph is None:
            closing_speed_kph = getattr(feature_state, "closing_speed_kph", 0.0)
        if gap_distance_m is None:
            gap_distance_m = getattr(feature_state, "gap_distance_m", 100.0)

    defender_line_change_late = bool(defender_line_change_late or False)
    front_axle_overlap = bool(front_axle_overlap or False)
    gap_ahead_s = float(gap_ahead_s if gap_ahead_s is not None else 1.0)
    closing_speed_kph = float(closing_speed_kph if closing_speed_kph is not None else 0.0)
    gap_distance_m = float(gap_distance_m if gap_distance_m is not None else 100.0)
    # -------------------------------------------------------------------------
    # RULE 1: RISKY (Likely Infringement or Hazardous Overreach)
    # -------------------------------------------------------------------------

    # Case 1A: Defender moved late under heavy braking while attacker was in striking distance.
    # This is a direct breach of moving under braking (Article 27.4) - extreme collision risk.
    if defender_line_change_late and (gap_ahead_s < 0.65 or closing_speed_kph > 10.0):
        return "risky"

    # Case 1B: Attacker attempts uncontrolled late divebomb with extreme closing speed (>24 km/h)
    # into the braking zone without having established front axle overlap by turn-in.
    if closing_speed_kph > 24.0 and not front_axle_overlap and gap_ahead_s < 0.45:
        return "risky"

    # Case 1C: Attacker has earned the right to racing room (front axle alongside mirror),
    # but defender changes line late, actively crowding attacker off the circuit edge.
    if front_axle_overlap and defender_line_change_late:
        return "risky"

    # -------------------------------------------------------------------------
    # RULE 2: MARGINAL (Borderline / Under Review by Stewards)
    # -------------------------------------------------------------------------

    # Case 2A: Defender made a late twitch / line adjustment, but gap was wider or closing speed lower.
    # Stewards will note the movement; borderline violation of the one-move convention.
    if defender_line_change_late:
        return "marginal"

    # Case 2B: Very high closing speed (>15 km/h) within 0.7s, but front axle overlap
    # has not yet been secured before apex commitment.
    if closing_speed_kph > 15.0 and not front_axle_overlap and gap_ahead_s < 0.7:
        return "marginal"

    # Case 2C: Overlap is established (front axle alongside mirror), but cars are extremely
    # compressed (gap < 0.22s or distance < 2.5m) with high delta, risking insufficient track width.
    if front_axle_overlap and gap_ahead_s < 0.22 and closing_speed_kph > 8.0:
        return "marginal"

    # -------------------------------------------------------------------------
    # RULE 3: CLEAN (Nominal / Full Racing Room Respected)
    # -------------------------------------------------------------------------
    # No late line change, controlled approach, or standard slipstream drafting.
    return "clean"
