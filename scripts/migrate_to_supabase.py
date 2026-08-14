import json
import urllib.request
import urllib.error
import time

SUPABASE_URL = "https://papwoytxbwwcljdfqiav.supabase.co"
SUPABASE_KEY = "sb_publishable_AJslsC3XOFCSZPjP5QulTA_NSLT6atA"

def parse_iso(d_str):
    if not d_str or str(d_str).lower() == 'total':
        return None
    parts = str(d_str).strip().split('/')
    if len(parts) == 3:
        try:
            m = int(parts[0])
            d = int(parts[1])
            y = int(parts[2])
            if y < 100:
                y += 2000
            return f"{y:04d}-{m:02d}-{d:02d}"
        except Exception:
            return None
    return None

def test_connection():
    url = f"{SUPABASE_URL}/rest/v1/associate_performance?select=count"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Range": "0-0"
    })
    try:
        with urllib.request.urlopen(req) as resp:
            print("Connection successful! Status code:", resp.status)
            return True
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code, e.read().decode('utf-8'))
        return False
    except Exception as e:
        print("Connection failed:", e)
        return False

def upload_data():
    with open('src/data/initialData.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"Loaded {len(data)} total records from initialData.json")

    # Format rows for Supabase
    rows_to_insert = []
    for r in data:
        iso = parse_iso(r.get('day'))
        rows_to_insert.append({
            "store": str(r.get('store', '1012')),
            "week": int(r.get('week', 0)),
            "associate": str(r.get('associate', '')).strip(),
            "day": str(r.get('day', '')),
            "iso_date": iso,
            "is_total": bool(r.get('isTotal', False)),
            "ftpr": float(r.get('ftpr', 0) or 0),
            "ftp_expected": int(r.get('ftpExpected', 0) or 0),
            "ftp_actual": int(r.get('ftpActual', 0) or 0),
            "pick_rate": float(r.get('pickRate', 0) or 0),
            "pick_hours": float(r.get('pickHours', 0) or 0),
            "picked_as_req": int(r.get('pickedAsReq', 0) or 0),
            "substitutions": int(r.get('substitutions', 0) or 0),
            "overrides": int(r.get('overrides', 0) or 0),
            "nil_picks": int(r.get('nilPicks', 0) or 0),
            "shift_hours": float(r.get('shiftHours', 0) or 0),
            "shift_pph": float(r.get('shiftPPH', 0) or 0),
            "utilization": float(r.get('utilization', 0) or 0),
            "non_pick_hours": float(r.get('nonPickHours', 0) or 0)
        })

    # Batch insert in chunks of 250
    batch_size = 250
    total_batches = (len(rows_to_insert) + batch_size - 1) // batch_size
    inserted = 0

    url = f"{SUPABASE_URL}/rest/v1/associate_performance"

    for i in range(0, len(rows_to_insert), batch_size):
        chunk = rows_to_insert[i:i + batch_size]
        payload = json.dumps(chunk).encode('utf-8')
        req = urllib.request.Request(url, data=payload, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        })
        try:
            with urllib.request.urlopen(req) as resp:
                inserted += len(chunk)
                batch_num = (i // batch_size) + 1
                print(f"Batch {batch_num}/{total_batches} uploaded ({inserted}/{len(rows_to_insert)} rows)")
        except urllib.error.HTTPError as e:
            print(f"Error on batch {i//batch_size + 1}:", e.code, e.read().decode('utf-8'))
            return
        except Exception as e:
            print(f"Exception on batch {i//batch_size + 1}:", e)
            return

    print(f"\nAll {inserted} records successfully inserted into Supabase database!")

if __name__ == '__main__':
    if test_connection():
        upload_data()
