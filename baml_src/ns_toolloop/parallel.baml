// ── Bounded parallel tool execution ─────────────────────────────────────────
// The ToolNode shape: N tool calls per turn, run concurrently but capped, with
// a per-call failure that does NOT kill the batch (ToolNode turns a failed call
// into an error ToolMessage and keeps going — src/tools/ToolNode.ts:1490-1592).

/// One pending call. Built internally so the spawn closure captures a FRESH
/// binding per element — see the while-loop footgun noted on `execute_tools`.
class ToolCallReq {
  tool_name: string,
  args_json: string,
}

class ToolFailed {
  tool_name: string,
  message: string,
}

class ToolOutcome {
  tool_name: string,
  result_json: string,
  failed: bool,
}

/// Stand-in for host tool execution. Odd-length args simulate a failure so the
/// per-call catch arm is actually exercised.
function run_one_tool(name: string, args_json: string) -> string throws ToolFailed {
  if (args_json.length() % 2 == 1) {
    throw ToolFailed { tool_name: name, message: `bad args for ${name}` }
  }
  `{"tool":"${name}","ok":true,"echo":${args_json.length()}}`
}

/// Execute a whole turn's tool calls with at most `max_in_flight` running.
/// Extras queue FIFO inside the group.
function execute_tools(names: string[], args: string[], max_in_flight: int) -> ToolOutcome[] {
  let pool = baml.spawn.TaskGroup.new(max_in_flight, name = "tools");

  // FOOTGUN: spawning inside a `while` body and capturing the loop's `let`
  // bindings makes every closure observe the LAST iteration's values — the
  // binding is reused, not re-created. Pair up first, then `.map`, so each
  // closure gets its own element.
  let reqs: ToolCallReq[] = [];
  let i = 0;
  while (i < names.length()) {
    let _ = reqs.push(ToolCallReq { tool_name: names[i], args_json: args[i] });
    i = i + 1;
  }

  let futures = reqs.map((r) -> {
    spawn with baml.spawn.options(group = pool) { run_one_tool(r.tool_name, r.args_json) }
  });

  let out: ToolOutcome[] = [];
  let j = 0;
  while (j < futures.length()) {
    // the catch arm is matched by type at the await site; a failed tool
    // becomes a failed outcome instead of aborting the batch
    let outcome = (await futures[j]) catch (e) {
      ToolFailed => `{"error":"${e.message}"}`
    };
    let _ = out.push(ToolOutcome {
      tool_name: names[j],
      result_json: outcome,
      failed: outcome.includes("\"error\""),
    });
    j = j + 1;
  }
  out
}

testset "toolloop_parallel" {

  test "A1 a bounded pool runs every call and preserves order" {
    let r = execute_tools(["a", "b", "c", "d"], ["12", "1234", "123456", "12345678"], 2);
    assert.equal(r.length(), 4);
    assert.equal(r[0].tool_name, "a");
    assert.equal(r[3].tool_name, "d");
    assert.is_true(!r[0].failed)
  }

  test "A2 one failing call does not abort the batch" {
    let r = execute_tools(["ok1", "bad", "ok2"], ["12", "123", "1234"], 2);
    assert.equal(r.length(), 3);
    assert.is_true(!r[0].failed);
    assert.is_true(r[1].failed);
    assert.is_true(!r[2].failed);
    assert.contains(r[1].result_json, "bad args for bad")
  }

  test "A3 a cap of 1 serialises without changing results" {
    let capped = execute_tools(["a", "b", "c"], ["12", "1234", "123456"], 1);
    let wide = execute_tools(["a", "b", "c"], ["12", "1234", "123456"], 8);
    assert.equal(capped.length(), wide.length());
    assert.equal(capped[2].result_json, wide[2].result_json)
  }

}
