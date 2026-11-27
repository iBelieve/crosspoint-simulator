# Browser build (Emscripten)

The simulator also builds to WebAssembly, so the firmware runs in a browser
tab. The CrossPoint fork uses it for per-PR preview sites.

## Build

Install [emsdk](https://github.com/emscripten-core/emsdk) and source
`emsdk_env.sh`, then add an environment to the firmware's `platformio.ini`
that extends the host simulator environment:

```ini
[env:simulator_web]
extends = env:simulator
build_flags = ...            ; the simulator flags without sdl2-config, -lssl, -lcrypto
extra_scripts =
  pre:.pio/libdeps/$PIOENV/simulator/emscripten_toolchain.py
  ${env:simulator.extra_scripts}
```

`pio run -e simulator_web` writes `program.html`, `program.js` and
`program.wasm` to `.pio/build/simulator_web/`. Rename `program.html` to
`index.html` when publishing. Set `CROSSPOINT_SIM_WEB_DEBUG=1` at build time
to keep function names and runtime checks for devtools stacks.

The page uses threads (SharedArrayBuffer), so it must be served with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## How it differs from the host build

- **Main loop.** `main()` runs on the browser's main thread with ASYNCIFY.
  `SDL_Delay`, and `delay()`/`vTaskDelay()` on the main thread, yield to the
  browser event loop (`SimulatorWeb::sleepOnMainThread`). FreeRTOS tasks are
  pthreads in Web Workers, as `std::thread` is on the host.
- **SD card.** `./fs_` is an IndexedDB-backed folder that `web/pre.js` saves
  every second and when the tab is hidden. `fsync` is a no-op: on IndexedDB it
  starts an asynchronous save that deadlocks when a worker thread calls it.
  The page's "Reset SD card" button clears it.
- **Seed files.** A `files.json` next to the page lists files, relative to
  the page, to copy onto the SD card when they are missing, for example
  `["books/sample.epub"]`.
- **Environment.** URL query parameters named `CROSSPOINT_SIM_*` become
  environment variables, for example `?CROSSPOINT_SIM_SCREEN_TEXT=1`.
- **Restart and wake.** Deep-sleep wake and `HalSystem::restart()` save the
  SD card and reload the page instead of `execvp`. The reload carries the wake
  reason and slide-switch level in the URL and promotes the `*_AFTER_WAKE`
  input script and screenshot schedule, as the host relaunch does.
- **Hashes.** Emscripten has no OpenSSL port, so `web/include/openssl/`
  provides portable MD5, SHA-1 and SHA-256 under the OpenSSL names.
- **Not available yet.** The firmware's web server and WebSockets (browsers
  cannot listen on sockets), HTTP fetches (the host build runs `curl`), and
  Wi-Fi features that depend on them.
- **build.json.** If present, its `label` (and optional `url`) is shown in
  the page header; preview deploys use it for the PR number and commit.
