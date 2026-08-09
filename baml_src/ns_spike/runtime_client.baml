// Spike 2: is a per-request model / api_key / base_url expressible in BAML v1?
//
// This is the capability LibreChat actually needs. The end user picks the model,
// may supply their own key, and custom endpoints carry their own base URL
// (packages/api/src/endpoints/config/providers.ts:137 dispatches on exactly that).
// The research doc named v0's `ClientRegistry` as the mechanism; that symbol does
// not exist in the installed toolchain, so this probes what v1 offers instead.
//
// Everything here is offline: `build_call` returns a wire-format request WITHOUT
// sending it, so the shape can be asserted with no key and no network.

class Tenant {
    label: string,
    base_url: string,
    model: string,
    api_key: string,
}

//# Build the OpenAI-shaped chat body for one tenant's chosen model.

function chat_body(t: Tenant, user_text: string) -> string {
    `{"model":"${t.model}","messages":[{"role":"user","content":"${user_text}"}]}`
}

//# Build a wire-ready request from ordinary runtime values. Nothing is sent.

function build_call(t: Tenant, user_text: string) -> baml.http.Request {
    //# Headers are a plain map, so the caller's key rides per request.
    let h: map<string, string> = {};
    let _ = h.set("Authorization", `Bearer ${t.api_key}`);
    let _b = h.set("Content-Type", "application/json");

    baml.http.Request {
        method: "POST",
        url: `${t.base_url}/chat/completions`,
        headers: h,
        body: chat_body(t, user_text),
    }
}

//# Two tenants, one process, no shared global client.

function tenants() -> Tenant[] {
    [
        Tenant {
            label: "byo-openai",
            base_url: "https://api.openai.com/v1",
            model: "gpt-4o-mini",
            api_key: "key-aaa",
        },
        Tenant {
            label: "self-hosted",
            base_url: "http://10.0.0.7:8080/v1",
            model: "llama-3.1-70b",
            api_key: "key-bbb",
        },
    ]
}

function calls_for_all(user_text: string) -> baml.http.Request[] {
    tenants()
        .map(
            (t) -> {
                build_call(t, user_text)
            },
        )
}

//# Summary line used by the report and by the probe script.

function describe_calls() -> string {
    calls_for_all("ping")
        .map(
            (r) -> {
                `${r.method} ${r.url} auth=${r.headers.get("Authorization") ?? "none"}`
            },
        )
        .join("\n")
}

// Field extractors. `?.` does not carry through into a following method call
// (`rs.at(0)?.headers.get(k)` is a compile error), so pull fields out with map
// where the element is already non-optional.
function urls() -> string[] {
    calls_for_all("ping")
        .map(
            (r) -> {
                r.url
            },
        )
}

function auths() -> string[] {
    calls_for_all("ping")
        .map(
            (r) -> {
                r.headers.get("Authorization") ?? ""
            },
        )
}

function bodies() -> string[] {
    calls_for_all("ping")
        .map(
            (r) -> {
                r.body
            },
        )
}

test "base_url is per-request, not baked into a global client" {
    let us = urls();
    let a = us.at(0) ?? "";
    let b = us.at(1) ?? "";
    assert.is_true(a != b);
    assert.is_true(a.starts_with("https://api.openai.com/v1"));
    assert.is_true(b.starts_with("http://10.0.0.7:8080/v1"))
}

test "api_key is per-request and reaches the Authorization header" {
    let hs = auths();
    let auth_a = hs.at(0) ?? "";
    let auth_b = hs.at(1) ?? "";
    assert.equal(auth_a, "Bearer key-aaa");
    assert.equal(auth_b, "Bearer key-bbb");
    assert.is_true(auth_a != auth_b)
}

test "model is per-request and reaches the request body" {
    let bs = bodies();
    assert.is_true((bs.at(0) ?? "").includes("\"model\":\"gpt-4o-mini\""));
    assert.is_true((bs.at(1) ?? "").includes("\"model\":\"llama-3.1-70b\""));
    assert.is_true((bs.at(0) ?? "").includes("\"messages\""))
}

test "every request is a POST to the chat completions path" {
    let rs = calls_for_all("ping");
    let posts = rs
        .filter(
            (r) -> {
                r.method == "POST" && r.url.includes("/chat/completions")
            },
        );
    assert.equal(posts.length(), 2)
}
