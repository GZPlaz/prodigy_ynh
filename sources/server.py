#!/usr/bin/env python3
"""Numeria - self-hosted math adventure game server.

Serves the static game client and a small JSON API backed by SQLite.
Only the Python standard library is used, so it runs on a stock
Debian / YunoHost server without installing anything else.
"""

import argparse
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
import traceback
from contextlib import contextmanager
from http import HTTPStatus
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

VERSION = "1.0.0"
SESSION_COOKIE = "numeria_session"
SESSION_TTL = 60 * 60 * 24 * 30  # 30 days
MAX_BODY = 512 * 1024
MAX_SAVE = 256 * 1024
PBKDF2_ITERATIONS = 240_000
USERNAME_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.\- ]{1,18}[A-Za-z0-9_]$")
BASE_RE = re.compile(r"^/[A-Za-z0-9_\-./]*$")
MIN_PASSWORD = 4
MAX_PASSWORD = 200
MIN_GRADE, MAX_GRADE = 1, 8

SCHEMA = """
CREATE TABLE IF NOT EXISTS players (
    id            INTEGER PRIMARY KEY,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    pw_hash       TEXT    NOT NULL,
    save          TEXT,
    level         INTEGER NOT NULL DEFAULT 1,
    xp            INTEGER NOT NULL DEFAULT 0,
    grade         INTEGER,
    teacher_grade INTEGER,
    answered      INTEGER NOT NULL DEFAULT 0,
    correct       INTEGER NOT NULL DEFAULT 0,
    familiars     INTEGER NOT NULL DEFAULT 0,
    bosses        INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    last_seen     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY,
    player_id  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_player ON sessions(player_id);
CREATE INDEX IF NOT EXISTS players_rank ON players(level DESC, xp DESC);
"""

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/manifest+json", ".webmanifest")


def now():
    return int(time.time())


def log(msg):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)


# --------------------------------------------------------------------------
# Passwords & tokens
# --------------------------------------------------------------------------

def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(PBKDF2_ITERATIONS, salt.hex(), digest.hex())


def verify_password(password, stored):
    try:
        algo, iterations, salt, digest = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(candidate.hex(), digest)


# A real hash to compare against when the user does not exist, so that
# login timing does not reveal which wizard names are taken.
DUMMY_HASH = hash_password(secrets.token_hex(8))


def token_hash(token):
    return hashlib.sha256(token.encode("ascii", "ignore")).hexdigest()


class RateLimiter:
    """Small in-memory sliding-window counter keyed by client address."""

    def __init__(self, limit, window):
        self.limit = limit
        self.window = window
        self.hits = {}
        self.lock = threading.Lock()

    def _prune(self, key, t):
        recent = [h for h in self.hits.get(key, []) if t - h < self.window]
        if recent:
            self.hits[key] = recent
        else:
            self.hits.pop(key, None)
        return recent

    def blocked(self, key):
        with self.lock:
            return len(self._prune(key, time.time())) >= self.limit

    def add(self, key):
        with self.lock:
            t = time.time()
            self._prune(key, t)
            self.hits.setdefault(key, []).append(t)
            if len(self.hits) > 10000:  # keep memory bounded
                for k in list(self.hits)[:5000]:
                    self.hits.pop(k, None)

    def reset(self, key):
        with self.lock:
            self.hits.pop(key, None)


LOGIN_FAILURES = RateLimiter(limit=10, window=600)
REGISTRATIONS = RateLimiter(limit=60, window=3600)


# --------------------------------------------------------------------------
# Storage
# --------------------------------------------------------------------------

class Store:
    def __init__(self, path):
        self.path = path
        directory = os.path.dirname(os.path.abspath(path))
        os.makedirs(directory, exist_ok=True)
        with self.db() as c:
            c.executescript(SCHEMA)
            c.execute("DELETE FROM sessions WHERE expires_at < ?", (now(),))

    @contextmanager
    def db(self):
        conn = sqlite3.connect(self.path, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            with conn:
                yield conn
        finally:
            conn.close()


def clamp_int(value, lo, hi, default):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, number))


def summarize_save(save):
    """Pull the few numbers the server indexes out of a client save."""
    stats = save.get("stats") if isinstance(save.get("stats"), dict) else {}
    zones = save.get("zones") if isinstance(save.get("zones"), dict) else {}
    familiars = save.get("familiars") if isinstance(save.get("familiars"), list) else []
    bosses = sum(1 for z in zones.values() if isinstance(z, dict) and z.get("boss") is True)
    answered = clamp_int(stats.get("answered"), 0, 10**9, 0)
    return {
        "level": clamp_int(save.get("level"), 1, 100, 1),
        "xp": clamp_int(save.get("xp"), 0, 10**9, 0),
        "grade": clamp_int(save.get("grade"), MIN_GRADE, MAX_GRADE, 3),
        "answered": answered,
        "correct": clamp_int(stats.get("correct"), 0, answered, 0),
        "familiars": min(len(familiars), 1000),
        "bosses": min(bosses, 100),
    }


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# --------------------------------------------------------------------------
# HTTP handler
# --------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "Numeria/" + VERSION
    sys_version = ""
    protocol_version = "HTTP/1.1"

    # Set on the class by main()
    store = None
    static_root = None
    teacher_open = False

    # ---- plumbing -------------------------------------------------------

    def log_message(self, fmt, *args):
        log("%s %s" % (self.client_ip(), fmt % args))

    def client_ip(self):
        return (self.headers.get("X-Real-IP") or self.client_address[0] or "?").strip()

    def is_https(self):
        return self.headers.get("X-Forwarded-Proto", "").lower() == "https"

    def base_path(self):
        base = self.headers.get("X-Numeria-Base", "/").strip() or "/"
        if not BASE_RE.match(base) or ".." in base:
            base = "/"
        return base.rstrip("/") + "/"

    def common_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")

    def send_json(self, payload, status=200, cookies=()):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for cookie in cookies:
            self.send_header("Set-Cookie", cookie)
        self.common_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ApiError(400, "Bad request")
        if length > MAX_BODY:
            raise ApiError(413, "Request too large")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            raise ApiError(400, "Invalid JSON")
        if not isinstance(data, dict):
            raise ApiError(400, "Expected a JSON object")
        return data

    def session_cookie(self, token, max_age):
        parts = [
            "{}={}".format(SESSION_COOKIE, token),
            "Path=" + self.base_path(),
            "Max-Age={}".format(max_age),
            "HttpOnly",
            "SameSite=Lax",
        ]
        if self.is_https():
            parts.append("Secure")
        return "; ".join(parts)

    def session_token(self):
        raw = self.headers.get("Cookie")
        if not raw:
            return None
        try:
            jar = SimpleCookie()
            jar.load(raw)
        except CookieError:
            return None
        morsel = jar.get(SESSION_COOKIE)
        return morsel.value if morsel else None

    def current_player(self, conn):
        token = self.session_token()
        if not token:
            return None
        return conn.execute(
            "SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id "
            "WHERE s.token_hash = ? AND s.expires_at > ?",
            (token_hash(token), now()),
        ).fetchone()

    def new_session(self, conn, player_id):
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token_hash, player_id, expires_at) VALUES (?, ?, ?)",
            (token_hash(token), player_id, now() + SESSION_TTL),
        )
        return self.session_cookie(token, SESSION_TTL)

    # ---- dispatch -------------------------------------------------------

    def do_GET(self):
        self.dispatch("GET")

    def do_HEAD(self):
        self.dispatch("HEAD")

    def do_POST(self):
        self.dispatch("POST")

    def do_PUT(self):
        self.dispatch("PUT")

    def dispatch(self, method):
        try:
            path = urlsplit(self.path).path
            if path.startswith("/api/"):
                self.check_csrf(method)
                self.handle_api(method, path[len("/api/"):])
            elif path.startswith("/teacher/api/"):
                self.check_csrf(method)
                self.handle_teacher(method, path[len("/teacher/api/"):])
            elif method in ("GET", "HEAD"):
                self.serve_static(path)
            else:
                raise ApiError(405, "Method not allowed")
        except ApiError as err:
            self.send_json({"error": err.message}, err.status)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:  # pragma: no cover - last resort
            traceback.print_exc()
            try:
                self.send_json({"error": "Internal server error"}, 500)
            except Exception:
                pass

    def check_csrf(self, method):
        # Browsers cannot send this custom header cross-site without a CORS
        # preflight, which we never grant.
        if method not in ("GET", "HEAD") and self.headers.get("X-Requested-With") != "numeria":
            raise ApiError(403, "Missing request header")

    # ---- player API -----------------------------------------------------

    def handle_api(self, method, route):
        routes = {
            ("GET", "health"): self.api_health,
            ("GET", "me"): self.api_me,
            ("POST", "register"): self.api_register,
            ("POST", "login"): self.api_login,
            ("POST", "logout"): self.api_logout,
            ("PUT", "save"): self.api_save,
            ("GET", "leaderboard"): self.api_leaderboard,
        }
        handler = routes.get(("GET" if method == "HEAD" else method, route))
        if not handler:
            raise ApiError(404, "Not found")
        handler()

    def api_health(self):
        self.send_json({"ok": True, "version": VERSION})

    def player_payload(self, row):
        save = None
        if row["save"]:
            try:
                save = json.loads(row["save"])
            except ValueError:
                save = None
        if save is not None and row["teacher_grade"] is not None:
            save["grade"] = row["teacher_grade"]
        return {
            "user": {"username": row["username"]},
            "save": save,
            "gradeLocked": row["teacher_grade"] is not None,
        }

    def api_me(self):
        with self.store.db() as conn:
            player = self.current_player(conn)
            if not player:
                self.send_json({"user": None})
                return
            conn.execute("UPDATE players SET last_seen = ? WHERE id = ?", (now(), player["id"]))
            self.send_json(self.player_payload(player))

    @staticmethod
    def validate_credentials(data):
        username = data.get("username")
        password = data.get("password")
        if not isinstance(username, str) or not isinstance(password, str):
            raise ApiError(400, "Please enter a wizard name and a password.")
        username = " ".join(username.split())
        return username, password

    def api_register(self):
        ip = self.client_ip()
        if REGISTRATIONS.blocked(ip):
            raise ApiError(429, "Too many new accounts from this network. Try again later.")
        username, password = self.validate_credentials(self.read_json())
        if not USERNAME_RE.match(username):
            raise ApiError(400, "Wizard names are 3-20 letters, numbers, spaces, dots, dashes or underscores.")
        if not (MIN_PASSWORD <= len(password) <= MAX_PASSWORD):
            raise ApiError(400, "Passwords need at least {} characters.".format(MIN_PASSWORD))
        pw_hash = hash_password(password)
        with self.store.db() as conn:
            try:
                cur = conn.execute(
                    "INSERT INTO players (username, pw_hash, created_at, last_seen) VALUES (?, ?, ?, ?)",
                    (username, pw_hash, now(), now()),
                )
            except sqlite3.IntegrityError:
                raise ApiError(409, "That wizard name is already taken.")
            cookie = self.new_session(conn, cur.lastrowid)
        REGISTRATIONS.add(ip)
        log("registered player {!r}".format(username))
        self.send_json({"user": {"username": username}, "save": None, "gradeLocked": False}, 201, [cookie])

    def api_login(self):
        ip = self.client_ip()
        if LOGIN_FAILURES.blocked(ip):
            raise ApiError(429, "Too many wrong passwords. Wait a few minutes and try again.")
        username, password = self.validate_credentials(self.read_json())
        with self.store.db() as conn:
            player = conn.execute("SELECT * FROM players WHERE username = ?", (username,)).fetchone()
            ok = verify_password(password, player["pw_hash"] if player else DUMMY_HASH)
            if not player or not ok:
                LOGIN_FAILURES.add(ip)
                raise ApiError(401, "Wrong wizard name or password.")
            LOGIN_FAILURES.reset(ip)
            conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now(),))
            conn.execute("UPDATE players SET last_seen = ? WHERE id = ?", (now(), player["id"]))
            cookie = self.new_session(conn, player["id"])
            self.send_json(self.player_payload(player), 200, [cookie])

    def api_logout(self):
        token = self.session_token()
        if token:
            with self.store.db() as conn:
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
        self.send_json({"ok": True}, 200, [self.session_cookie("", 0)])

    def api_save(self):
        data = self.read_json()
        save = data.get("save")
        if not isinstance(save, dict):
            raise ApiError(400, "Missing save data")
        with self.store.db() as conn:
            player = self.current_player(conn)
            if not player:
                raise ApiError(401, "Please log in again.")
            if player["teacher_grade"] is not None:
                save["grade"] = player["teacher_grade"]
            blob = json.dumps(save, separators=(",", ":"))
            if len(blob) > MAX_SAVE:
                raise ApiError(413, "Save data too large")
            info = summarize_save(save)
            conn.execute(
                "UPDATE players SET save = ?, level = ?, xp = ?, grade = ?, answered = ?, correct = ?, "
                "familiars = ?, bosses = ?, last_seen = ? WHERE id = ?",
                (blob, info["level"], info["xp"], info["grade"], info["answered"], info["correct"],
                 info["familiars"], info["bosses"], now(), player["id"]),
            )
            self.send_json({
                "ok": True,
                "grade": info["grade"],
                "gradeLocked": player["teacher_grade"] is not None,
            })

    def api_leaderboard(self):
        with self.store.db() as conn:
            rows = conn.execute(
                "SELECT username, level, xp, familiars, bosses FROM players "
                "WHERE save IS NOT NULL ORDER BY level DESC, xp DESC, bosses DESC LIMIT 25"
            ).fetchall()
        self.send_json({"players": [dict(r) for r in rows]})

    # ---- teacher API (protected by YunoHost SSO permission) -------------

    def teacher_user(self):
        for header in ("X-Numeria-User", "Ynh-User", "Remote-User"):
            value = (self.headers.get(header) or "").strip()
            if value:
                return value
        return None

    def handle_teacher(self, method, route):
        teacher = self.teacher_user()
        if not teacher and not self.teacher_open:
            raise ApiError(403, "The teacher dashboard needs you to be logged in through the YunoHost portal.")
        routes = {
            ("GET", "players"): self.teacher_players,
            ("POST", "set-grade"): self.teacher_set_grade,
            ("POST", "reset-password"): self.teacher_reset_password,
            ("POST", "delete-player"): self.teacher_delete_player,
        }
        handler = routes.get(("GET" if method == "HEAD" else method, route))
        if not handler:
            raise ApiError(404, "Not found")
        handler(teacher or "teacher")

    def teacher_players(self, teacher):
        players = []
        with self.store.db() as conn:
            rows = conn.execute("SELECT * FROM players ORDER BY username COLLATE NOCASE").fetchall()
        for row in rows:
            skills = {}
            element = None
            if row["save"]:
                try:
                    save = json.loads(row["save"])
                    raw = save.get("stats", {}).get("skills", {})
                    if isinstance(raw, dict):
                        for key, val in raw.items():
                            if isinstance(val, dict):
                                skills[str(key)[:40]] = {
                                    "n": clamp_int(val.get("n"), 0, 10**9, 0),
                                    "c": clamp_int(val.get("c"), 0, 10**9, 0),
                                    "m": max(0.0, min(1.0, float(val.get("m") or 0))),
                                }
                    element = save.get("element") if isinstance(save.get("element"), str) else None
                except (ValueError, TypeError, AttributeError):
                    pass
            players.append({
                "username": row["username"],
                "level": row["level"],
                "grade": row["teacher_grade"] if row["teacher_grade"] is not None else row["grade"],
                "gradeLocked": row["teacher_grade"] is not None,
                "answered": row["answered"],
                "correct": row["correct"],
                "familiars": row["familiars"],
                "bosses": row["bosses"],
                "element": element,
                "started": row["save"] is not None,
                "createdAt": row["created_at"],
                "lastSeen": row["last_seen"],
                "skills": skills,
            })
        self.send_json({"teacher": teacher, "players": players})

    def find_player(self, conn, data):
        username = data.get("username")
        if not isinstance(username, str):
            raise ApiError(400, "Missing username")
        row = conn.execute("SELECT * FROM players WHERE username = ?", (username,)).fetchone()
        if not row:
            raise ApiError(404, "No such player")
        return row

    def teacher_set_grade(self, teacher):
        data = self.read_json()
        grade = data.get("grade")
        if grade is not None:
            grade = clamp_int(grade, MIN_GRADE, MAX_GRADE, None)
            if grade is None:
                raise ApiError(400, "Grade must be between {} and {}".format(MIN_GRADE, MAX_GRADE))
        with self.store.db() as conn:
            row = self.find_player(conn, data)
            conn.execute("UPDATE players SET teacher_grade = ? WHERE id = ?", (grade, row["id"]))
            if grade is not None:
                conn.execute("UPDATE players SET grade = ? WHERE id = ?", (grade, row["id"]))
        log("teacher {!r} set grade of {!r} to {}".format(teacher, row["username"], grade))
        self.send_json({"ok": True})

    def teacher_reset_password(self, teacher):
        data = self.read_json()
        password = data.get("password")
        if not isinstance(password, str) or not (MIN_PASSWORD <= len(password) <= MAX_PASSWORD):
            raise ApiError(400, "Passwords need at least {} characters.".format(MIN_PASSWORD))
        with self.store.db() as conn:
            row = self.find_player(conn, data)
            conn.execute("UPDATE players SET pw_hash = ? WHERE id = ?", (hash_password(password), row["id"]))
            conn.execute("DELETE FROM sessions WHERE player_id = ?", (row["id"],))
        log("teacher {!r} reset the password of {!r}".format(teacher, row["username"]))
        self.send_json({"ok": True})

    def teacher_delete_player(self, teacher):
        data = self.read_json()
        with self.store.db() as conn:
            row = self.find_player(conn, data)
            conn.execute("DELETE FROM players WHERE id = ?", (row["id"],))
        log("teacher {!r} deleted player {!r}".format(teacher, row["username"]))
        self.send_json({"ok": True})

    # ---- static files ---------------------------------------------------

    def serve_static(self, url_path):
        rel = unquote(url_path)
        if "\x00" in rel:
            raise ApiError(400, "Bad path")
        if rel.endswith("/"):
            rel += "index.html"
        full = os.path.realpath(os.path.join(self.static_root, rel.lstrip("/")))
        if full != self.static_root and not full.startswith(self.static_root + os.sep):
            raise ApiError(404, "Not found")
        if os.path.isdir(full):
            # e.g. /teacher -> teacher/ (relative, so it works under any sub-path)
            self.send_response(301)
            self.send_header("Location", url_path.rstrip("/").rsplit("/", 1)[-1] + "/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if not os.path.isfile(full):
            self.send_404()
            return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/json", "image/svg+xml"):
            ctype += "; charset=utf-8"
        with open(full, "rb") as fh:
            body = fh.read()
        etag = '"%s"' % hashlib.sha1(body).hexdigest()[:20]
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("ETag", etag)
        if ctype.startswith("text/html"):
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
                "script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; "
                "frame-ancestors 'self'",
            )
        self.common_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_404(self):
        body = b"<!doctype html><meta charset=utf-8><title>Not found</title><p>This path leads nowhere in Numeria. <a href='./'>Back to the game</a></p>"
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.common_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main(argv=None):
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description="Numeria math adventure game server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8095)
    parser.add_argument("--db", default=os.path.join(here, "numeria.db"), help="SQLite database file")
    parser.add_argument("--static", default=os.path.join(here, "static"), help="Directory with the game client")
    parser.add_argument(
        "--teacher-open", action="store_true",
        help="Allow the teacher API without an SSO user header (local development only!)",
    )
    args = parser.parse_args(argv)

    Handler.store = Store(args.db)
    Handler.static_root = os.path.realpath(args.static)
    Handler.teacher_open = args.teacher_open

    httpd = Server((args.host, args.port), Handler)
    log("Numeria listening on http://{}:{} (db: {})".format(args.host, args.port, args.db))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
