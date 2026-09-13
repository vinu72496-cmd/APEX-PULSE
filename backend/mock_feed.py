"""
mock_feed.py — Telemetry Feed Simulator for APEX PULSE.

Simulates 20 Hz race telemetry stream and pushes it to the backend via:
  1. HTTP POST to http://localhost:8000/telemetry (ingest)
  2. UDP datagrams to 127.0.0.1:20777 (for UDP telemetry listener)

Verifies the end-to-end loop:
  mock_feed -> backend -> DualModelCore -> ComplianceGuard -> WebSocket -> React Dashboard

Injects compliance boundary test conditions during the run to verify
that the ComplianceGuard triggers with guard_intervened: true.
"""
import argparse
import json
import socket
import time
import urllib.request
import urllib.error


def run_mock_feed(host="127.0.0.1", port=8000, udp_port=20777, hz=20.0, total_ticks=0):
    period = 1.0 / hz
    udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    url = f"http://{host}:{port}/telemetry"

    print(f"[mock_feed] Starting 20 Hz telemetry stream to {url} and UDP 127.0.0.1:{udp_port}", flush=True)
    print("[mock_feed] Press Ctrl+C to stop.", flush=True)

    tick = 0
    soc = 0.65
    lap = 1
    stint_laps = 30
    gap = 2.4
    speed = 285.0
    guard_triggered_count = 0

    try:
        while True:
            tick += 1
            elapsed = tick * period
            lap = min(stint_laps, 1 + int(elapsed / 8.0))

            # Simulate natural race dynamics and steward legality scenarios
            defender_late = False
            axle_overlap = False

            if 15 <= tick <= 20:
                # Scenario: Defender moved late under braking in striking distance -> "risky"
                defender_late = True
                axle_overlap = False
                gap = 0.52
                closing_speed = 12.0
                speed = 318.0
                drs = 1
                soc = 0.62
            elif 21 <= tick <= 26:
                # Scenario: Defender late twitch with moderate gap -> "marginal"
                defender_late = True
                axle_overlap = False
                gap = 0.82
                closing_speed = 6.0
                speed = 302.0
                drs = 1
                soc = 0.60
            elif 30 <= tick <= 45:
                # Deliberate low-SOC injection to test Compliance Guard floor
                soc = 0.025
                gap = 0.6  # Would normally trigger OVERTAKE mode, but guard must veto!
                speed = 295.0
                drs = 1
                closing_speed = 8.5
            else:
                soc = max(0.04, min(0.98, soc - 0.001 if tick % 3 == 0 else soc + 0.0005))
                gap = max(0.3, min(6.0, gap + (0.02 if tick % 7 == 0 else -0.015)))
                speed = 280.0 + (15.0 if gap < 1.0 else 0.0)
                drs = 1 if gap < 1.0 else 0
                closing_speed = 8.5 if drs else 2.0

            sector_delta = -0.15 if drs else 0.05
            tyre_age_delta = 2.0

            payload = {
                "type": "telemetry",
                "tick": tick,
                "lap": lap,
                "soc": round(soc, 3),
                "gap_to_ahead_s": round(gap, 2),
                "gap_ahead_s": round(gap, 2),
                "speed_kph": round(speed, 1),
                "sector_delta_s": round(sector_delta, 2),
                "tyre_age_delta": round(tyre_age_delta, 1),
                "closing_speed_kph": round(closing_speed, 1),
                "gap_distance_m": round(gap * 65.0, 1),
                "drs_available": drs,
                "drs": drs,
                "defender_line_change_late": defender_late,
                "front_axle_overlap": axle_overlap,
                "lap_frac_remaining": round(max(0.0, 1.0 - lap / stint_laps), 3),
            }

            # 1. Send UDP packet
            try:
                udp_data = json.dumps(payload).encode("utf-8")
                udp_sock.sendto(udp_data, ("127.0.0.1", udp_port))
            except Exception:
                pass

            # 2. Push to backend HTTP ingest
            decision = None
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=1.0) as resp:
                    resp_json = json.loads(resp.read().decode("utf-8"))
                    decision = resp_json.get("decision", {})
            except Exception as e:
                # Backend might not be up yet or only listening on UDP
                pass

            if decision:
                mode = decision.get("mode", "--")
                go = "GO" if decision.get("overtake_go") else "HOLD"
                conf = decision.get("overtake_confidence", 0.0)
                legality = str(decision.get("overtake_legality", "clean")).upper()
                intervened = decision.get("guard_intervened", False)
                reasons = decision.get("guard_reasons", [])
                if intervened:
                    guard_triggered_count += 1
                    status_str = f"GUARD INTERVENED: TRUE ({'; '.join(reasons)})"
                else:
                    status_str = "GUARD: Nominal"

                print(
                    f"[{tick:04d}] Lap {lap} | Gap {gap:4.2f}s | "
                    f"Mode: {mode:8s} | Overtake: {go} ({conf*100:4.1f}%) | "
                    f"Legality: {legality:8s} | {status_str}",
                    flush=True
                )
            else:
                print(f"[{tick:04d}] Lap {lap} | SOC {soc*100:4.1f}% | Gap {gap:4.2f}s | Speed {speed:.0f} kph (Sent)", flush=True)

            if total_ticks > 0 and tick >= total_ticks:
                print(f"[mock_feed] Completed {total_ticks} ticks. Guard intervened {guard_triggered_count} times.", flush=True)
                break

            time.sleep(period)

    except KeyboardInterrupt:
        print("\n[mock_feed] Stopped by user.", flush=True)
    finally:
        udp_sock.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="APEX PULSE Mock Telemetry Feed")
    parser.add_argument("--host", default="127.0.0.1", help="Backend host")
    parser.add_argument("--port", type=int, default=8000, help="Backend HTTP port")
    parser.add_argument("--udp_port", type=int, default=20777, help="Backend UDP port")
    parser.add_argument("--hz", type=float, default=20.0, help="Feed rate in Hz")
    parser.add_argument("--ticks", type=int, default=0, help="Total ticks (0 = infinite)")
    args = parser.parse_args()

    run_mock_feed(host=args.host, port=args.port, udp_port=args.udp_port, hz=args.hz, total_ticks=args.ticks)

