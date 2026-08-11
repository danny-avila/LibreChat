// MINIMAL REPRO — BAML toolchain 0.15.0
//
// A throw from a spawned task other than the FIRST escapes its per-await
// `catch` arm, nondeterministically.
//
//   baml run -e 'main()'     -> 8 (correct) about 40% of runs
//                            -> "uncaught throw: user.Bad {offset: 7}" otherwise
//
// Measured rates over 20 runs each (see measure.sh):
//   1 spawn, throws                  caught 20/20   escaped  0/20
//   2 spawns, FIRST throws           caught 20/20   escaped  0/20
//   2 spawns, SECOND throws          caught  8/20   escaped 12/20   <-- this file
//   2 spawns, both throw             caught  6/20   escaped 14/20
//   3 spawns, all throw              caught  2/20   escaped 18/20
//   TaskGroup, 1 of 3 throws         caught  6/20   escaped 14/20
//
// A TaskGroup is NOT required. Bare `spawn` reproduces it.

class Bad {
  offset: int,
}

function boom(i: int) -> int throws Bad {
  throw Bad { offset: i }
}

function fine(i: int) -> int {
  i
}

function main() -> int {
  let a = spawn { fine(1) };
  let b = spawn { boom(7) };
  (await a) + ((await b) catch (e) { Bad => e.offset })
}
