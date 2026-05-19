let persistentAudio: HTMLAudioElement | null = null;

function attachAudioToDom(audio: HTMLAudioElement) {
  if (audio.dataset.pulseboxAttached === "1") return;
  audio.dataset.pulseboxAttached = "1";
  audio.style.position = "fixed";
  audio.style.width = "0";
  audio.style.height = "0";
  audio.style.opacity = "0";
  audio.style.pointerEvents = "none";
  audio.style.left = "-9999px";
  document.body.appendChild(audio);
}

export function getPersistentAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!persistentAudio) {
    persistentAudio = new Audio();
    persistentAudio.preload = "auto";
  }
  attachAudioToDom(persistentAudio);
  return persistentAudio;
}

export function primeAudioOnGesture() {
  const audio = getPersistentAudio();
  if (!audio) return;
  if (audio.src) return;

  const silentWav = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  const prevVolume = audio.volume;
  audio.volume = 0;
  audio.src = silentWav;

  audio
    .play()
    .then(() => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.volume = prevVolume;
    })
    .catch(() => {
      audio.volume = prevVolume;
      audio.removeAttribute("src");
      audio.load();
    });
}
