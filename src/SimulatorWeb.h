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
//
// Each yield is a setTimeout, which browsers clamp to at least 4 ms (far more
// in background tabs). Short delays, which firmware uses as "yield every N
// items", therefore spin instead unless the last yield was a while ago.
inline bool sleepOnMainThread(unsigned long ms) {
  constexpr unsigned long kShortDelayMs = 4;
  constexpr double kYieldIntervalMs = 16;
  if (!emscripten_is_main_browser_thread())
    return false;
  static double lastYield = 0;
  const double start = emscripten_get_now();
  if (ms < kShortDelayMs && start - lastYield < kYieldIntervalMs) {
    while (emscripten_get_now() - start < ms) {
    }
    return true;
  }
  emscripten_sleep(ms);
  lastYield = emscripten_get_now();
  return true;
}

}  // namespace SimulatorWeb

#endif
