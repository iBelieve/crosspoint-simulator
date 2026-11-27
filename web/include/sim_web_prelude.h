#pragma once

// Force-included in Emscripten builds. musl's <limits.h> defines PAGE_SIZE,
// which collides with firmware constants of that name. Include it once here
// and drop the macro; the include guard keeps later includes from restoring it.
#include <limits.h>
#undef PAGE_SIZE

// libstdc++ headers pull these in transitively and some firmware and SDK
// sources rely on that; libc++ does not.
#include <stdlib.h>
