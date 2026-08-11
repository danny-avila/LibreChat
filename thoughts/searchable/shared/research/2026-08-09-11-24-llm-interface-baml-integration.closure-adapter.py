"""Closure adapter (STAGED PROPOSAL — not wired into the repo).
Derived from the ClosureMap for: a new conversation acquires a generated title.
Pin: 45cc53c40b47645b887c3bb996168e06aaa83f4c.
Promote into /home/maceo/Dev/silmari-chat and complete each TODO(promote) before use.
Speaks the 7-op contract apps/closure-oracle already talks to (mock_adapter.py).
"""
import http.server, json, sys

ASYNC_EDGES = ["title-sanitize-and-cache->title-durable-write"]
CONNECTOR = {e: True for e in ASYNC_EDGES}
SINK = []


def handle(op, p):
    if op == "/reset":
        SINK.clear()
        CONNECTOR.update({e: True for e in ASYNC_EDGES})
        return {"ok": True}
    if op == "/set_connector":
        CONNECTOR[p["edge"]] = p["enabled"]
        return {"ok": True}
    if op == "/seed_sink":
        SINK.append(p["value"])
        return {"ok": True}
    if op == "/seed":
        # TODO(promote): seed the conversations collection via saveConvo with p["data"]
        #                (packages/data-schemas/src/methods/conversation.ts; production
        #                 caller api/server/services/Endpoints/agents/title.js:155)
        return {"ok": True}
    if op == "/trigger":
        # TODO(promote): call addTitle(req, p["args"])
        #                (api/server/services/Endpoints/agents/title.js:35; production
        #                 callers api/server/controllers/agents/request.js:1334, :1721, :2252)
        return {"ok": True}
    if op == "/drive":
        if not CONNECTOR.get(p["edge"], True):
            return {"ok": True}  # oracle disabled = red-at-seam
        # TODO(promote): resolve the convoReady barrier for p["edge"] — resolveConvoReady()
        #                (api/server/controllers/agents/request.js:1188; resolved at
        #                 :1506, :1549, :1635, :1748)
        #                NOTE: in-module closure, NOT exported. Promotion requires either
        #                exporting a driver or reproducing the barrier in the harness.
        return {"ok": True}
    if op == "/observe":
        # TODO(promote): return json.dumps(getConvo(userId, conversationId).title)
        #                (packages/data-schemas/src/methods/conversation.ts:104;
        #                 interface declaration at :58)
        return {"ok": True, "value": json.dumps(SINK)}
    return {"ok": False, "error": "unknown op"}


class Hn(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        out = json.dumps(handle(self.path, json.loads(self.rfile.read(n) or "{}"))).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), Hn).serve_forever()
