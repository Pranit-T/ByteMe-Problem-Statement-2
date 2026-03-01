"""
ByteMe System Health Test
Runs a full end-to-end verification of the live Render backend.
Usage: python system_test.py
"""
import requests
import json
import os

BASE_URL = "https://byte-expert-backend.onrender.com/api"

GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")

AUTH_HEADERS = {}
if GROQ_KEY:
    AUTH_HEADERS["x-groq-key"] = GROQ_KEY
if OPENAI_KEY:
    AUTH_HEADERS["x-openai-key"] = OPENAI_KEY

PASS = "\033[92m[PASS]\033[0m"
FAIL = "\033[91m[FAIL]\033[0m"
SKIP = "\033[93m[SKIP]\033[0m"
INFO = "\033[94m[INFO]\033[0m"

def run_test(name, fn):
    try:
        result = fn()
        print(f"{PASS} {name}: {result}")
        return True
    except AssertionError as e:
        print(f"{FAIL} {name}: {e}")
        return False
    except Exception as e:
        print(f"{FAIL} {name}: Unexpected error → {type(e).__name__}: {e}")
        return False

def test_health():
    r = requests.get(f"{BASE_URL}/health", timeout=20)
    assert r.status_code == 200, f"HTTP {r.status_code}"
    assert r.json().get("status") == "ok", f"Response: {r.json()}"
    return f"HTTP 200, status=ok"

def test_expert_roles_builtin():
    roles = ["SoftwareEngineer", "BusinessConsultant", "AgricultureExpert", "CivilEngineer", "Educator"]
    for role in roles:
        r = requests.get(f"{BASE_URL}/role-rules/{role}", timeout=15)
        assert r.status_code == 200, f"Role '{role}' → HTTP {r.status_code}"
        data = r.json()
        assert "expert_rules" in data, f"Missing expert_rules for {role}"
        assert "roadmap" in data, f"Missing roadmap for {role}"
    return f"All {len(roles)} built-in roles returned rules + roadmap"

def test_custom_roles_endpoint():
    r = requests.get(f"{BASE_URL}/custom-roles", timeout=15)
    assert r.status_code == 200, f"HTTP {r.status_code}"
    data = r.json()
    assert "roles" in data, f"No 'roles' key in response: {data}"
    count = len(data["roles"])
    return f"HTTP 200, {count} custom roles found in Supabase"

def test_ask_expert():
    if not GROQ_KEY:
        raise SkipTest("GROQ_API_KEY env var not set — pass key to test live inference")
    r = requests.post(
        f"{BASE_URL}/ask-expert",
        json={"question": "What is the SOLID principle?", "plugin": "SoftwareEngineer", "provider": "groq"},
        headers=AUTH_HEADERS,
        timeout=60
    )
    assert r.status_code == 200, f"HTTP {r.status_code} — {r.text[:300]}"
    data = r.json()
    assert "answer" in data, f"Missing 'answer' in response"
    assert "accuracy" in data, f"Missing 'accuracy' in response"
    return f"HTTP 200. Accuracy={data.get('accuracy')}%. Model={data.get('generated_by_model','?')}"

def test_ask_base_model():
    if not GROQ_KEY:
        raise SkipTest("GROQ_API_KEY env var not set")
    r = requests.post(
        f"{BASE_URL}/ask-expert",
        json={"question": "What is cloud computing?", "plugin": "none", "provider": "groq"},
        headers=AUTH_HEADERS,
        timeout=60
    )
    assert r.status_code == 200, f"HTTP {r.status_code} — {r.text[:300]}"
    data = r.json()
    assert "answer" in data, f"Missing 'answer' in response"
    return f"HTTP 200. Answer preview: {data['answer'][:80]}..."

def test_hallucination_analysis():
    if not GROQ_KEY:
        raise SkipTest("GROQ_API_KEY env var not set")
    r = requests.post(
        f"{BASE_URL}/analyze-hallucination",
        json={
            "expert_answer": "Use a reverse proxy with TLS termination + WAF.",
            "base_answer": "Just use HTTPS.",
            "question": "How to secure a web API?",
            "role": "SoftwareEngineer"
        },
        headers=AUTH_HEADERS,
        timeout=60
    )
    assert r.status_code == 200, f"HTTP {r.status_code} — {r.text[:300]}"
    data = r.json()
    assert "hallucination_score" in data, "Missing 'hallucination_score'"
    assert "analysis" in data, "Missing 'analysis'"
    return f"HTTP 200. Score={data['hallucination_score']}%"

def test_unknown_role():
    r = requests.get(f"{BASE_URL}/role-rules/NonExistentRole12345", timeout=15)
    assert r.status_code == 404, f"Expected 404 for unknown role, got HTTP {r.status_code}"
    return "Correctly returned 404 for unknown role"

class SkipTest(Exception):
    pass

if __name__ == "__main__":
    print(f"\n{'='*55}")
    print("   ByteMe Full System Health Check")
    print(f"   Target: {BASE_URL}")
    print(f"{'='*55}")
    if GROQ_KEY:
        print(f"{INFO} GROQ_API_KEY found — live inference tests ENABLED")
    else:
        print(f"{SKIP} GROQ_API_KEY not set — inference tests will be skipped")
        print(f"{INFO} To enable: set GROQ_API_KEY=gsk_... and run again")
    print()

    tests = [
        ("Health Endpoint", test_health),
        ("Built-in Role Rules (All 5 Roles)", test_expert_roles_builtin),
        ("Custom Roles via Supabase", test_custom_roles_endpoint),
        ("Ask Expert (SME Mode) via Groq", test_ask_expert),
        ("Ask Expert (Base Model) via Groq", test_ask_base_model),
        ("Hallucination Analysis Endpoint", test_hallucination_analysis),
        ("Unknown Role → 404", test_unknown_role),
    ]

    passed, failed, skipped = 0, 0, 0
    for name, fn in tests:
        try:
            ok = run_test(name, fn)
            if ok:
                passed += 1
            else:
                failed += 1
        except SkipTest as s:
            print(f"{SKIP} {name}: {s}")
            skipped += 1

    print()
    print(f"{'='*55}")
    print(f"Results: {passed} passed | {failed} failed | {skipped} skipped")
    print(f"{'='*55}\n")
