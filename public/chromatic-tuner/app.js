const Application = function () {
  this.initA4();
  this.tuner = new Tuner(this.a4);
  this.notes = new Notes(".notes", this.tuner);
  this.meter = new Meter(".meter");
  // this.frequencyBars = new FrequencyBars(".frequency-bars");
  this.update({
    name: "A",
    frequency: this.a4,
    octave: 4,
    value: 69,
    cents: 0,
  });
};

Application.prototype.initA4 = function () {
  this.$a4 = document.querySelector(".a4 span");
  this.a4 = parseInt(localStorage.getItem("a4")) || 440;
  this.$a4.innerHTML = this.a4;
};

Application.prototype.start = function () {
  const self = this;
  this.tuner.onNoteDetected = function (note) {
    if (self.notes.isAutoMode) {
      self.update(note);          // ✅ Always update note display
      invertBackground(note);     // ✅ Always update background based on detected note
    }
  };

  swal.fire({
    title: "Please allow access to microphone!",
    html: "If you're on a mobile device, headphones are required and are also recommended for desktop.",
  }).then(function () {
    self.tuner.init();
    self.frequencyData = new Uint8Array(self.tuner.analyser ? self.tuner.analyser.frequencyBinCount : 0);
  });
};

Application.prototype.updateFrequencyBars = function () {
  if (this.tuner.analyser) {
    this.tuner.analyser.getByteFrequencyData(this.frequencyData);
    this.frequencyBars.update(this.frequencyData);
  }
  requestAnimationFrame(this.updateFrequencyBars.bind(this));
};

Application.prototype.update = function (note) {
  this.notes.update(note);
  let deg = Math.round((note.cents / 250) * 45);
  this.meter.update(deg);
};

const app = new Application();
app.start();

// ------------ MIC SENSITIVITY SLIDER WIRING ------------
const slider = document.getElementById('micSensitivity');
const sliderVal = document.getElementById('micSensitivityValue');

slider.addEventListener('input', function() {
  const val = parseInt(this.value, 10);
  sliderVal.textContent = val;
  app.tuner.setSensitivity(val);
});
