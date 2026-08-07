import json
import os
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


CAPTURE_PATH = os.environ.get("CAPTURE_PATH", "/captures/requests.jsonl")


def write_capture(path, body):
    record = {"timestamp": time.time(), "path": path, "body": body}
    with open(CAPTURE_PATH, "a", encoding="utf-8") as capture:
        capture.write(json.dumps(record, separators=(",", ":")) + "\n")


def completion(body):
    messages = body.get("messages", [])
    tools = body.get("tools", [])
    has_tool_result = any(message.get("role") == "tool" for message in messages)
    message = {"role": "assistant", "content": "LOCAL_MOCK_OK"}
    finish_reason = "stop"
    if tools and not has_tool_result:
        function = tools[0].get("function", {})
        message = {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "call_local_1",
                    "type": "function",
                    "function": {
                        "name": function.get("name", "local_tool"),
                        "arguments": (
                            '{"input":"2+2"}' if function.get("name") == "calculator" else "{}"
                        ),
                    },
                }
            ],
        }
        finish_reason = "tool_calls"
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": body.get("model", "local-mock"),
        "choices": [{"index": 0, "message": message, "finish_reason": finish_reason}],
        "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            return
        self.send_error(404)

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        write_capture(self.path, body)
        response = completion(body)
        if body.get("stream"):
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.end_headers()
            message = response["choices"][0]["message"]
            delta = {"role": "assistant"}
            if message.get("tool_calls"):
                call = message["tool_calls"][0]
                delta["tool_calls"] = [{"index": 0, **call}]
            else:
                delta["content"] = message.get("content", "")
            chunk = {
                "id": response["id"],
                "object": "chat.completion.chunk",
                "created": response["created"],
                "model": response["model"],
                "choices": [{"index": 0, "delta": delta, "finish_reason": None}],
            }
            end = {
                **chunk,
                "choices": [
                    {
                        "index": 0,
                        "delta": {},
                        "finish_reason": response["choices"][0]["finish_reason"],
                    }
                ],
            }
            for event in (chunk, end):
                self.wfile.write(f"data: {json.dumps(event)}\n\n".encode("utf-8"))
            self.wfile.write(b"data: [DONE]\n\n")
            return
        data = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        return


ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
