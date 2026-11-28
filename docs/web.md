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
`program.wasm` to `.pio/build/simulator_web/`. For local work on the
simulator, a `symlink://` lib_dep works if `extra_scripts` points at
`emscripten_toolchain.py` in the checkout. Rename `program.html` to
`index.html` when publishing. Set `CROSSPOINT_SIM_WEB_DEBUG=1` at build time
to keep function names and runtime checks for devtools stacks.

The page uses threads (SharedArrayBuffer), so it must be served with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## How it differs from the host build

- **Main loop.** `main()` runs on the browser's main thread with ASYNCIFY.
  `SDL_Delay` yields to the browser event loop. `delay()`/`vTaskDelay()` on
  the main thread yield too (`SimulatorWeb::sleepOnMainThread`), except that a
  delay under 4 ms spins instead when the last yield was under 16 ms ago. Spinning
  does not run input, IndexedDB callbacks or proxied worker calls. FreeRTOS tasks are
  pthreads in Web Workers, as `std::thread` is on the host.
- **SD card.** `./fs_` is an IndexedDB-backed folder that `web/pre.js` saves
  every second and when the tab is hidden. Only the first tab open on a site
  saves it (a Web Lock); other tabs, and browsers without Web Locks, say
  their changes are not kept. `fsync` is a no-op: on IndexedDB it
  starts an asynchronous save that deadlocks when a worker thread calls it.
  Writes and truncates mark a file dirty so the next save stores it even
  when its millisecond mtime did not change; this wraps `FS.write`,
  `FS.doTruncate` and `IDBFS.getLocalSet`, checked against Emscripten
  7.0.1. The page's "Reset SD card" button, after asking, erases the saved
  card.
- **On-screen keys.** `web/shell.html` draws the X4 Classic's keys: two
  bars under the screen (Back and Confirm, then Left/Prev and Right/Next), Up on the
  left side, Power and Down on the right side. Each sends the same key event
  as the keyboard. Profiles with other keys
  (Home, a slide switch) need the keyboard for those.
- **Seed files.** A `files.json` next to the page lists files, relative to
  the page, to copy onto the SD card when they are missing, for example
  `["books/sample.epub"]`.
- **Environment.** URL query parameters named `CROSSPOINT_SIM_*` become
  environment variables, for example `?CROSSPOINT_SIM_SCREEN_TEXT=1`, except
  `CROSSPOINT_SIM_SD`: the SD card stays in the saved folder.
  `CROSSPOINT_SIM_WAKE_REASON` is removed from the address bar once read, so
  a manual reload is a cold boot.
- **Time zone.** Emscripten's `localtime` uses the browser's zone and
  ignores `TZ`, so on profiles with an RTC the clock shows browser local
  time whatever time zone the firmware sets.
- **Failed allocations.** `malloc` returns NULL when the fixed 256 MB heap
  is full, as firmware expects. A NULL dereference does not trap in wasm,
  though, so an unchecked failure can run on where the device would crash.
- **Exceptions.** Emscripten builds without exception catching, so a `throw`
  aborts. A malformed `WAIT` regex in an input script stops the page instead
  of exiting with status 2.
- **Restart and wake.** Deep-sleep wake and `HalSystem::restart()` save the
  SD card and reload the page; the host relaunches with `execvp` or exits.
  `ESP.restart()` does nothing, as on the host: the firmware keeps silent
  restart targets in `RTC_NOINIT` globals that a reload would lose. The reload carries the wake
  reason and slide-switch level in the URL and promotes the `*_AFTER_WAKE`
  input script and screenshot schedule, as the host relaunch does.
- **Hashes.** Emscripten has no OpenSSL port, so `web/include/openssl/`
  provides portable MD5, SHA-1 and SHA-256 under the OpenSSL names.
- **Not available yet.** The firmware's web server and WebSockets (browsers
  cannot listen on sockets), HTTP fetches (the host build runs `curl`), and
  Wi-Fi features that depend on them.
- **build.json.** If present, its `label` (and optional `url`) is shown in
  the page header; preview deploys use it for the PR number and commit.
