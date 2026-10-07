#!/usr/bin/env python3
"""79-р сургуулийн сайт + CMS сервер (Python стандарт сан + SQLite).

Ажиллуулах:   python3 server.py            → http://localhost:8000
Порт солих:   PORT=8080 python3 server.py
Өгөгдлийн сан: data/school79.db (анх ажиллахад seed.json-оос үүснэ)
"""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("S79_DB", os.path.join(ROOT, "data", "school79.db"))
PORT = int(os.environ.get("PORT", "8000"))
SESSION_DAYS = 7
MAX_BODY = 25 * 1024 * 1024  # медиа сан зураг base64 хэлбэрээр ирдэг

USERS_KEY = "s79_cms_users"
# Нийтэд нээлттэй биш (зөвхөн нэвтэрсэн хэрэглэгч уншина)
PRIVATE_KEYS = {"s79_msgs", "s79_reports", "s79_cms_log", USERS_KEY}
# Сайтын зочин нэмж болох (зөвхөн шинэ бичлэг нэмнэ, засах/устгах эрхгүй)
APPEND_KEYS = {"s79_regs", "s79_msgs", "s79_reports", "s79_cms_ads"}
# Статик файлаар өгөхгүй
BLOCKED = (".py", ".db", ".json", ".docx", ".sqlite", ".md")

_db_lock = threading.Lock()
_login_fail = {}  # ip -> [timestamps]


# ---------- DB ----------
@contextmanager
def tx():
    """Нэг транзакц: алдаа гарвал буцаана, амжилттай бол хадгална, эцэст нь хаана."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def hash_pw(pw, salt=None, it=200_000):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), it).hex()
    return f"pbkdf2${it}${salt}${h}"


def check_pw(pw, stored):
    try:
        _, it, salt, h = stored.split("$")
        return hmac.compare_digest(hash_pw(pw, salt, int(it)).split("$")[3], h)
    except Exception:
        return False


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with tx() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
                                             role TEXT NOT NULL, pass_hash TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires REAL NOT NULL);
            """
        )
        if c.execute("SELECT COUNT(*) FROM kv").fetchone()[0] == 0:
            seed = json.load(open(os.path.join(ROOT, "seed.json"), encoding="utf-8"))
            now = time.time()
            for name, value in seed.items():
                if name == "users":
                    continue
                c.execute("INSERT INTO kv VALUES(?,?,?)", ("s79_cms_" + name, json.dumps(value, ensure_ascii=False), now))
            c.execute("INSERT INTO kv VALUES(?,?,?)", ("s79_cms_migrations", json.dumps(["lang-teachers"]), now))
            if c.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
                for u in seed.get("users", []):
                    c.execute("INSERT INTO users VALUES(?,?,?,?,?)",
                              (u["id"], u["user"], u["name"], u["role"], hash_pw(u["pass"])))
            print("Өгөгдлийн сан seed.json-оос үүслээ:", DB_PATH)
        c.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))


def kv_get(c, key, default=None):
    r = c.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
    return json.loads(r["value"]) if r else default


def kv_set(c, key, value):
    c.execute("INSERT INTO kv VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
              (key, json.dumps(value, ensure_ascii=False), time.time()))


def users_public(c):
    return [{"id": r["id"], "user": r["username"], "name": r["name"], "role": r["role"]}
            for r in c.execute("SELECT * FROM users ORDER BY rowid")]


def save_users(c, items, me):
    if not isinstance(items, list):
        raise ValueError("Буруу өгөгдөл")
    existing = {r["id"]: r for r in c.execute("SELECT * FROM users")}
    seen, names = set(), set()
    rows = []
    for u in items:
        uid = str(u.get("id") or secrets.token_hex(4))
        username = str(u.get("user", "")).strip()
        name = str(u.get("name", "")).strip()
        role = "admin" if u.get("role") == "admin" else "editor"
        if not username or not name:
            raise ValueError("Нэр, нэвтрэх нэр заавал")
        if username in names:
            raise ValueError(f"“{username}” нэвтрэх нэр давхардсан байна")
        names.add(username)
        pw = str(u.get("pass") or "")
        if pw:
            if len(pw) < 6:
                raise ValueError("Нууц үг дор хаяж 6 тэмдэгт байх ёстой")
            ph = hash_pw(pw)
        elif uid in existing:
            ph = existing[uid]["pass_hash"]
        else:
            raise ValueError(f"“{username}” хэрэглэгчид нууц үг оруулна уу")
        rows.append((uid, username, name, role, ph))
        seen.add(uid)
    if me["id"] not in seen:
        raise ValueError("Өөрийгөө устгах боломжгүй")
    if not any(r[3] == "admin" for r in rows):
        raise ValueError("Дор хаяж нэг admin үлдэх ёстой")
    c.execute("DELETE FROM users")
    c.executemany("INSERT INTO users VALUES(?,?,?,?,?)", rows)
    removed = set(existing) - seen
    if removed:
        c.executemany("DELETE FROM sessions WHERE user_id=?", [(i,) for i in removed])


def clean_item(item):
    """Зочноос ирсэн бичлэгийг шалгана: зөвхөн энгийн утгатай, хэмжээ хязгаартай."""
    if not isinstance(item, dict) or len(item) > 30:
        raise ValueError("Буруу өгөгдөл")
    out = {}
    for k, v in item.items():
        if not isinstance(k, str) or len(k) > 40:
            raise ValueError("Буруу талбар")
        if isinstance(v, bool) or v is None:
            out[k] = v
        elif isinstance(v, (int, float)):
            out[k] = v
        elif isinstance(v, str):
            out[k] = v[:3000]
        else:
            raise ValueError("Буруу утга")
    out.pop("seen", None)
    out.pop("feat", None)  # “Онцлох” зарыг зөвхөн админ тэмдэглэнэ
    out["id"] = secrets.token_hex(5)
    out["at"] = int(time.time() * 1000)
    return out


# ---------- HTTP ----------
class Handler(SimpleHTTPRequestHandler):
    server_version = "School79/1.0"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if args and "/api/" in str(args[0]):
            super().log_message(fmt, *args)

    # --- helpers
    def send_json(self, obj, status=200, headers=None):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ValueError("Өгөгдөл хэт том байна")
        return json.loads(self.rfile.read(n) or b"null")

    def current_user(self, c):
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        tok = cookie.get("s79_session")
        if not tok:
            return None
        r = c.execute("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
                      (tok.value, time.time())).fetchone()
        return {"id": r["id"], "user": r["username"], "name": r["name"], "role": r["role"]} if r else None

    def csrf_ok(self):
        # Өөрчлөх хүсэлт бүр зөвхөн манай JS-ээс (тусгай толгойтой) ирэх ёстой
        return self.headers.get("X-S79") == "1"

    # --- static
    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            return self.api("GET", path)
        low = unquote(path).lower()
        if low.startswith("/data/") or low.endswith(BLOCKED) or "/." in low:
            return self.send_error(404)
        return super().do_GET()

    def do_HEAD(self):
        return self.send_error(405)

    def do_POST(self):
        return self.api("POST", urlparse(self.path).path)

    def do_PUT(self):
        return self.api("PUT", urlparse(self.path).path)

    # --- api
    def api(self, method, path):
        try:
            if method != "GET" and not self.csrf_ok():
                return self.send_json({"error": "Хүсэлт хориглогдсон"}, 403)
            with _db_lock, tx() as c:
                me = self.current_user(c)

                if method == "GET" and path == "/api/all":
                    data = {r["key"]: json.loads(r["value"]) for r in c.execute("SELECT key,value FROM kv")}
                    if me:
                        data[USERS_KEY] = users_public(c)
                    else:
                        for k in PRIVATE_KEYS:
                            data.pop(k, None)
                        # клубын суудлын тоонд зөвхөн клубын нэр хэрэгтэй — хувийн мэдээллийг нуух
                        data["s79_regs"] = [{"club": r.get("club")} for r in data.get("s79_regs", [])]
                    return self.send_json({"data": data, "me": me, "now": int(time.time() * 1000)})

                if method == "POST" and path == "/api/login":
                    ip = self.client_address[0]
                    fails = [t for t in _login_fail.get(ip, []) if t > time.time() - 600]
                    if len(fails) >= 10:
                        return self.send_json({"error": "Олон удаа буруу оролдлоо. 10 минутын дараа дахин оролдоно уу."}, 429)
                    body = self.read_json() or {}
                    r = c.execute("SELECT * FROM users WHERE username=?", (str(body.get("user", "")).strip(),)).fetchone()
                    if not r or not check_pw(str(body.get("pass", "")), r["pass_hash"]):
                        _login_fail[ip] = fails + [time.time()]
                        return self.send_json({"error": "Нэвтрэх нэр эсвэл нууц үг буруу байна."}, 401)
                    _login_fail.pop(ip, None)
                    tok = secrets.token_urlsafe(32)
                    c.execute("INSERT INTO sessions VALUES(?,?,?)", (tok, r["id"], time.time() + SESSION_DAYS * 86400))
                    cookie = f"s79_session={tok}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_DAYS * 86400}"
                    return self.send_json({"ok": True}, headers={"Set-Cookie": cookie})

                if method == "POST" and path == "/api/logout":
                    tok = SimpleCookie(self.headers.get("Cookie", "")).get("s79_session")
                    if tok:
                        c.execute("DELETE FROM sessions WHERE token=?", (tok.value,))
                    return self.send_json({"ok": True}, headers={"Set-Cookie": "s79_session=; Path=/; Max-Age=0"})

                if method == "POST" and path.startswith("/api/append/"):
                    key = unquote(path[len("/api/append/"):])
                    if key not in APPEND_KEYS:
                        return self.send_json({"error": "Зөвшөөрөгдөөгүй"}, 403)
                    item = clean_item(self.read_json())
                    lst = kv_get(c, key, [])
                    if len(lst) >= 5000:
                        return self.send_json({"error": "Хадгалах хязгаар хэтэрсэн"}, 507)
                    if key == "s79_cms_ads":
                        lst.insert(0, item)
                    else:
                        lst.append(item)
                    kv_set(c, key, lst)
                    return self.send_json({"ok": True, "item": item})

                if method == "PUT" and path.startswith("/api/data/"):
                    if not me:
                        return self.send_json({"error": "Нэвтрэх шаардлагатай"}, 401)
                    key = unquote(path[len("/api/data/"):])
                    if not key.startswith("s79_") or len(key) > 60:
                        return self.send_json({"error": "Буруу түлхүүр"}, 400)
                    value = self.read_json()
                    if key == USERS_KEY:
                        if me["role"] != "admin":
                            return self.send_json({"error": "Зөвхөн admin хэрэглэгч засна"}, 403)
                        save_users(c, value, me)
                        return self.send_json({"ok": True, "users": users_public(c)})
                    if key in APPEND_KEYS and isinstance(value, list):
                        # Админ жагсаалтаа татсаны дараа зочны нэмсэн бичлэгийг алдахгүй байлгах
                        try:
                            since = int(self.headers.get("X-S79-Since") or 0)
                        except ValueError:
                            since = 0
                        ids = {x.get("id") for x in value if isinstance(x, dict)}
                        fresh = [x for x in kv_get(c, key, []) if isinstance(x, dict) and x.get("id")
                                 and x["id"] not in ids and (x.get("at") or 0) > since]
                        value = fresh + value if key == "s79_cms_ads" else value + fresh
                    kv_set(c, key, value)
                    return self.send_json({"ok": True})

            return self.send_json({"error": "Олдсонгүй"}, 404)
        except (ValueError, json.JSONDecodeError) as e:
            return self.send_json({"error": str(e) or "Буруу өгөгдөл"}, 400)


if __name__ == "__main__":
    init_db()
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Сайт:  http://localhost:{PORT}/\nАдмин: http://localhost:{PORT}/admin.html\nЗогсоох: Ctrl+C")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
