2.0.0 / 2019-07-15
------------------

- Change `has_wasm` to support lazy evaluation. This prevents possible browser
  CSP report when feature is not requested in options, #6.
- Dev deps bump.


1.0.3 / 2018-03-05
------------------

- Improve WebAssembly detection, #4. Workaround for broken WebAssembly in
  IOS 11.2.x Safary/Chrome (Webkit).


1.0.2 / 2017-10-13
------------------

- Fix WebAssembly detection when disabled via CSP, #2.
- Coverage improve.
- Dev deps bump.


1.0.1 / 2017-10-03
------------------

- .__align(): set base = 8 by default.


1.0.0 / 2017-09-30
------------------

- First release.
