"""Build the simulator with Emscripten for the browser.

Add as the first `pre:` extra script of a firmware `[env:simulator_web]`;
see docs/web.md. Needs `emcc` on PATH (source emsdk_env.sh). The build
writes program.html (from web/shell.html), program.js and program.wasm.
"""

Import("env")
import os
import shutil

if not shutil.which("emcc"):
    raise SystemExit("simulator_web: emcc not found; source emsdk_env.sh first")

SIM_DIR = os.path.dirname(os.path.abspath(env.subst("$PROJECT_LIBDEPS_DIR/$PIOENV/simulator/library.json")))

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


def _tool_then_emscripten(name, *args, **kwargs):
    result = _tool(name, *args, **kwargs)
    if name in ("gcc", "g++"):
        env.Replace(**TOOLS)
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
        "-sALLOW_MEMORY_GROWTH",
        "-sINITIAL_MEMORY=134217728",
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

# CROSSPOINT_SIM_WEB_DEBUG=1 keeps function names and runtime checks, for
# readable stacks in the browser's devtools.
if os.environ.get("CROSSPOINT_SIM_WEB_DEBUG"):
    env.Append(LINKFLAGS=["--profiling-funcs", "-sASSERTIONS=1"])
