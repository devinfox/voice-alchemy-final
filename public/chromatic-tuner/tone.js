const keys = document.querySelectorAll(".key"),
  note = document.querySelector(".nowplaying"),
  hints = document.querySelectorAll(".hints");

function playNote(e) {
  // console.log(e.keyCode)
  const audio = document.querySelector(`audio[data-key="${e.keyCode}"]`),
    key = document.querySelector(`.key[data-key="${e.keyCode}"]`);

  if (!key) return;

  const keyNote = key.getAttribute("data-note");

  key.classList.add("playing");
  note.innerHTML = keyNote;
  audio.currentTime = 0;
  audio.play();
}

function removeTransition(e) {
  // if (e.propertyName !== "transform") return;
  this.classList.remove("playing");
}

function hintsOn(e, index) {
  e.setAttribute("style", "transition-delay:" + index * 50 + "ms");
}

hints.forEach(hintsOn);

keys.forEach((key) => key.addEventListener("transitionend", removeTransition));

window.addEventListener("keydown", playNote);

document.querySelectorAll(".key").forEach((e) => {
  e.addEventListener("click", () => {
    var datakey = e.getAttribute("data-key");
    var keyCode = parseInt(datakey);
    const audio = document.querySelector(`audio[data-key="${keyCode}"][data-octave="${selectedOctave}"]`);
    const key = document.querySelector(`.key[data-key="${keyCode}"][data-note="${e.getAttribute("data-note")}"]`);

    if (!key) return;

    const keyNote = key.getAttribute("data-note");
    key.classList.add("playing");
    note.innerHTML = keyNote;
    audio.currentTime = 0;
    audio.play();

    // ✅ Store the note and octave for mic matching
    window.currentlyPlayingNote = {
      name: keyNote,
      octave: parseInt(selectedOctave),
    };
  });
});


/* -------------change the tunes links with click number btns----------------- */
let a = document.querySelector(".numbersKeys").querySelectorAll("li");
a.forEach((e) => {
  e.addEventListener("click", () => {
    a.forEach((i) => {
      i.classList.remove("pressed");
    });
    e.classList.add("pressed");
  });
});
/* -------------change bg of btns on click----------------- */
let b = document.querySelectorAll(".key");
b.forEach((e) => {
  e.addEventListener("click", () => {
    b.forEach((i) => {
      i.classList.remove("clicked");
    });
    e.classList.add("clicked");
  });
});

/* -------------bg-change on frequency----------------- */
let meter = document.querySelector(".meter");
let frequency = document.querySelector(".frequency");
let freqArray1 = [32, 34, 36, 38, 41, 43, 46, 49, 52, 55, 58, 61];
let freqArray2 = [65, 69, 73, 77, 82, 87, 92, 98, 104, 110, 116, 123];
let freqArray3 = [130, 138, 146, 155, 164, 174, 185, 196, 208, 220, 233, 246];
let freqArray4 = [261, 277, 293, 311, 329, 349, 369, 392, 415, 440, 466, 493];
let freqArray5 = [523, 554, 587, 622, 659, 698, 739, 784, 830, 880, 932, 987];

let freqArray1Diff = uncertainty(freqArray1, 0.5);
let freqArray2Diff = uncertainty(freqArray2, 1);
let freqArray3Diff = uncertainty(freqArray3, 1);
let freqArray4Diff = uncertainty(freqArray4, 2);
let freqArray5Diff = uncertainty(freqArray5, 2);

let differenceFreqArray = [
  ...freqArray1Diff,
  ...freqArray2Diff,
  ...freqArray3Diff,
  ...freqArray4Diff,
  ...freqArray5Diff,
];

let meterPointer = document.querySelector(".meter-pointer");
let meterPointerColor = meterPointer.style.backgroundColor;
let meterDot = document.querySelector(".meter-dot");
let meterDotColor = meterDot.style.backgroundColor;
// const observer = new MutationObserver((mutations) => {
//   // Iterate over each mutation
//   mutations.forEach((mutation) => {
//     // Check if the textContent of the <p> element has changed
//     if (mutation.type === "characterData") {
//       var val = parseInt(frequency.firstChild.textContent);
//       if (differenceFreqArray.includes(val)) {
//         invertBackground(true);
//       } else {
//         invertBackground(false);
//       }
//     }
//   });
// });

// observer.observe(frequency, { characterData: true, subtree: true });

/* ================// ADD AND SUBTRACT TO THE VALUES //================ */
function uncertainty(arr, diff) {
  if (!Array.isArray(arr)) return [];
  return arr.map((val) => [val - diff, val, val + diff]).flat();
}

/* ================// INVERT BACKGROUND //================ */
function invertBackground(detectedNote) {
  const upperThirdHeight = Math.floor(document.documentElement.clientHeight / 5);

  if (
    window.currentlyPlayingNote &&
    detectedNote &&
    detectedNote.name === window.currentlyPlayingNote.name &&
    detectedNote.octave === parseInt(window.currentlyPlayingNote.octave)
  ) {
    document.body.style.background = `linear-gradient(to bottom, ${activeBg} ${upperThirdHeight}px, white ${upperThirdHeight}px)`;
    document.body.style.color = textColor;
    meterPointer.style.backgroundColor = textColor;
    meterDot.style.backgroundColor = textColor;
  } else {
    document.body.style.background = "white";
    document.body.style.color = "unset";
    meterPointer.style.backgroundColor = meterPointerColor;
    meterDot.style.backgroundColor = meterDotColor;
  }
}


// Helper function to check if the frequency is within the specified range
function isFrequencyInRange(lowerBound, upperBound) {
  const frequencyValue = parseInt(frequency.firstChild.textContent);
  return frequencyValue >= lowerBound && frequencyValue <= upperBound;
}