import urllib.request, urllib.parse, http.cookiejar, json

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

for name, password in [('auto_test_user', '1234')]:
    url = 'http://127.0.0.1:8000/api/register/'
    data = json.dumps({'username': name, 'password': password}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with opener.open(req) as r:
            print('register status', r.status)
            print(r.read().decode())
    except Exception as e:
        print('register error', e)

url = 'http://127.0.0.1:8000/api/login/'
data = json.dumps({'username': 'auto_test_user', 'password': '1234'}).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
try:
    with opener.open(req) as r:
        print('login status', r.status)
        print(r.read().decode())
except Exception as e:
    print('login error', e)

url = 'http://127.0.0.1:8000/api/check-auth/'
req = urllib.request.Request(url)
try:
    with opener.open(req) as r:
        print('check-auth status', r.status)
        print(r.read().decode())
except Exception as e:
    print('check-auth error', e)

url = 'http://127.0.0.1:8000/api/history/'
req = urllib.request.Request(url)
try:
    with opener.open(req) as r:
        print('history status', r.status)
        print(r.read().decode())
except Exception as e:
    print('history error', e)
