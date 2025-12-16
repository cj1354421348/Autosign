import requests

BASE_URL = "http://127.0.0.1:8000"
# Matches the NOTIFY_KEY in backend/.env
API_KEY = "my-fixed-secret-key-123"

def test_push_only():
    print(f"Testing Push API against {BASE_URL}...")
    
    headers = {
        "X-Project-Key": API_KEY,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    # Payload with project_name (Auto-create/Find logic)
    payload = {
        "project_name": "Python-Test-Script",
        "title": "Push Test",
        "content": "This is a notification sent using ONLY the API Key.",
        "level": "info"
    }
    
    print("\n[1] Sending Notification...")
    try:
        resp = requests.post(f"{BASE_URL}/api/notify", json=payload, headers=headers)
        if resp.status_code == 200:
            print(f"SUCCESS: Notification sent.")
            print(f"Response: {resp.json()}")
        else:
            print(f"FAILED: Status {resp.status_code}")
            print(f"Body: {resp.text}")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_push_only()
