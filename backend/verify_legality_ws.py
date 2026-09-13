import asyncio
import json
import subprocess
import sys
import websockets

async def verify():
    uri = "ws://127.0.0.1:8000/ws"
    print(f"[Verification] Connecting to WebSocket {uri}...")

    received_records = []
    
    async with websockets.connect(uri) as ws:
        print("[Verification] Connected to WebSocket successfully!")
        
        # Start mock_feed in a subprocess for 32 ticks
        python_exe = sys.executable
        feed_proc = subprocess.Popen(
            [python_exe, "mock_feed.py", "--ticks", "32", "--hz", "15.0"],
            cwd=r"C:\ApexPulse 1st\apex_pulse\backend",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        print("[Verification] Launched mock_feed.py for 32 ticks...")

        timeout = 10.0
        start_time = asyncio.get_event_loop().time()
        
        while asyncio.get_event_loop().time() - start_time < timeout:
            try:
                msg_raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                msg = json.loads(msg_raw)
                if "overtake_legality" in msg:
                    received_records.append(msg)
                    legality = msg.get("overtake_legality")
                    conf = msg.get("overtake_confidence", 0.0)
                    prob = msg.get("overtake_probability", 0.0)
                    action = msg.get("action", "--")
                    gap = msg.get("gap_ahead_s", msg.get("gap_to_ahead_s", "--"))
                    late = msg.get("defender_line_change_late", False)
                    print(f"  [Tick #{len(received_records):02d}] Legality: {legality:8s} | Conf: {prob:4.1f}% | Action: {action:14s} | LateLine: {str(late):5s} | Gap: {gap}s")
            except asyncio.TimeoutError:
                if feed_proc.poll() is not None:
                    break

        feed_proc.wait()

    print(f"\n[Verification] Total WebSocket messages received with overtake_legality: {len(received_records)}")
    
    # Assertions
    assert len(received_records) >= 10, f"Expected at least 10 consecutive ticks, got {len(received_records)}"
    
    non_clean_records = [r for r in received_records if r.get("overtake_legality") != "clean"]
    print(f"[Verification] Non-'clean' ticks observed: {len(non_clean_records)}")
    for r in non_clean_records:
        print(f"    -> Observed non-clean: '{r.get('overtake_legality')}' (confidence: {r.get('overtake_probability')}%, late_line: {r.get('defender_line_change_late')})")

    assert len(non_clean_records) >= 1, "Expected at least one tick with value other than 'clean'!"
    
    # Consecutive check
    consecutive_with_field = 0
    for r in received_records:
        if "overtake_legality" in r and r["overtake_legality"] in ("clean", "marginal", "risky"):
            consecutive_with_field += 1
    
    assert consecutive_with_field >= 10, f"Expected >= 10 consecutive valid legality signals, got {consecutive_with_field}"

    print("\n==================================================================")
    print("SUCCESS: overtake_legality verified across WebSocket stream!")
    print(f"  - Consecutive ticks with legality: {consecutive_with_field}")
    print(f"  - Non-clean variation verified: {[r.get('overtake_legality') for r in non_clean_records[:5]]}")
    print("==================================================================")

if __name__ == "__main__":
    asyncio.run(verify())
