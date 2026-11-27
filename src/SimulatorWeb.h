#pragma once

// Browser (Emscripten) replacements for host process operations.
#ifdef __EMSCRIPTEN__

#include <emscripten.h>
#include <emscripten/threading.h>

namespace SimulatorWeb {

// Saves the simulated SD card and reloads the page. powerWake asks the next
// load to report a power-button wake, as a host relaunch after sleep does.
[[noreturn]] void reload(bool powerWake);

// Sleeps without blocking the browser: the main thread yields to the event
// loop (ASYNCIFY) so SDL input, presents and file syncs keep running.
// Returns false on worker threads, which can block normally.
inline bool sleepOnMainThread(unsigned long ms) {
  if (!emscripten_is_main_browser_thread())
    return false;
  emscripten_sleep(ms);
  return true;
}

}  // namespace SimulatorWeb

#endif
