import urllib.request
import json

def run_test():
    url = 'http://127.0.0.1:8000/laps'
    with urllib.request.urlopen(url) as r:
        data = json.loads(r.read().decode('utf-8'))
        print('=== APEX PULSE /laps ENDPOINT VERIFICATION ===')
        print('Data Source:', data.get('data_source'))
        print('Total Laps in Race:', data.get('total_laps'))
        print('Overtake KPIs:', json.dumps(data.get('overtake_kpis'), indent=2))
        ot_laps = [l for l in data.get('laps', []) if l.get('overtake', {}).get('has_overtake_event')]
        print(f'Total Laps with Verified Kaggle Overtakes: {len(ot_laps)}')
        print('\nFirst 5 Overtake Laps:')
        for l in ot_laps[:5]:
            ot = l['overtake']
            print(f"  Lap {l['lap']}: {ot['attacking_driver']} ({ot['attacking_team']}) passing {ot['target_driver']} ({ot['target_team']})")
            print(f"         Zone: {ot['pass_zone']}")
            print(f"         Speed: +{ot['peak_closing_speed_kph']} km/h (Apex: {ot['apex_speed_kph']} km/h) | Energy: {ot['overtake_energy_mj']} MJ")
            print(f"         Risk:Reward Ratio: {ot['risk_ratio_str']} | Outcome: {ot['outcome']}")

    with urllib.request.urlopen('http://127.0.0.1:8000/kaggle-overtakes') as r2:
        data_kg = json.loads(r2.read().decode('utf-8'))
        print('\n=== /kaggle-overtakes ENDPOINT ===')
        print('Total Kaggle Overtake Events:', data_kg.get('total_overtakes'))
        print('Source:', data_kg.get('source'))

    with urllib.request.urlopen('http://127.0.0.1:5173/') as r3:
        print('\n=== FRONTEND UI STATUS ===')
        print('HTTP Code:', r3.status)
        print('Frontend is live at http://127.0.0.1:5173 / http://localhost:5173')

if __name__ == '__main__':
    run_test()
