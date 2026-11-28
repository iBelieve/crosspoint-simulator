// Browser glue for the Emscripten simulator build (--pre-js).
//
// - URL query parameters named CROSSPOINT_SIM_* become environment variables,
//   so ?CROSSPOINT_SIM_INPUT_SCRIPT=... works as it does on the command line.
// - The simulated SD card (./fs_) lives in IndexedDB and is saved every
//   second and when the page is hidden. Only one tab per site saves it; other
//   tabs run on a copy whose changes are not kept.
// - files.json next to the page lists files to copy onto a fresh SD card, for
//   example sample books: ["books/sample.epub", ...]. Existing files are kept.

var SIM_SD = '/fs_';
var SIM_SAVE_MS = 1000;
var SIM_LOCK = 'crosspoint-sim-sd';
// One-shot parameters: consumed by this load, not kept for a manual reload.
var SIM_ONE_SHOT = ['CROSSPOINT_SIM_WAKE_REASON'];

// Saving needs the tab lock and a successful load; the card on disk would
// otherwise be overwritten by another tab's or an empty copy.
var simOwnsCard = false;
var simLoaded = false;
var simSaveTimer = null;
var simLockError = false;  // the browser refused the Web Lock

// A lasting notice; Emscripten clears Module.setStatus after startup.
function simStatus(text) {
  if (Module.simNotice) Module.simNotice(text);
  else console.warn('simulator: ' + text);
}

function simQueryWithout(names) {
  var params = new URLSearchParams(location.search);
  names.forEach(function (name) { params.delete(name); });
  var query = params.toString();
  return query ? '?' + query : '';
}

Module.preRun = Module.preRun || [];
Module.preRun.push(function () {
  var params = new URLSearchParams(location.search);
  params.forEach(function (value, key) {
    if (key.indexOf('CROSSPOINT_SIM_') === 0) ENV[key] = value;
  });
  if (SIM_ONE_SHOT.some(function (name) { return params.has(name); })) {
    history.replaceState(null, '', location.pathname + simQueryWithout(SIM_ONE_SHOT) + location.hash);
  }

  FS.mkdir(SIM_SD);
  FS.mount(IDBFS, {}, SIM_SD);
  addRunDependency('sim-sd');
  simTakeLock().then(function () {
    FS.syncfs(true, function (err) {
      if (err) {
        console.error('simulator: could not load saved SD card; changes will not be saved', err);
      } else {
        simLoaded = true;
      }
      simSeedFiles().finally(function () {
        removeRunDependency('sim-sd');
      });
    });
  });
});

// Resolves once we know whether this tab owns the saved card.
function simTakeLock() {
  if (!navigator.locks) {
    simOwnsCard = true;
    return Promise.resolve();
  }
  return new Promise(function (resolve) {
    navigator.locks.request(SIM_LOCK, { ifAvailable: true }, function (lock) {
      simOwnsCard = lock !== null;
      if (!simOwnsCard) console.warn('simulator: open in another tab; this tab will not save the SD card');
      resolve();
      // Hold the lock for the life of the page.
      return simOwnsCard ? new Promise(function () {}) : null;
    }).catch(function (err) {
      // Locks refused (blocked site data, sandboxed frame): run without saving.
      console.error('simulator: no tab lock; the SD card will not be saved', err);
      simOwnsCard = false;
      simLockError = true;
      resolve();
    });
  });
}

function simSeedFiles() {
  return fetch('files.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : []; })
    .catch(function () { return []; })
    .then(function (files) {
      if (!Array.isArray(files)) {
        console.error('simulator: files.json is not a list of paths');
        return [];
      }
      return Promise.all(files.map(function (path) {
        var dest = SIM_SD + '/' + String(path).replace(/^\/+/, '');
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

// Each save resolves the waiters that were queued before it started: their
// writes are in its snapshot. Waiters queued during a save wait for the next
// one, which then runs once, so a waiter is never delayed by more than that.
var simSaving = false;
var simQueued = [];        // waiters for the next save
var simSaveAgain = false;  // a save was asked for while one was running
var simResetting = false;  // Reset SD card is in progress: no more saves or reloads

function simSave(done) {
  if (!simOwnsCard || !simLoaded || simResetting) {
    if (done && !simResetting) done();
    return;
  }
  if (done) simQueued.push(done);
  if (simSaving) {
    simSaveAgain = true;
    return;
  }
  simStartSave();
}

function simStartSave() {
  var waiters = simQueued;
  simQueued = [];
  simSaveAgain = false;
  simSaving = true;
  FS.syncfs(false, function (err) {
    simSaving = false;
    if (err) console.error('simulator: could not save SD card', err);
    if (simResetting) return;
    waiters.forEach(function (done) { done(); });
    if (simSaveAgain || simQueued.length) simStartSave();
  });
}

// Runs callback once no save is in flight, without starting one.
function simWhenIdle(callback) {
  if (!simSaving) callback();
  else setTimeout(function () { simWhenIdle(callback); }, 50);
}

Module.postRun = Module.postRun || [];
Module.postRun.push(function () {
  if (simLockError) simStatus('This browser does not allow saving here: changes are not saved.');
  else if (!simOwnsCard) simStatus('Open in another tab: changes in this tab are not saved.');
  else if (!simLoaded) simStatus('The saved SD card could not be loaded: changes are not saved.');
  simSaveTimer = setInterval(simSave, SIM_SAVE_MS);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') simSave();
  });
});

// Called by SimulatorWeb::reload. Mirrors the host relaunch after deep sleep:
// pass the wake reason and switch level, and replace the pre-sleep input
// script and screenshot schedule with their *_AFTER_WAKE values.
Module.simReload = function (powerWake, slideSwitch) {
  var params = new URLSearchParams(location.search);
  SIM_ONE_SHOT.forEach(function (name) { params.delete(name); });
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
  clearInterval(simSaveTimer);
  simResetting = true;  // drops later saves and the waiters of a running one
  simQueued = [];
  simWhenIdle(function () {
    IDBFS.quit();  // close our connection so the delete is not blocked
    simDeleteCard();
  });
};

function simDeleteCard() {
  var reload = function () {
    location.replace(location.pathname + simQueryWithout(SIM_ONE_SHOT) + location.hash);
  };
  var request = indexedDB.deleteDatabase(SIM_SD);
  request.onsuccess = request.onerror = reload;
  request.onblocked = function () {
    simStatus('Close the simulator in other tabs to reset the SD card.');
  };
}
