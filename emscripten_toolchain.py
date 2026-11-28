"""Build the simulator with Emscripten for the browser.

Add as the first `pre:` extra script of a firmware `[env:simulator_web]`;
see docs/web.md. Needs `emcc` on PATH (source emsdk_env.sh). The build
writes program.html (from web/shell.html), program.js and program.wasm.
"""

Import("env")
import inspect
import os
import shutil

if not shutil.which("emcc"):
    raise SystemExit("simulator_web: emcc not found; source emsdk_env.sh first")

# This script's folder, so a symlink:// lib_dep with extra_scripts pointing
# into the checkout works as well as an installed copy.
SIM_DIR = os.path.dirname(os.path.abspath(inspect.getframeinfo(inspect.currentframe()).filename))

TOOLS = dict(
    CC="emcc",
    CXX="em++",
    AS="emcc",
    LINK="em++",
    AR="emar",
    RANLIB="emranlib",
    PROGSUFFIX=".html",
)
env.Replace(**TOOLS)

# The native platform's builder runs env.Tool("gcc") and env.Tool("g++")
# after pre: scripts, which would reset CC/CXX to the host compilers.
_tool = env.Tool


_pending_tools = {"gcc", "g++"}


def _tool_then_emscripten(name, *args, **kwargs):
    result = _tool(name, *args, **kwargs)
    if name in _pending_tools:
        env.Replace(**TOOLS)
        _pending_tools.discard(name)
        if not _pending_tools:
            # Done: drop the instance override so env and its clones use
            # SCons' own Tool method again.
            del env.Tool
    return result


env.Tool = _tool_then_emscripten

# Compile flags must match link flags for pthreads and SDL.
common = ["-O2", "-pthread", "-sUSE_SDL=2"]
env.Append(CCFLAGS=common, LINKFLAGS=common)
env.Append(CPPDEFINES=["SIMULATOR_WEB"])
# OpenSSL-named MD5/SHA shims; Emscripten has no OpenSSL port.
env.Append(CPPPATH=[os.path.join(SIM_DIR, "web", "include")])
env.Append(CCFLAGS=["-include", os.path.join(SIM_DIR, "web", "include", "sim_web_prelude.h")])

env.Append(
    LINKFLAGS=[
        "-sASYNCIFY",
        "-sASYNCIFY_STACK_SIZE=262144",
        # Fixed memory: growth with -pthread slows every JS access to the
        # heap, which includes all SD card I/O.
        "-sINITIAL_MEMORY=268435456",
        # Fixed memory turns aborting malloc on; keep NULL on failure so
        # the firmware's allocation-failure paths run as on the device.
        "-sABORTING_MALLOC=0",
        "-sSTACK_SIZE=1048576",
        "-sDEFAULT_PTHREAD_STACK_SIZE=1048576",
        "-sPTHREAD_POOL_SIZE=8",
        "-sEXIT_RUNTIME=0",
        "-sENVIRONMENT=web,worker",
        "-sFORCE_FILESYSTEM",
        "-sEXPORTED_RUNTIME_METHODS=FS,ENV,callMain",
        "-lidbfs.js",
        "--pre-js", os.path.join(SIM_DIR, "web", "pre.js"),
        "--shell-file", os.path.join(SIM_DIR, "web", "shell.html"),
    ]
)

# Relink when the page shell or JS glue changes; SCons does not see them.
env.Depends(
    "$BUILD_DIR/${PROGNAME}${PROGSUFFIX}",
    [os.path.join(SIM_DIR, "web", name) for name in ("pre.js", "shell.html")],
)

# CROSSPOINT_SIM_WEB_DEBUG=1 keeps function names and runtime checks, for
# readable stacks in the browser's devtools.
if os.environ.get("CROSSPOINT_SIM_WEB_DEBUG"):
    env.Append(LINKFLAGS=["--profiling-funcs", "-sASSERTIONS=1"])
