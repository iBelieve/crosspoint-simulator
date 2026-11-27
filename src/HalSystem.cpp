#include "HalSystem.h"

#include "SimulatorWeb.h"
#include <cstdlib>

void HalSystem::begin() {}
void HalSystem::restart() {
#ifdef __EMSCRIPTEN__
  SimulatorWeb::reload(false);
#else
  exit(0);
#endif
}
bool HalSystem::getEegoUid(uint32_t&) { return false; }
void HalSystem::checkPanic() {}
void HalSystem::clearPanic() {}
std::string HalSystem::getPanicInfo(bool full) { return {}; }
bool HalSystem::isRebootFromPanic() { return false; }
