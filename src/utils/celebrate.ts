import confetti from 'canvas-confetti';

const MILESTONE_MESSAGES = [
  '🎉 {n} tasks crushed!',
  '🚀 {n} down. Unstoppable.',
  '🏆 {n} complete. You absolute machine.',
  '✨ {n}! That bar keeps moving up.',
];

const STORAGE_KEY = 'stradl-celebration-index';

function nextMessage(count: number): string {
  let idx = 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) idx = (parseInt(raw, 10) + 1) % MILESTONE_MESSAGES.length;
    localStorage.setItem(STORAGE_KEY, String(idx));
  } catch {
    idx = Math.floor(Math.random() * MILESTONE_MESSAGES.length);
  }
  return MILESTONE_MESSAGES[idx].replace('{n}', count.toLocaleString());
}

function fireConfetti(): void {
  const duration = 2500;
  const end = Date.now() + duration;
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];

  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.7 },
      colors,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.7 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();

  confetti({
    particleCount: 120,
    spread: 100,
    startVelocity: 45,
    origin: { y: 0.6 },
    colors,
  });
}

function showBanner(message: string): void {
  const banner = document.createElement('div');
  banner.textContent = message;
  banner.setAttribute('role', 'status');
  banner.style.cssText = [
    'position:fixed',
    'top:24%',
    'left:50%',
    'transform:translate(-50%, -50%) scale(0.8)',
    'padding:20px 36px',
    'background:linear-gradient(135deg,#7c3aed,#ec4899)',
    'color:#fff',
    'font-size:28px',
    'font-weight:700',
    'letter-spacing:0.01em',
    'border-radius:18px',
    'box-shadow:0 20px 50px rgba(124,58,237,0.45)',
    'z-index:9999',
    'opacity:0',
    'transition:opacity 280ms ease, transform 320ms cubic-bezier(.2,.9,.3,1.4)',
    'pointer-events:none',
    'text-align:center',
    'max-width:min(90vw,520px)',
  ].join(';');
  document.body.appendChild(banner);

  requestAnimationFrame(() => {
    banner.style.opacity = '1';
    banner.style.transform = 'translate(-50%, -50%) scale(1)';
  });

  window.setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transform = 'translate(-50%, -50%) scale(0.9)';
    window.setTimeout(() => banner.remove(), 400);
  }, 2400);
}

export function celebrateMilestone(completedCount: number): void {
  if (typeof window === 'undefined') return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  showBanner(nextMessage(completedCount));
  if (!reduced) fireConfetti();
}
