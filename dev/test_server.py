#!/usr/bin/env python3
"""API tests for the Numeria server. Run with: python3 dev/test_server.py"""

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = os.path.join(ROOT, "sources", "server.py")


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Client:
    def __init__(self, base, headers=None):
        self.base = base
        self.cookie = None
        self.headers = headers or {}

    def call(self, method, path, body=None, csrf=True, extra=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if csrf:
            req.add_header("X-Requested-With", "numeria")
        if self.cookie:
            req.add_header("Cookie", self.cookie)
        for k, v in {**self.headers, **(extra or {})}.items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req) as res:
                status, raw, hdrs = res.status, res.read(), res.headers
        except urllib.error.HTTPError as err:
            status, raw, hdrs = err.code, err.read(), err.headers
        set_cookie = hdrs.get("Set-Cookie")
        if set_cookie:
            self.last_set_cookie = set_cookie
            pair = set_cookie.split(";")[0]
            self.cookie = None if pair.endswith("=") else pair
        try:
            payload = json.loads(raw.decode())
        except ValueError:
            payload = raw.decode()
        return status, payload


SAVE = {
    "name": "Ada", "grade": 3, "element": "water", "level": 5, "xp": 12,
    "familiars": ["mossbat", "bubbloon"],
    "zones": {"whisperwood": {"wins": 5, "boss": True}, "cinder": {"wins": 1, "boss": False}},
    "stats": {"answered": 40, "correct": 30, "skills": {"multables": {"n": 10, "c": 4, "m": 0.3}}},
}


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.port = free_port()
        cls.proc = subprocess.Popen(
            [sys.executable, SERVER, "--port", str(cls.port), "--db", os.path.join(cls.tmp.name, "t.db")],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        cls.base = "http://127.0.0.1:%d/" % cls.port
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.base + "api/health")
                break
            except OSError:
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(5)
        cls.proc.stdout.close()
        cls.tmp.cleanup()

    def test_full_flow(self):
        c = Client(self.base, {"X-Numeria-Base": "/numeria"})
        self.assertEqual(c.call("GET", "api/me")[1], {"user": None})
        status, res = c.call("POST", "api/register", {"username": "Ada Wizard", "password": "pass1"})
        self.assertEqual(status, 201, res)
        self.assertIn("Path=/numeria/", c.last_set_cookie)
        self.assertIn("HttpOnly", c.last_set_cookie)
        status, res = c.call("GET", "api/me")
        self.assertEqual(res["user"]["username"], "Ada Wizard")
        self.assertIsNone(res["save"])
        status, res = c.call("PUT", "api/save", {"save": SAVE})
        self.assertEqual(status, 200, res)
        status, res = c.call("GET", "api/me")
        self.assertEqual(res["save"]["level"], 5)

        # duplicate name, case-insensitive
        status, _ = Client(self.base).call("POST", "api/register", {"username": "ada wizard", "password": "xxxx"})
        self.assertEqual(status, 409)

        # leaderboard reflects the save
        _, lb = c.call("GET", "api/leaderboard")
        me = [p for p in lb["players"] if p["username"] == "Ada Wizard"][0]
        self.assertEqual((me["level"], me["familiars"], me["bosses"]), (5, 2, 1))

        # logout invalidates the session
        c2 = Client(self.base)
        c2.cookie = c.cookie
        c.call("POST", "api/logout")
        self.assertEqual(c2.call("GET", "api/me")[1], {"user": None})
        self.assertEqual(c2.call("PUT", "api/save", {"save": SAVE})[0], 401)

        # login again
        status, res = c.call("POST", "api/login", {"username": "ADA WIZARD", "password": "pass1"})
        self.assertEqual(status, 200, res)
        self.assertEqual(res["save"]["element"], "water")
        self.assertEqual(c.call("POST", "api/login", {"username": "Ada Wizard", "password": "nope"})[0], 401)

    def test_validation_and_csrf(self):
        c = Client(self.base)
        self.assertEqual(c.call("POST", "api/register", {"username": "Bob1", "password": "pass1"}, csrf=False)[0], 403)
        self.assertEqual(c.call("POST", "api/register", {"username": "<script>", "password": "pass1"})[0], 400)
        self.assertEqual(c.call("POST", "api/register", {"username": "ab", "password": "pass1"})[0], 400)
        self.assertEqual(c.call("POST", "api/register", {"username": "Bobby", "password": "123"})[0], 400)
        self.assertEqual(c.call("POST", "api/register", {"username": 5, "password": None})[0], 400)
        self.assertEqual(c.call("POST", "api/register", {"username": "Bobby", "password": "pass1"})[0], 201)
        self.assertEqual(c.call("PUT", "api/save", {"save": "nope"})[0], 400)
        self.assertEqual(c.call("PUT", "api/save", {"save": {"blob": "x" * 300000}})[0], 413)
        # nonsense numbers are clamped, not trusted
        c.call("PUT", "api/save", {"save": {"level": 10**12, "stats": {"answered": -5, "correct": 9}}})
        _, lb = c.call("GET", "api/leaderboard")
        bob = [p for p in lb["players"] if p["username"] == "Bobby"][0]
        self.assertEqual(bob["level"], 100)

    def test_static_and_traversal(self):
        with urllib.request.urlopen(self.base) as res:
            self.assertIn("Content-Security-Policy", res.headers)
            self.assertIn(b"Numeria", res.read())
        for bad in ("../server.py", "%2e%2e/server.py", "..%2fserver.py", "js/../../server.py"):
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(self.base + bad)
            self.assertEqual(ctx.exception.code, 404, bad)

    def test_teacher(self):
        anon = Client(self.base)
        self.assertEqual(anon.call("GET", "teacher/api/players")[0], 403)
        kid = Client(self.base)
        kid.call("POST", "api/register", {"username": "Kiddo", "password": "pass1"})
        kid.call("PUT", "api/save", {"save": dict(SAVE, grade=2)})

        t = Client(self.base, {"X-Numeria-User": "mrs_smith"})
        self.assertEqual(t.call("POST", "teacher/api/set-grade", {"username": "Kiddo", "grade": 5}, csrf=False)[0], 403)
        status, res = t.call("GET", "teacher/api/players")
        self.assertEqual(status, 200)
        self.assertEqual(res["teacher"], "mrs_smith")
        kiddo = [p for p in res["players"] if p["username"] == "Kiddo"][0]
        self.assertEqual(kiddo["skills"]["multables"]["n"], 10)

        # grade lock wins over what the client saves
        self.assertEqual(t.call("POST", "teacher/api/set-grade", {"username": "Kiddo", "grade": 6})[0], 200)
        _, res = kid.call("PUT", "api/save", {"save": dict(SAVE, grade=1)})
        self.assertEqual((res["grade"], res["gradeLocked"]), (6, True))
        self.assertEqual(kid.call("GET", "api/me")[1]["save"]["grade"], 6)
        t.call("POST", "teacher/api/set-grade", {"username": "Kiddo", "grade": None})
        _, res = kid.call("PUT", "api/save", {"save": dict(SAVE, grade=1)})
        self.assertEqual((res["grade"], res["gradeLocked"]), (1, False))

        # password reset logs the player out and sets the new password
        self.assertEqual(t.call("POST", "teacher/api/reset-password", {"username": "Kiddo", "password": "newpw"})[0], 200)
        self.assertEqual(kid.call("GET", "api/me")[1], {"user": None})
        self.assertEqual(Client(self.base).call("POST", "api/login", {"username": "Kiddo", "password": "newpw"})[0], 200)

        self.assertEqual(t.call("POST", "teacher/api/delete-player", {"username": "Kiddo"})[0], 200)
        self.assertEqual(t.call("POST", "teacher/api/delete-player", {"username": "Kiddo"})[0], 404)

    def test_login_rate_limit(self):
        c = Client(self.base, {"X-Real-IP": "10.9.9.9"})
        codes = [c.call("POST", "api/login", {"username": "nobody", "password": "wrong"})[0] for _ in range(12)]
        self.assertEqual(codes[:10], [401] * 10)
        self.assertEqual(codes[-1], 429)


if __name__ == "__main__":
    unittest.main(verbosity=2)
