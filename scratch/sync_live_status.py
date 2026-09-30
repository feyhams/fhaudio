import json
import urllib.request
import time

try:
    accs = json.load(open('data/accounts.json', encoding='utf-8'))
    active = next((a for a in accs if a.get('active')), accs[0] if accs else None)
    if not active:
        print("No active account")
        exit(0)
    api_key = active.get('apiKey')
    history = json.load(open('data/history.json', encoding='utf-8'))
    
    updated_count = 0
    approved_count = 0
    rejected_count = 0
    reviewing_count = 0

    for item in history:
        for part in item.get('parts', []):
            asset_id = str(part.get('assetId', '')).strip()
            if not asset_id:
                continue
            
            try:
                asset_url = f"https://apis.roblox.com/assets/v1/assets/{asset_id}"
                req = urllib.request.Request(asset_url, headers={'x-api-key': api_key})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    mod_state = data.get('moderationResult', {}).get('moderationState', '')
                    raw_lower = mod_state.lower()
                    
                    new_status = part.get('moderationStatus', 'unchecked')
                    if 'approved' in raw_lower:
                        new_status = 'approved'
                        approved_count += 1
                    elif 'rejected' in raw_lower or 'blocked' in raw_lower:
                        new_status = 'rejected'
                        rejected_count += 1
                    elif 'reviewing' in raw_lower:
                        new_status = 'reviewing'
                        reviewing_count += 1
                    
                    if new_status != part.get('moderationStatus'):
                        part['moderationStatus'] = new_status
                        updated_count += 1
                time.sleep(0.15)
            except Exception as e:
                pass

    with open('data/history.json', 'w', encoding='utf-8') as f:
        json.dump(history, f, indent=2, ensure_ascii=False)

    print(f"Sync complete! Checked assets: Approved={approved_count}, Rejected={rejected_count}, Reviewing={reviewing_count}. Changed={updated_count}")
except Exception as ex:
    print(f"Error: {ex}")
