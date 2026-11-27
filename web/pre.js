// Browser glue for the Emscripten simulator build (--pre-js).
//
// - URL query parameters named CROSSPOINT_SIM_* become environment variables,
//   so ?CROSSPOINT_SIM_INPUT_SCRIPT=... works as it does on the command line.
// - The simulated SD card (./fs_) lives in IndexedDB and is saved every few
//   seconds and when the page is hidden.
// - files.json next to the page lists files to copy onto a fresh SD card, for
//   example sample books: ["books/sample.epub", ...]. Existing files are kept.

var SIM_SD = '/fs_';
var SIM_SAVE_MS = 1000;

Module.preRun = Module.preRun || [];
Module.preRun.push(function () {
  var params = new URLSearchParams(location.search);
  params.forEach(function (value, key) {
    if (key.indexOf('CROSSPOINT_SIM_') === 0) ENV[key] = value;
  });

  FS.mkdir(SIM_SD);
  FS.mount(IDBFS, {}, SIM_SD);
  addRunDependency('sim-sd');
  FS.syncfs(true, function (err) {
    if (err) console.error('simulator: could not load saved SD card', err);
    simSeedFiles().then(function () {
      removeRunDependency('sim-sd');
    });
  });
});

function simSeedFiles() {
  return fetch('files.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : []; })
    .catch(function () { return []; })
    .then(function (files) {
      return Promise.all(files.map(function (path) {
        var dest = SIM_SD + '/' + path.replace(/^\/+/, '');
        if (FS.analyzePath(dest).exists) return null;
        return fetch(path).then(function (r) {
          if (!r.ok) throw new Error(r.status + ' ' + path);
          return r.arrayBuffer();
        }).then(function (data) {
          FS.mkdirTree(dest.substring(0, dest.lastIndexOf('/')));
          FS.writeFile(dest, new Uint8Array(data));
        }).catch(function (err) {
          console.error('simulator: could not copy ' + path, err);
        });
      }));
    });
}

var simSaving = false;
function simSave(done) {
  if (simSaving) {
    if (done) setTimeout(function () { simSave(done); }, 50);
    return;
  }
  simSaving = true;
  FS.syncfs(false, function (err) {
    simSaving = false;
    if (err) console.error('simulator: could not save SD card', err);
    if (done) done();
  });
}

Module.postRun = Module.postRun || [];
Module.postRun.push(function () {
  setInterval(simSave, SIM_SAVE_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') simSave();
  });
});

// Called by SimulatorWeb::reload. Mirrors the host relaunch after deep sleep:
// pass the wake reason and switch level, and replace the pre-sleep input
// script and screenshot schedule with their *_AFTER_WAKE values.
Module.simReload = function (powerWake, slideSwitch) {
  var params = new URLSearchParams(location.search);
  params.delete('CROSSPOINT_SIM_WAKE_REASON');
  if (powerWake) params.set('CROSSPOINT_SIM_WAKE_REASON', 'power');
  if (slideSwitch >= 0) params.set('CROSSPOINT_SIM_SLIDE_SWITCH', slideSwitch ? 'on' : 'off');
  ['CROSSPOINT_SIM_INPUT_SCRIPT', 'CROSSPOINT_SIM_SCREENSHOTS'].forEach(function (key) {
    var after = params.get(key + '_AFTER_WAKE');
    params.delete(key);
    params.delete(key + '_AFTER_WAKE');
    if (after !== null) params.set(key, after);
  });
  var query = params.toString();
  simSave(function () {
    location.replace(location.pathname + (query ? '?' + query : '') + location.hash);
  });
};

// Clears the saved SD card and reloads with a fresh one.
Module.simResetStorage = function () {
  var request = indexedDB.deleteDatabase(SIM_SD);
  request.onsuccess = request.onerror = request.onblocked = function () {
    location.replace(location.pathname);
  };
};
