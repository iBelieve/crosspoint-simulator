// Browser-only shims for the Emscripten build.
#ifdef __EMSCRIPTEN__

#include "SimulatorWeb.h"

#include <sys/time.h>

#include "HalGPIO.h"

// musl in Emscripten declares settimeofday but does not provide it. The
// browser clock cannot be set, so accept and ignore the request.
extern "C" int settimeofday(const struct timeval *, const struct timezone *) { return 0; }

namespace SimulatorWeb {

[[noreturn]] void reload(bool powerWake) {
  const int slideSwitch = gpio.hasToggleSwitch() ? (gpio.isToggleSwitchOn() ? 1 : 0) : -1;
  // Module.simReload lives in web/pre.js.
  MAIN_THREAD_ASYNC_EM_ASM({ Module.simReload($0 != 0, $1); }, powerWake ? 1 : 0, slideSwitch);
  // The page is going away; park this thread without spinning.
  while (true) {
    if (!sleepOnMainThread(1000)) {
      struct timespec ts = {1, 0};
      nanosleep(&ts, nullptr);
    }
  }
}

}  // namespace SimulatorWeb

#endif
