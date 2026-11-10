// Original workspace badges. The same seed selects a badge in both modes.
const shapes = [
  '<circle cx="12" cy="12" r="2.1" fill="currentColor"/><ellipse cx="12" cy="12" rx="7.5" ry="3.7" transform="rotate(-28 12 12)" fill="none" stroke="currentColor" stroke-width="1.65"/>',
  '<path d="M12 4.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" fill="currentColor"/>',
  '<path d="M7.8 17.5l-2.6-4.3L8 7.3l4.3-1.4 6.5 3.3-.6 5.4-5.2 4.1z" fill="currentColor"/><path d="M8 7.3l3.9 5.1 6.9-3.2m-6.9 3.2 1.1 6.3" fill="none" stroke="var(--badge-bg)" stroke-width="1.2"/>',
  '<path d="M6.3 12a3.5 3.5 0 0 1 5.7-2.7 3.5 3.5 0 0 1 5.7 2.7c0 2.3-2.9 4.3-5.7 5.8-2.8-1.5-5.7-3.5-5.7-5.8z" fill="currentColor"/><circle cx="12" cy="6.1" r="1.15" fill="currentColor"/>',
]

// Each palette contains [background, foreground] for dark and light mode.
const palettes = [
  [['#39304d', '#d1b5ff'], ['#eae0fb', '#6947aa']],
  [['#263f4d', '#a0dcf1'], ['#d9edf4', '#27627a']],
  [['#27443d', '#93e0bb'], ['#d9eee1', '#21684e']],
  [['#4a2c42', '#f1a7d0'], ['#f3deeb', '#94426e']],
  [['#4a3b28', '#f4ce91'], ['#f3e9d5', '#875917']],
  [['#2f3959', '#b4c3ff'], ['#e1e7fb', '#4a5eac']],
  [['#4b3230', '#ffb4a1'], ['#f5e1d9', '#963e35']],
]

export const agentAvatars = shapes.flatMap((shape) =>
  palettes.map((palette) => palette.map(([background, foreground]) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="color:${foreground};--badge-bg:${background}"><rect x="1" y="1" width="22" height="22" rx="8" fill="${background}"/>${shape}</svg>`,
  )),
)
