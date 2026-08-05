function saveSettings() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); return true; } catch (_) { return false; } }
function resolvedDarkTheme() { return settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches); }
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  dom.themeColor.content = resolvedDarkTheme() ? '#10130f' : '#f4f5ef';
  dom.themeSwitch.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.value === settings.theme)));
}
function showToast(message, duration = 2200) {
  clearTimeout(toastTimer); dom.toast.textContent = message; dom.toast.hidden = false;
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, duration);
}
function currentInstrument() { return INSTRUMENTS[settings.instrument]; }
function ensureCurrentTuning() {
  const selected = getTuningById(settings.tuningSelections[settings.instrument], settings.customTunings);
  currentTuning = selected?.instrument === settings.instrument ? selected : getTuningById(currentInstrument().defaultTuningId, settings.customTunings);
  settings.tuningSelections[settings.instrument] = currentTuning.id;
}
function updateInstrumentControls() { dom.instrumentSwitch.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.instrument === settings.instrument))); }
function updateTuningSummary() { dom.tuningName.textContent = currentTuning.name; dom.tuningNotes.textContent = formatTuningNotes(currentTuning, settings.accidentalMode); }
function updateModeControl() {
  const manual = settings.mode === 'manual';
  dom.modeSwitch.checked = manual;
  dom.modeSwitch.title = manual ? 'Manual mode: the selected string is locked' : 'Auto mode: Fretline recognizes the string';
}
function targetLabel(target) { return `${target.note}${target.octave}`; }
function updateToneButton() {
  const target = targets[selectedTargetIndex] ?? targets[0]; if (!target) return;
  const label = targetLabel(target);
  dom.toneButton.querySelector('span').textContent = tonePlaying ? 'Stop' : `Pluck ${label}`;
  dom.toneButton.setAttribute('aria-label', tonePlaying ? `Stop reference string ${label}` : `Pluck reference string ${label}`);
  dom.toneButton.setAttribute('aria-pressed', String(tonePlaying));
}
function updateActiveString() {
  dom.stringsContainer.querySelectorAll('.string-button').forEach((button) => {
    const index = Number(button.dataset.index);
    button.setAttribute('aria-current', String(index === selectedTargetIndex));
    button.classList.toggle('is-tuned', tunedStrings.has(index));
  });
  updateToneButton();
}
function renderStrings() {
  dom.stringsContainer.replaceChildren(); dom.stringsContainer.style.setProperty('--string-count', String(targets.length));
  for (const target of targets) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'string-button'; button.dataset.index = String(target.index);
    button.setAttribute('aria-label', `String ${target.number}, ${targetLabel(target)}. Select this string; with the microphone off, play its reference sound.`);
    button.innerHTML = '<span class="string-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3.5 8.2 2.7 2.7 6.3-6.3"/></svg></span><span class="string-number"></span><span><span class="string-note"></span><span class="string-octave"></span></span>';
    button.querySelector('.string-number').textContent = `String ${target.number}`;
    button.querySelector('.string-note').textContent = target.note; button.querySelector('.string-octave').textContent = String(target.octave);
    button.addEventListener('click', () => { selectString(target.index, true); if (!listening) playReferenceString(); }); dom.stringsContainer.append(button);
  }
  updateActiveString(); updateTunedProgress();
}
function updateTunedProgress() {
  const count = tunedStrings.size; const total = targets.length; const complete = count === total && total > 0;
  dom.tunedProgress.textContent = complete ? 'All strings tuned' : `${count} of ${total} strings tuned`;
  dom.resetProgressButton.hidden = count === 0;
  dom.readyCard.hidden = !complete;
}
