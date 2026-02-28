import urllib.request
import json

req = urllib.request.Request(
    'http://localhost:8000/api/ask-expert', 
    data=b'{"question":"test","plugin":"none"}', 
    headers={'Content-Type': 'application/json'}
)

try:
    urllib.request.urlopen(req)
except Exception as e:
    with open('api_error_log.txt', 'w') as f:
        f.write(e.read().decode())
