import urllib.request
import json
import time

def test_radio_and_ack():
    # 1. Send Coach Voice Command
    url_cmd = "http://127.0.0.1:8000/api/radio/command"
    payload_cmd = {
        "transcript": "Radio check driver, confirm audio channel is loud and clear.",
        "action": "RADIO CHECK",
        "urgency": "INFO"
    }
    data = json.dumps(payload_cmd).encode("utf-8")
    req = urllib.request.Request(url_cmd, data=data, headers={"Content-Type": "application/json"})
    
    with urllib.request.urlopen(req) as resp:
        res_cmd = json.loads(resp.read().decode())
        print("1. Coach Radio Command Sent:")
        print(json.dumps(res_cmd, indent=2))
        assert res_cmd["status"] == "ok"
        msg_id = res_cmd["radio"]["id"]

    # 2. Simulate Driver Acoustic Receipt / Acknowledgment
    url_ack = "http://127.0.0.1:8000/api/radio/ack"
    payload_ack = {
        "id": msg_id,
        "action": "RADIO CHECK",
        "reply": "5 BY 5 - AUDIO LOUD & CLEAR",
        "time": "19:30:15"
    }
    data_ack = json.dumps(payload_ack).encode("utf-8")
    req_ack = urllib.request.Request(url_ack, data=data_ack, headers={"Content-Type": "application/json"})

    with urllib.request.urlopen(req_ack) as resp_ack:
        res_ack = json.loads(resp_ack.read().decode())
        print("\n2. Driver Acknowledgment & Ear-Piece Receipt Logged:")
        print(json.dumps(res_ack, indent=2))
        assert res_ack["status"] == "ok"
        assert res_ack["ack"]["audio_link_status"] == "CONFIRMED HEARD 5 BY 5"
        print("\nAll Voice Radio & Audio Link Verification Tests Passed!")

if __name__ == "__main__":
    test_radio_and_ack()
