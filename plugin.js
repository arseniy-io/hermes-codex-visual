/*! Hermes Codex Visual

MIT License

Copyright (c) 2026 arseniy-io

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Tabler Icons

MIT License

Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// source/plugin.js
import { THEMES_AREA } from "@hermes/plugin-sdk";

// source/chrome.js
import { createElement as h2, Fragment, useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  host as host4,
  TITLEBAR_AREAS,
  useTheme
} from "@hermes/plugin-sdk";

// source/codex-reference.js
var glyphs = {
  warning: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  sidebarDisclosure: '<path d="M6 9l6 6l6 -6"/>',
  sidebarWorking: '<path d="M12 3a9 9 0 1 0 9 9"/>',
  messageCopy: '<path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/>',
  messageEdit: '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/>',
  messageCopied: '<path d="M5 12l5 5l10 -10"/>',
  laptop: '<path d="M3 19l18 0"/><path d="M5 7a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1l0 -8"/>',
  cloud: '<path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878"/>',
  branch: '<path d="M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M15 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M7 8l0 8"/><path d="M9 18h6a2 2 0 0 0 2 -2v-5"/><path d="M14 14l3 -3l3 3"/>',
  worktree: '<path d="M10 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M15 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M7 8v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2 -2v-2"/><path d="M12 12l0 4"/>',
  queueGrip: '<path d="M8 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M8 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M14 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
  queueEdit: '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/>',
  queueFollowUp: '<path d="M18 6v6a3 3 0 0 1 -3 3h-10l4 -4m0 8l-4 -4"/>',
  queueSteer: '<path d="M15 11l4 4l-4 4m4 -4h-11a4 4 0 0 1 0 -8h1"/>',
  queueTrash: '<path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>',
  queueMore: '<path d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
  paw: '<path d="M14.7 13.5c-1.1 -2 -1.441 -2.5 -2.7 -2.5c-1.259 0 -1.736 .755 -2.836 2.747c-.942 1.703 -2.846 1.845 -3.321 3.291c-.097 .265 -.145 .677 -.143 .962c0 1.176 .787 2 1.8 2c1.259 0 3 -1 4.5 -1s3.241 1 4.5 1c1.013 0 1.8 -.823 1.8 -2c0 -.285 -.049 -.697 -.146 -.962c-.475 -1.451 -2.512 -1.835 -3.454 -3.538"/><path d="M20.188 8.082a1.039 1.039 0 0 0 -.406 -.082h-.015c-.735 .012 -1.56 .75 -1.993 1.866c-.519 1.335 -.28 2.7 .538 3.052c.129 .055 .267 .082 .406 .082c.739 0 1.575 -.742 2.011 -1.866c.516 -1.335 .273 -2.7 -.54 -3.052l-.001 0"/><path d="M9.474 9c.055 0 .109 0 .163 -.011c.944 -.128 1.533 -1.346 1.32 -2.722c-.203 -1.297 -1.047 -2.267 -1.932 -2.267c-.055 0 -.109 0 -.163 .011c-.944 .128 -1.533 1.346 -1.32 2.722c.204 1.293 1.048 2.267 1.933 2.267"/><path d="M16.456 6.733c.214 -1.376 -.375 -2.594 -1.32 -2.722a1.164 1.164 0 0 0 -.162 -.011c-.885 0 -1.728 .97 -1.93 2.267c-.214 1.376 .375 2.594 1.32 2.722c.054 .007 .108 .011 .162 .011c.885 0 1.73 -.974 1.93 -2.267"/><path d="M5.69 12.918c.816 -.352 1.054 -1.719 .536 -3.052c-.436 -1.124 -1.271 -1.866 -2.009 -1.866c-.14 0 -.277 .027 -.407 .082c-.816 .352 -1.054 1.719 -.536 3.052c.436 1.124 1.271 1.866 2.009 1.866c.14 0 .277 -.027 .407 -.082"/>',
  bots: '<path d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4"/><path d="M12 2v2"/><path d="M9 12v9"/><path d="M15 12v9"/><path d="M5 16l4 -2"/><path d="M15 14l4 2"/><path d="M9 18h6"/><path d="M10 8v.01"/><path d="M14 8v.01"/>',
  webhook: '<path d="M4.876 13.61a4 4 0 1 0 6.124 3.39h6"/><path d="M15.066 20.502a4 4 0 1 0 1.934 -7.502c-.706 0 -1.424 .179 -2 .5l-3 -5.5"/><path d="M16 8a4 4 0 1 0 -8 0c0 1.506 .77 2.818 2 3.5l-3 5.5"/>',
  graph: '<path d="M10 19a2 2 0 1 0 -4 0a2 2 0 0 0 4 0"/><path d="M18 5a2 2 0 1 0 -4 0a2 2 0 0 0 4 0"/><path d="M10 5a2 2 0 1 0 -4 0a2 2 0 0 0 4 0"/><path d="M6 12a2 2 0 1 0 -4 0a2 2 0 0 0 4 0"/><path d="M18 19a2 2 0 1 0 -4 0a2 2 0 0 0 4 0"/><path d="M14 12a2 2 0 1 0 -4 0a2 2 0 0 0 4 0"/><path d="M22 12a2 2 0 1 0 -4 0a2 2 0 0 0 4 0"/><path d="M6 12h4"/><path d="M14 12h4"/><path d="M15 7l-2 3"/><path d="M9 7l2 3"/><path d="M11 14l-2 3"/><path d="M13 14l2 3"/>',
  chatTab: '<path d="M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1"/>',
  openProject: '<path d="M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2"/>',
  verified: '<path d="M5 7.2a2.2 2.2 0 0 1 2.2 -2.2h1a2.2 2.2 0 0 0 1.55 -.64l.7 -.7a2.2 2.2 0 0 1 3.12 0l.7 .7c.412 .41 .97 .64 1.55 .64h1a2.2 2.2 0 0 1 2.2 2.2v1c0 .58 .23 1.138 .64 1.55l.7 .7a2.2 2.2 0 0 1 0 3.12l-.7 .7a2.2 2.2 0 0 0 -.64 1.55v1a2.2 2.2 0 0 1 -2.2 2.2h-1a2.2 2.2 0 0 0 -1.55 .64l-.7 .7a2.2 2.2 0 0 1 -3.12 0l-.7 -.7a2.2 2.2 0 0 0 -1.55 -.64h-1a2.2 2.2 0 0 1 -2.2 -2.2v-1a2.2 2.2 0 0 0 -.64 -1.55l-.7 -.7a2.2 2.2 0 0 1 0 -3.12l.7 -.7a2.2 2.2 0 0 0 .64 -1.55v-1"/><path d="M9 12l2 2l4 -4"/>',
  attach: '<path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5"/>',
  image: '<path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/>',
  summarySources: '<path d="M5.931 6.936l1.275 4.249m5.607 5.609l4.251 1.275"/><path d="M11.683 12.317l5.759 -5.759"/><path d="M4 5.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0"/><path d="M17 5.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0"/><path d="M17 18.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0"/><path d="M4 15.5a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0"/>',
  summaryToggle: '<path d="M12 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 6l8 0"/><path d="M16 6l4 0"/><path d="M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 12l2 0"/><path d="M10 12l10 0"/><path d="M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 18l11 0"/><path d="M19 18l1 0"/>',
  home: '<path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/>',
  checkpoint: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M9 12l2 2l4 -4"/>',
  folder: '<path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2"/>',
  folderOpen: '<path d="M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2"/>',
  folderPlus: '<path d="M12 19h-7a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v3.5"/><path d="M16 19h6"/><path d="M19 16v6"/>',
  more: '<path d="M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
  newChat: '<path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1"/><path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415"/><path d="M16 5l3 3"/>',
  projects: '<path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2"/>',
  plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
  search: '<path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/>',
  bell: '<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/>',
  right: '<path d="M9 6l6 6l-6 6"/>',
  down: '<path d="M6 9l6 6l6 -6"/>',
  back: '<path d="M5 12l14 0"/><path d="M5 12l6 6"/><path d="M5 12l6 -6"/>',
  forward: '<path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>',
  check: '<path d="M5 12l5 5l10 -10"/>',
  close: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
  pin: '<path d="M9 4v6l-2 4v2h10v-2l-2 -4v-6"/><path d="M12 16l0 5"/><path d="M8 4l8 0"/>',
  unpin: '<path d="M3 3l18 18"/><path d="M15 4.5l-3.249 3.249m-2.57 1.433l-2.181 .818l-1.5 1.5l7 7l1.5 -1.5l.82 -2.186m1.43 -2.563l3.25 -3.251"/><path d="M9 15l-4.5 4.5"/><path d="M14.5 4l5.5 5.5"/>',
  archive: '<path d="M3 6a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10"/><path d="M10 12l4 0"/>',
  edit: '<path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/>',
  markRead: '<path d="M3 9l9 6l9 -6l-9 -6l-9 6"/><path d="M21 9v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10"/><path d="M3 19l6 -6"/><path d="M15 13l6 6"/>',
  section: '<path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -2"/><path d="M4 16a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -2"/>',
  plugins: '<path d="M4 7h3a1 1 0 0 0 1 -1v-1a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0 -1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-1a2 2 0 0 0 -4 0v1a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h1a2 2 0 0 0 0 -4h-1a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1"/>',
  skills: '<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6"/>',
  messages: '<path d="M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1"/>',
  artifacts: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/><path d="M9 9l1 0"/><path d="M9 13l6 0"/><path d="M9 17l6 0"/>',
  schedule: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 7v5l3 3"/>',
  settings: '<path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/>',
  sidebar: '<path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/><path d="M9 4l0 16"/>',
  sidebarRight: '<path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/><path d="M15 4l0 16"/>',
  layout: '<path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/>',
  swap: '<path d="M7 10h14l-4 -4"/><path d="M17 14h-14l4 4"/>',
  hud: '<path d="M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1l0 -10"/><path d="M7 20h10"/><path d="M9 16v4"/><path d="M15 16v4"/><path d="M9 12v-4"/><path d="M12 12v-1"/><path d="M15 12v-2"/><path d="M12 12v-1"/>',
  changes: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/><path d="M12 10l0 4"/><path d="M10 12l4 0"/><path d="M10 17l4 0"/>',
  source: '<path d="M5.931 6.936l1.275 4.249m5.607 5.609l4.251 1.275"/><path d="M11.683 12.317l5.759 -5.759"/><path d="M4 5.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0"/><path d="M17 5.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0"/><path d="M17 18.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0"/><path d="M4 15.5a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0"/>',
  link: '<path d="M9 15l6 -6"/><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"/><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"/>',
  open: '<path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"/><path d="M11 13l9 -9"/><path d="M15 4h5v5"/>',
  mic: '<path d="M9 5a3 3 0 0 1 3 -3a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3a3 3 0 0 1 -3 -3l0 -5"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M8 21l8 0"/><path d="M12 17l0 4"/>',
  dictationStop: '<path d="M5 7a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -10"/>',
  send: '<path d="M12 5l0 14"/><path d="M18 11l-6 -6"/><path d="M6 11l6 -6"/>',
  sliders: '<path d="M12 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 6l8 0"/><path d="M16 6l4 0"/><path d="M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 12l2 0"/><path d="M10 12l10 0"/><path d="M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 18l11 0"/><path d="M19 18l1 0"/>',
  filter: '<path d="M4 4h16v2.172a2 2 0 0 1 -.586 1.414l-4.414 4.414v7l-6 2v-8.5l-4.48 -4.928a2 2 0 0 1 -.52 -1.345v-2.227"/>',
  model: '<path d="M5 6a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1l0 -12"/><path d="M9 9h6v6h-6l0 -6"/><path d="M3 10h2"/><path d="M3 14h2"/><path d="M10 3v2"/><path d="M14 3v2"/><path d="M21 10h-2"/><path d="M21 14h-2"/><path d="M14 21v-2"/><path d="M10 21v-2"/>',
  palette: '<path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25"/><path d="M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
  desktop: '<path d="M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10"/><path d="M7 20h10"/><path d="M9 16v4"/><path d="M15 16v4"/>',
  lock: '<path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6"/><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M8 11v-4a4 4 0 1 1 8 0v4"/>',
  web: '<path d="M4 8h16"/><path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"/><path d="M8 4v4"/>',
  shield: '<path d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06"/><path d="M15 19l2 2l4 -4"/>',
  shieldWarning: '<path d="M15.04 19.745c-.942 .551 -1.964 .976 -3.04 1.255a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 .195 6.015"/><path d="M19 16v3"/><path d="M19 22v.01"/>',
  memory: '<path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8"/><path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8"/><path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5"/><path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0"/><path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5"/><path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10"/>',
  wrench: '<path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5"/>',
  usage: '<path d="M10 3.2a9 9 0 1 0 10.8 10.8a1 1 0 0 0 -1 -1h-3.8a4.1 4.1 0 1 1 -5 -5v-4a.9 .9 0 0 0 -1 -.8"/><path d="M15 3.5a9 9 0 0 1 5.5 5.5h-4.5a9 9 0 0 0 -1 -1v-4.5"/>',
  system: '<path d="M12.003 21c-.732 .001 -1.465 -.438 -1.678 -1.317a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c.886 .215 1.325 .957 1.318 1.694"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M17.001 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M19.001 15.5v1.5"/><path d="M19.001 21v1.5"/><path d="M22.032 17.25l-1.299 .75"/><path d="M17.27 20l-1.3 .75"/><path d="M15.97 17.25l1.3 .75"/><path d="M20.733 20l1.3 .75"/>',
  bolt: '<path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"/>',
  globe: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/><path d="M11.5 3a17 17 0 0 0 0 18"/><path d="M12.5 3a17 17 0 0 1 0 18"/>',
  keyboard: '<path d="M2 8a2 2 0 0 1 2 -2h16a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2l0 -8"/><path d="M6 10l0 .01"/><path d="M10 10l0 .01"/><path d="M14 10l0 .01"/><path d="M18 10l0 .01"/><path d="M6 14l0 .01"/><path d="M18 14l0 .01"/><path d="M10 14l4 .01"/>',
  keys: '<path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0"/><path d="M15 9h.01"/>',
  info: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 9h.01"/><path d="M11 12h1v4h1"/>',
  download: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/>',
  upload: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 9l5 -5l5 5"/><path d="M12 4l0 12"/>',
  refresh: '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
  copy: '<path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666"/><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"/>',
  target: '<path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M7 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0"/><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/>',
  trash: '<path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>',
  play: '<path d="M7 4v16l13 -8l-13 -8"/>',
  person: '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>',
  team: '<path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/>',
  audio: '<path d="M21 12h-2c-.894 0 -1.662 -.857 -1.761 -2c-.296 -3.45 -.749 -6 -2.749 -6s-2.5 3.582 -2.5 8s-.5 8 -2.5 8s-2.452 -2.547 -2.749 -6c-.1 -1.147 -.867 -2 -1.763 -2h-2"/>',
  tools: '<path d="M3 21h4l13 -13a1.5 1.5 0 0 0 -4 -4l-13 13v4"/><path d="M14.5 5.5l4 4"/><path d="M12 8l-5 -5l-4 4l5 5"/><path d="M7 8l-1.5 1.5"/><path d="M16 12l5 5l-4 4l-5 -5"/><path d="M16 17l-1.5 1.5"/>',
  terminal: '<path d="M8 9l3 3l-3 3"/><path d="M13 15l3 0"/><path d="M3 6a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -12"/>'
};
var codexReference = Object.freeze({
  spacing: 4,
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  enter: "cubic-bezier(.19, 1, .22, 1)",
  exit: "cubic-bezier(.8, 0, .4, 1)",
  hover: "cubic-bezier(.4, 0, .2, 1)",
  move: "cubic-bezier(.65, 0, .35, 1)",
  enterTime: "150ms",
  exitTime: "100ms",
  menuStartScale: ".95",
  highlightStartScale: ".98",
  tooltip: Object.freeze({ radius: "16px", padding: "5px 12px", duration: "250ms", exitScale: ".97" }),
  summaryTime: "300ms",
  switch: Object.freeze({ width: 32, height: 19, offset: 3, trackTime: "175ms", trackDelay: "50ms", thumbTime: "250ms" }),
  disclosure: Object.freeze({ heightTime: 450, enterTime: 300, enterDelay: 75, exitTime: 150, ease: "cubic-bezier(.23, 1, .32, 1)" }),
  sidebar: Object.freeze({ rowHeight: 30, rowRadius: 10, previewWidth: 288, previewRadius: 12, previewOffset: 2 })
});
function codexMask(name, ink = "white") {
  const paths = glyphs[name];
  if (!paths) throw new Error(`Unknown workspace icon: ${name}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function codexIconStyle(name) {
  return { mask: `${codexMask(name)} center / contain no-repeat`, backgroundColor: "currentColor" };
}
function codexIconRules(selector, name, flip = false) {
  return `
    ${selector} {
      background-color: currentColor;
      mask: ${codexMask(name)} center / contain no-repeat;
      ${flip ? "scale: -1 1;" : ""}
    }
    ${selector}::before, ${selector} > * { visibility: hidden; }
  `;
}

// source/sidebar-projects.js
import { host as host2 } from "@hermes/plugin-sdk";

// source/sidebar-recents.js
import { createElement as h, isValidElement, useSyncExternalStore, version } from "react";
var sectionActions = ["onResumeSession", "onArchiveSession", "onDeleteSession", "onTogglePin", "onToggleUnread"];
function committedFiber(element4) {
  if (!element4 || !version.startsWith("19.")) return null;
  const keys = Object.keys(element4);
  let fiber = element4[keys.find((key) => key.startsWith("__reactFiber$"))];
  const props = element4[keys.find((key) => key.startsWith("__reactProps$"))];
  if (!props) return null;
  if (fiber?.memoizedProps !== props) fiber = fiber?.alternate;
  return fiber?.memoizedProps === props ? fiber : null;
}
function nativeDraftWorkspaceAction(sidebar2) {
  for (let node2 = committedFiber(sidebar2); node2; node2 = node2.return) {
    const props = node2.memoizedProps;
    if (typeof props?.onNewSessionInWorkspace === "function" && typeof props.onNewSessionSplit === "function") {
      return props.onNewSessionInWorkspace;
    }
  }
  return null;
}
function nativeWorktreePath(button2) {
  for (let node2 = committedFiber(button2); node2; node2 = node2.return) {
    if (typeof node2.memoizedProps?.repoPath === "string") return node2.memoizedProps.repoPath;
  }
  return "";
}
function groupingAction(element4) {
  if (Array.isArray(element4)) {
    for (const child of element4) {
      const action = groupingAction(child);
      if (action) return action;
    }
    return null;
  }
  if (!isValidElement(element4)) return null;
  const { children, onValueChange } = element4.props;
  if (typeof onValueChange === "function" && Array.isArray(children) && children.some((option) => option?.props?.option?.id === "project")) return onValueChange;
  return groupingAction(children);
}
function projectGroupingAction(trigger) {
  for (let node2 = committedFiber(trigger); node2; node2 = node2.return) {
    const props = node2.memoizedProps;
    if (props?.["data-slot"] === "dropdown-menu") return groupingAction(props.children);
  }
  return null;
}
function readNativeList(tree) {
  if (!version.startsWith("19.") || !tree?.matches('[data-sessions-mode="projects"], [data-sessions-mode="flat"]')) return null;
  for (const group of tree.querySelectorAll(':scope > [data-slot="sidebar-group"]')) {
    const fiber = committedFiber(group);
    if (!fiber) continue;
    for (let node2 = fiber.return; node2; node2 = node2.return) {
      const props = node2.memoizedProps;
      if (typeof node2.type !== "function" || props?.pinned !== false || typeof props.onEnterProject !== "function" || !Array.isArray(props.sessions) || !sectionActions.every((name) => typeof props[name] === "function")) continue;
      let sidebar2 = node2.return;
      while (sidebar2 && typeof sidebar2.memoizedProps?.onRetrySessions !== "function") sidebar2 = sidebar2.return;
      return {
        group,
        fiber: node2,
        section: node2.type,
        props,
        refresh: sidebar2?.memoizedProps.onRetrySessions,
        manageCronJob: sidebar2?.memoizedProps.onManageCronJob
      };
    }
  }
  return null;
}
var dotStates = /* @__PURE__ */ new Set(["background", "draft", "idle", "needs-input", "stalled", "unread", "working"]);
function nativeProjectActivity(tree) {
  const source = readNativeList(tree);
  const activity = /* @__PURE__ */ new Map();
  if (!source?.props.projectOverview?.length) return activity;
  let states;
  for (let hook = source.fiber.memoizedState; hook; hook = hook.next) {
    if (typeof hook.queue?.getSnapshot !== "function") continue;
    const value = hook.queue.getSnapshot();
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) continue;
    const statuses = Object.values(value);
    if (!statuses.length || !statuses.every((status) => dotStates.has(status))) continue;
    if (states) return activity;
    states = value;
  }
  if (!states) return activity;
  const liveId = (id2) => states[id2] === "working" || states[id2] === "stalled";
  const unreadId = (id2) => states[id2] === "unread";
  if (!Object.keys(states).some((id2) => liveId(id2) || unreadId(id2))) return activity;
  const { projectOverview, projectOverviewPreviews } = source.props;
  const hasStatus = (project, matches) => {
    const sessionMatches = (session) => matches(session.id);
    return project.sessionIds?.some(matches) || projectOverviewPreviews?.[project.id]?.some(sessionMatches) || !project.sessionIds && (project.previewSessions?.some(sessionMatches) || project.repos.some((repo) => repo.groups.some((group) => group.sessions.some(sessionMatches))));
  };
  for (const project of projectOverview) {
    if (hasStatus(project, liveId)) activity.set(project.id, "working");
    else if (hasStatus(project, unreadId)) activity.set(project.id, "unread");
  }
  return activity;
}
function manageSidebarCronJob(tree, id2) {
  const action = readNativeList(tree)?.manageCronJob;
  if (typeof action !== "function") return false;
  action(id2);
  return true;
}
function createRecentRows() {
  let snapshot = null;
  const subscribers = /* @__PURE__ */ new Set();
  function set(value) {
    snapshot = value;
    for (const notify of subscribers) notify();
  }
  return {
    get: () => snapshot,
    subscribe(notify) {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    update(tree, container, empty) {
      const source = readNativeList(tree);
      const flat = tree?.dataset.sessionsMode === "flat";
      if (!source || flat && (source.props.grouping !== "date" || source.props.groups?.length)) return null;
      if (snapshot?.container !== container || snapshot?.props !== source.props || snapshot?.group !== source.group || snapshot?.empty !== empty) {
        set({ ...source, container, empty, flat });
      }
      return source.group;
    },
    clear(container) {
      if (snapshot?.container === container) set(null);
    }
  };
}
function NativeRecentRows({ rows }) {
  const snapshot = useSyncExternalStore(rows.subscribe, rows.get);
  if (!snapshot) return null;
  const { section: section2, props, container, empty, flat } = snapshot;
  const sessions = props.sessions;
  const children = h(section2, flat ? {
    ...props,
    grouping: "none",
    showProfileTags: new Set(sessions.map((session) => session.profile)).size > 1
  } : {
    label: "",
    open: true,
    collapsible: false,
    pinned: false,
    preserveOrder: true,
    sessions,
    contentClassName: "hcv-recent-scroll",
    card: props.card,
    forceEmptyState: props.forceEmptyState,
    activeSessionId: props.activeSessionId,
    showProfileTags: new Set(sessions.map((session) => session.profile)).size > 1,
    onResumeSession: props.onResumeSession,
    onArchiveSession: props.onArchiveSession,
    onDeleteSession: props.onDeleteSession,
    onBranchSession: props.onBranchSession,
    onTogglePin: props.onTogglePin,
    onToggleUnread: props.onToggleUnread,
    emptyState: props.forceEmptyState ? props.emptyState : h("div", { "data-hcv-recent-empty": "" }, empty)
  });
  return { $$typeof: /* @__PURE__ */ Symbol.for("react.portal"), key: null, children, containerInfo: container, implementation: null };
}

// source/sidebar-chat-order.js
import { host } from "@hermes/plugin-sdk";
var rowButton = 'button[data-slot="row-button"]';
var ordered = "data-hcv-ordered-chats";
var orderProperty = "--hcv-chat-order";
var dragging = "data-hcv-reordering-chat";
function sessionRow(row2) {
  const button2 = row2.querySelector(":scope > " + rowButton);
  for (let fiber = committedFiber(button2); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps;
    const session = props?.session;
    if (typeof session?.id === "string" && typeof props.onResume === "function") {
      const key = JSON.stringify([session.profile || "default", session._lineage_root_id ?? session.id]);
      return { key, branch: Boolean(props.branchStem), row: row2, button: button2 };
    }
  }
  return null;
}
function groupsIn(list) {
  const groups2 = [];
  let group;
  for (const [index, row2] of Array.from(list.children).entries()) {
    const session = sessionRow(row2);
    if (!session) {
      group = void 0;
      continue;
    }
    if (!group) {
      group = { index, chats: [] };
      groups2.push(group);
    }
    const parent = group.chats.at(-1);
    if (session.branch && parent) parent.rows.push(row2);
    else group.chats.push({ key: session.key, button: session.button, rows: [row2] });
  }
  return groups2;
}
function orderedChats(chats, ranks) {
  const known = chats.filter((chat2) => ranks.has(chat2.key)).sort((a, b) => ranks.get(a.key) - ranks.get(b.key));
  let index = 0;
  return chats.map((chat2) => ranks.has(chat2.key) ? known[index++] : chat2);
}
function storageKey(project) {
  const connection = host.state.connectionId.get();
  const profile2 = host.state.profile.get();
  return connection && profile2 && project ? "sidebar-chat-order:" + JSON.stringify([connection, profile2, project]) : "";
}
function savedOrder(storage, key) {
  const value = storage.get(key, []);
  return Array.isArray(value) ? [...new Set(value.filter((id2) => typeof id2 === "string"))] : [];
}
function sameOrder(left, right) {
  return left.every((chat2, index) => chat2 === right[index]);
}
function contains(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
function attachSidebarChatOrder(content, storage) {
  const lists = /* @__PURE__ */ new Map();
  const styled = /* @__PURE__ */ new Set();
  const line = document.createElement("div");
  line.dataset.hcvChatDropLine = "";
  line.setAttribute("aria-hidden", "true");
  let drag;
  let frame = 0;
  function restore(list) {
    list.removeAttribute(ordered);
    for (const row2 of list.children) row2.style.removeProperty(orderProperty);
    styled.delete(list);
  }
  function sync(projectLists) {
    lists.clear();
    for (const { project, list } of projectLists) {
      const key = storageKey(project);
      if (!key || !list) continue;
      const groups2 = groupsIn(list);
      if (!groups2.length) continue;
      const order = savedOrder(storage, key);
      const ranks = new Map(order.map((id2, index) => [id2, index]));
      const children = [...list.children];
      let shifted = false;
      for (const group of groups2) {
        const sorted = orderedChats(group.chats, ranks);
        if (!sameOrder(group.chats, sorted)) {
          const rows = sorted.flatMap((chat2) => chat2.rows);
          children.splice(group.index, rows.length, ...rows);
          shifted = true;
        }
        group.chats = sorted;
      }
      if (shifted) {
        list.setAttribute(ordered, "");
        children.forEach((row2, index) => row2.style.setProperty(orderProperty, String(index)));
        styled.add(list);
      } else if (styled.has(list)) restore(list);
      lists.set(list, { key, project, groups: groups2 });
    }
    for (const list of styled) if (!lists.has(list)) restore(list);
    if (drag && !lists.has(drag.list)) end();
  }
  function position2(x, y) {
    const entry = lists.get(drag.list);
    if (!entry || entry.key !== drag.key || entry.key !== storageKey(entry.project) || !drag.list.isConnected || drag.list.closest("[hidden], [inert], [data-pane-hidden]") || !contains(content.getBoundingClientRect(), x, y) || !contains(drag.list.getBoundingClientRect(), x, y)) return null;
    const group = entry.groups.find(({ chats }) => chats.some((chat2) => chat2.key === drag.chat));
    if (!group || new Set(group.chats.map((chat2) => chat2.key)).size !== group.chats.length) return null;
    const geometry = group.chats.map((chat2) => {
      const first = chat2.rows[0].getBoundingClientRect();
      const bottom = chat2.rows.at(-1).getBoundingClientRect().bottom;
      return { chat: chat2, first, bottom };
    });
    if (y < geometry[0].first.top || y > geometry.at(-1).bottom) return null;
    const others = geometry.filter((item) => item.chat.key !== drag.chat);
    const before = others.findIndex((item) => y <= (item.first.top + item.bottom) / 2);
    const index = before < 0 ? others.length : before;
    const target = others[index] || others.at(-1);
    if (!target) return null;
    const next = others.map((item) => item.chat);
    next.splice(index, 0, group.chats.find((chat2) => chat2.key === drag.chat));
    if (sameOrder(group.chats, next)) return null;
    return { group: group.chats, next, rect: target.first, y: before < 0 ? target.bottom : target.first.top };
  }
  function draw() {
    frame = 0;
    const target = drag?.point && position2(...drag.point);
    document.documentElement.toggleAttribute(dragging, Boolean(target));
    if (!target) {
      line.remove();
      return;
    }
    line.style.left = target.rect.left + 6 + "px";
    line.style.width = Math.max(0, target.rect.width - 12) + "px";
    line.style.top = target.y - 1 + "px";
    if (!line.isConnected) document.body.append(line);
  }
  function move(event) {
    if (event.pointerId !== drag.pointer) return;
    if (!drag.point && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
    drag.point = [event.clientX, event.clientY];
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function end() {
    drag = void 0;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    line.remove();
    document.documentElement.removeAttribute(dragging);
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", release, true);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("keydown", keydown, true);
    window.removeEventListener("blur", end);
  }
  function release(event) {
    if (event.pointerId !== drag.pointer) return;
    const target = drag.point && position2(event.clientX, event.clientY);
    const key = drag.key;
    end();
    if (!target) return;
    const visible = new Set(target.group.map((chat2) => chat2.key));
    const previous = [.../* @__PURE__ */ new Set([...savedOrder(storage, key), ...visible])];
    let index = 0;
    storage.set(key, previous.map((id2) => visible.has(id2) ? target.next[index++].key : id2));
    sync([...lists].map(([list, entry]) => ({ list, project: entry.project })));
  }
  function cancel(event) {
    if (event.pointerId === drag.pointer) end();
  }
  function keydown(event) {
    if (event.key === "Escape") end();
  }
  function press(event) {
    if (drag || !event.isPrimary || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !(event.target instanceof Element) || event.target.closest('[data-row-actions], [data-reorder-handle], [contenteditable="true"]')) return;
    const button2 = event.target.closest(rowButton);
    const list = button2?.parentElement?.parentElement;
    const entry = lists.get(list);
    const chat2 = entry?.groups.find((group) => group.chats.length > 1 && group.chats.some((item) => item.button === button2))?.chats.find((item) => item.button === button2);
    if (!chat2 || entry.key !== storageKey(entry.project)) return;
    drag = { list, key: entry.key, chat: chat2.key, pointer: event.pointerId, x: event.clientX, y: event.clientY };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("blur", end);
  }
  content.addEventListener("pointerdown", press, true);
  return {
    sync,
    dispose() {
      content.removeEventListener("pointerdown", press, true);
      end();
      for (const list of styled) restore(list);
      lists.clear();
    }
  };
}
function sidebarChatOrderStyles(active2) {
  return `
    ${active2} [${ordered}] { reading-flow: grid-order; }
    ${active2} [${ordered}] > * { order: var(${orderProperty}, 0); }
    ${active2} [data-hcv-chat-drop-line] {
      position: fixed;
      z-index: 100;
      height: 2px;
      border-radius: 999px;
      pointer-events: none;
      background: var(--hcv-focus);
    }
    ${active2}[${dragging}] body { cursor: grabbing !important; }
    ${active2}[${dragging}] [data-slot="chat-drop-overlay"],
    ${active2}[${dragging}] [data-tree-group] > .pointer-events-none.absolute.inset-0.z-40:has(> .border-dashed) {
      visibility: hidden;
    }
  `;
}

// source/sidebar-projects.js
var media = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var folderRows = "[data-sessions-project]:not([data-sessions-mode])";
var scope = '[data-sessions-mode="projects"]';
var projectSection = "[data-hcv-projects-section]";
var sectionHeader = "[data-hcv-projects-header]";
var projectRow = "[data-hcv-project-row]";
var sectionActions2 = "[data-hcv-projects-actions]";
var previewCard = "[data-hcv-project-preview]";
var sectionMotion = codexReference.disclosure;
function el(tag, attributes = {}, text) {
  const node2 = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node2.setAttribute(key, value);
  if (text !== void 0) node2.textContent = text;
  return node2;
}
function glyph(name) {
  const node2 = el("span", { "aria-hidden": "true", "data-hcv-icon": name });
  Object.assign(node2.style, codexIconStyle(name));
  return node2;
}
function projectStatus() {
  return el("span", { "data-hcv-project-status": "", role: "status", hidden: "" });
}
function showStatus(indicator, kind, t) {
  if (indicator.dataset.hcvProjectStatus !== kind) indicator.dataset.hcvProjectStatus = kind;
  if (kind) {
    const label = t(kind);
    if (indicator.getAttribute("aria-label") !== label) indicator.setAttribute("aria-label", label);
  }
  const hidden = !kind;
  if (indicator.hidden !== hidden) indicator.hidden = hidden;
}
function blockSize(node2) {
  const style = getComputedStyle(node2);
  return {
    height: `${node2.offsetHeight}px`,
    paddingBlockStart: style.paddingBlockStart,
    paddingBlockEnd: style.paddingBlockEnd
  };
}
function disclosure(button2, native, region, regionId, timing = sectionMotion) {
  const direct = button2 === native;
  const initialExpanded = button2.getAttribute("aria-expanded");
  const initialControls = button2.getAttribute("aria-controls");
  let pending = false;
  let forwarding = false;
  let motion2;
  let marked;
  function nativeClick() {
    forwarding = true;
    try {
      native.click();
    } finally {
      forwarding = false;
    }
  }
  const restoreId = () => {
    if (marked?.id === regionId) marked.removeAttribute("id");
    marked = void 0;
  };
  function cancel() {
    const previous = motion2;
    motion2 = void 0;
    if (!previous) return;
    previous.height.cancel();
    previous.fade.cancel();
    previous.node.removeAttribute("data-hcv-disclosure-motion");
    if (previous.closing && !previous.wasInert) previous.node.inert = false;
  }
  function play(node2, opening, from, startOpacity) {
    cancel();
    if (!node2.isConnected || media()) {
      if (!opening && native.isConnected) nativeClick();
      return;
    }
    const natural = blockSize(node2);
    if (!node2.offsetHeight) {
      if (!opening && native.isConnected) nativeClick();
      return;
    }
    const wasInert = node2.inert;
    if (!opening) node2.inert = true;
    node2.setAttribute("data-hcv-disclosure-motion", "");
    const empty = { height: "0px", paddingBlockStart: "0px", paddingBlockEnd: "0px" };
    const height = node2.animate(
      [from || empty, opening ? natural : empty],
      { duration: timing.heightTime, easing: timing.ease, fill: "both" }
    );
    const fade = node2.animate(
      [{ opacity: startOpacity, scale: opening && !from ? ".98" : "1" }, { opacity: opening ? 1 : 0, scale: opening ? "1" : ".98" }],
      { duration: opening ? timing.enterTime : timing.exitTime, delay: opening && !from ? timing.enterDelay : 0, easing: timing.ease, fill: "both" }
    );
    const current = motion2 = { node: node2, height, fade, closing: !opening, wasInert };
    height.onfinish = () => {
      if (motion2 !== current) return;
      if (!opening && native.isConnected && region() === node2) nativeClick();
      cancel();
    };
  }
  function onClick(event) {
    if (forwarding) return;
    const node2 = region();
    const reduced = media();
    if (!node2 || reduced) {
      pending = !node2 && !reduced;
      if (!direct) nativeClick();
      return;
    }
    if (direct) event.stopPropagation();
    const dimensions = blockSize(node2);
    const opacity = Number(getComputedStyle(node2).opacity);
    const opening = Boolean(motion2?.closing);
    button2.setAttribute("aria-expanded", String(opening));
    play(node2, opening, dimensions, opacity);
  }
  function onReducedMotion(event) {
    if (!event.matches || !motion2) return;
    const closing = motion2.closing && motion2.node === region();
    cancel();
    if (closing && native.isConnected) nativeClick();
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  button2.addEventListener("click", onClick, direct);
  reducedMotion.addEventListener("change", onReducedMotion);
  return {
    sync() {
      const node2 = region();
      if (motion2 && motion2.node !== node2) cancel();
      if (node2 && pending) {
        pending = false;
        play(node2, true, null, 0);
      }
      if (marked !== node2) {
        restoreId();
        if (node2 && !node2.id) {
          node2.id = regionId;
          marked = node2;
        }
      }
      const expanded = Boolean(node2 && !motion2?.closing);
      if (button2.getAttribute("aria-expanded") !== String(expanded)) button2.setAttribute("aria-expanded", String(expanded));
      const controlId = node2?.id;
      if (controlId && button2.getAttribute("aria-controls") !== controlId) button2.setAttribute("aria-controls", controlId);
      else if (!controlId) button2.removeAttribute("aria-controls");
    },
    dispose() {
      cancel();
      restoreId();
      button2.removeEventListener("click", onClick, direct);
      reducedMotion.removeEventListener("change", onReducedMotion);
      if (direct) {
        if (initialExpanded === null) button2.removeAttribute("aria-expanded");
        else button2.setAttribute("aria-expanded", String(Boolean(region())));
        if (initialControls === null) button2.removeAttribute("aria-controls");
        else button2.setAttribute("aria-controls", initialControls);
      }
    }
  };
}
function openNativeEdit(trigger, alive) {
  if (!trigger?.isConnected) return;
  trigger.focus({ preventScroll: true });
  trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  requestAnimationFrame(() => {
    if (!alive()) return;
    const menu = document.getElementById(trigger.getAttribute("aria-controls"));
    const edit3 = menu?.querySelector('[role="menuitem"]:has(> .codicon-edit)') || menu?.querySelector('[role="menuitem"]:has(> .codicon-symbol-color)');
    edit3?.click();
  });
}
function projectPreview(content, t) {
  const card = el("section", { "data-hcv-project-preview": "" });
  card.hidden = true;
  const title = el("span");
  const heading = el("header");
  heading.append(glyph("folder"), title);
  const count = el("span");
  const sessions = el("div", { "data-hcv-project-preview-row": "" });
  sessions.append(glyph("messages"), count);
  const summary = el("div", { "data-hcv-project-preview-summary": "" });
  summary.append(heading, sessions);
  const path = el("span");
  const folder = el("div", { "data-hcv-project-preview-row": "", "data-hcv-project-preview-path": "" });
  folder.append(glyph("folder"), path);
  const edit3 = el("button", { type: "button", "data-hcv-project-preview-row": "" });
  const editLabel = el("span");
  edit3.append(glyph("settings"), editLabel);
  const footer = el("div", { "data-hcv-project-preview-edit": "" });
  footer.append(edit3);
  card.append(summary, folder, footer);
  document.body.append(card);
  let hovered;
  let showing;
  let timer;
  let delay;
  let cache;
  let alive = true;
  const supportsHover = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
  function close() {
    clearTimeout(timer);
    clearTimeout(delay);
    hovered = void 0;
    showing?.row.removeAttribute("data-hcv-preview-open");
    showing = void 0;
    card.hidden = true;
  }
  function position2() {
    if (!showing || !showing.row.isConnected || !content.isConnected) return close();
    const rect = showing.row.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight) return close();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const gap = codexReference.sidebar.previewOffset;
    const left = rect.right + width + gap + 8 <= innerWidth ? rect.right + gap : rect.left - width - gap;
    card.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, left))}px`;
    card.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, rect.top))}px`;
  }
  async function projectData(id2) {
    const connection = host2.state.connectionId.get();
    const profile2 = host2.state.profile.get();
    if (!profile2 || !connection || host2.state.gateway.get() !== "open") return;
    const key = JSON.stringify([connection, profile2]);
    const scopeMatches = () => connection === host2.state.connectionId.get() && profile2 === host2.state.profile.get();
    if (cache?.key !== key || Date.now() >= cache.until) {
      const result = (async () => {
        const routes = await host2.profileRoutes().catch(() => []);
        if (!alive || !scopeMatches()) return [];
        const route = routes.find((entry) => entry.connectionId === connection && entry.profile === profile2);
        const params = { preview_limit: 1 };
        const response3 = route ? await host2.requestProfile(route, "projects.tree", params, 5e3) : await host2.request("projects.tree", params, 5e3);
        return Array.isArray(response3?.projects) ? response3.projects : [];
      })().catch(() => []);
      cache = { key, until: Date.now() + 3e4, result };
    }
    const projects2 = await cache.result;
    return scopeMatches() ? projects2.find((item) => item.id === id2) : void 0;
  }
  async function show(entry) {
    if (!alive || !entry.row.isConnected || hovered !== entry) return;
    showing?.row.removeAttribute("data-hcv-preview-open");
    showing = entry;
    entry.row.setAttribute("data-hcv-preview-open", "");
    card.setAttribute("aria-label", t("projectDetails"));
    editLabel.textContent = t("editProject");
    title.textContent = entry.name.textContent;
    sessions.hidden = true;
    folder.hidden = true;
    footer.hidden = !entry.menu;
    card.hidden = false;
    position2();
    const data = await projectData(entry.id);
    if (!alive || showing !== entry || !data) return;
    if (Number.isFinite(data.sessionCount)) {
      count.textContent = t("projectChats", data.sessionCount);
      sessions.hidden = false;
    }
    if (typeof data.path === "string" && data.path) {
      path.textContent = data.path;
      folder.hidden = false;
    }
    position2();
  }
  function deferClose() {
    clearTimeout(timer);
    clearTimeout(delay);
    delay = setTimeout(close, 110);
  }
  function onPointerDown(event) {
    if (!card.contains(event.target)) close();
  }
  function onEscape(event) {
    if (event.key === "Escape" && showing) close();
  }
  edit3.addEventListener("click", () => {
    const entry = showing;
    close();
    openNativeEdit(entry?.menu, () => alive && entry?.row.isConnected);
  });
  card.addEventListener("pointerenter", () => clearTimeout(delay));
  card.addEventListener("pointerleave", deferClose);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onEscape, true);
  content.addEventListener("scroll", close, true);
  window.addEventListener("resize", close);
  const stopProfile = host2.state.profile.subscribe(() => {
    cache = void 0;
    close();
  });
  const stopConnection = host2.state.connectionId.subscribe(() => {
    cache = void 0;
    close();
  });
  return {
    attach(entry) {
      const enter = (event) => {
        if (!supportsHover.matches || event.pointerType !== "mouse" || event.buttons || !entry.menu) return;
        clearTimeout(delay);
        clearTimeout(timer);
        hovered = entry;
        timer = setTimeout(() => {
          void show(entry);
        }, 350);
      };
      entry.name.addEventListener("pointerenter", enter);
      entry.row.addEventListener("pointerleave", deferClose);
      return () => {
        entry.name.removeEventListener("pointerenter", enter);
        entry.row.removeEventListener("pointerleave", deferClose);
        if (hovered === entry || showing === entry) close();
      };
    },
    dispose() {
      alive = false;
      close();
      stopProfile();
      stopConnection();
      content.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onEscape, true);
      card.remove();
    }
  };
}
function attachProjects(content, t, storage) {
  const rows = /* @__PURE__ */ new Map();
  const preview = projectPreview(content, t);
  const chatOrder = attachSidebarChatOrder(content, storage);
  let section2;
  let reveal;
  function clearSection() {
    if (!section2) return;
    section2.motion.dispose();
    section2.group.removeAttribute("data-hcv-projects-section");
    section2.header.removeAttribute("data-hcv-projects-header");
    section2.native.removeAttribute("data-hcv-native-project-action");
    section2.actions?.removeAttribute("data-hcv-projects-actions");
    section2.button.remove();
    section2.status.remove();
    section2 = void 0;
  }
  function clearRow(key, entry) {
    entry.detach();
    entry.motion?.dispose();
    entry.row.removeAttribute("data-hcv-project-row");
    entry.link.removeAttribute("data-hcv-native-project-action");
    entry.toggle?.removeAttribute("data-hcv-native-project-action");
    entry.name.remove();
    entry.status.remove();
    rows.delete(key);
  }
  function syncSection(tree) {
    const filter = tree?.querySelector(':scope > [data-slot="sidebar-group"] > div button:has(> .codicon-list-filter)');
    const group = filter?.closest('[data-slot="sidebar-group"]');
    const header = group?.firstElementChild;
    const native = header?.querySelector(":scope > button:not([data-hcv-section-toggle])");
    if (section2?.native !== native) clearSection();
    if (!native) return;
    if (!section2) {
      const button2 = el("button", { type: "button", "data-hcv-section-toggle": "" });
      const label = document.createTextNode("");
      const status = projectStatus();
      button2.append(label, glyph("sidebarDisclosure"));
      native.before(button2);
      native.setAttribute("data-hcv-native-project-action", "");
      group.setAttribute("data-hcv-projects-section", "");
      header.setAttribute("data-hcv-projects-header", "");
      const actions = native.nextElementSibling;
      actions?.setAttribute("data-hcv-projects-actions", "");
      header.append(status);
      const region = () => group.querySelector(':scope > [data-slot="sidebar-group-content"]');
      section2 = { native, button: button2, group, header, actions, label, status, motion: disclosure(button2, native, region, "hcv-projects-list") };
    }
    const text = t("projects");
    if (section2.label.data !== text) section2.label.data = text;
    section2.motion.sync();
  }
  return {
    sync() {
      const view = content.querySelector("[data-sessions-mode]");
      const mode = view?.dataset.sessionsMode;
      if (reveal && (reveal.connection !== host2.state.connectionId.get() || reveal.profile !== host2.state.profile.get())) reveal = void 0;
      if (mode === "project") {
        chatOrder.sync([]);
        const back = view.querySelector('button[class~="group/back"]');
        const id2 = view.dataset.sessionsProject;
        if (back && (reveal?.back !== back || reveal.id !== id2)) {
          reveal = { back, id: id2, connection: host2.state.connectionId.get(), profile: host2.state.profile.get() };
          back.click();
        }
        return;
      }
      if (mode && mode !== "projects") reveal = void 0;
      const tree = content.querySelector(scope);
      syncSection(tree);
      const activity = nativeProjectActivity(tree);
      if (section2) {
        const collapsedStatus = [...activity.values()].includes("working") ? "working" : activity.size ? "unread" : "";
        showStatus(section2.status, section2.button.ariaExpanded === "false" ? collapsedStatus : "", t);
      }
      const seen = /* @__PURE__ */ new Set();
      const projectLists = [];
      for (const item of tree?.querySelectorAll(folderRows) || []) {
        const row2 = item.querySelector(':scope > [class~="group/workspace"]');
        const link = row2?.querySelector(':scope > div > button[data-slot="row-button"]');
        const text = link?.textContent.trim();
        if (!text) continue;
        const toggle2 = row2.querySelector(":scope > div > button[data-row-actions]:has(> .codicon-chevron-right)");
        seen.add(item);
        let entry = rows.get(item);
        if (entry && (entry.link !== link || entry.toggle !== toggle2)) {
          clearRow(item, entry);
          entry = void 0;
        }
        if (!entry) {
          const name = el(toggle2 ? "button" : "span", {
            ...toggle2 ? { type: "button", "data-row-actions": "" } : {},
            "data-hcv-project-name": ""
          }, text);
          const status = projectStatus();
          link.before(name);
          row2.append(status);
          row2.setAttribute("data-hcv-project-row", "");
          link.setAttribute("data-hcv-native-project-action", "");
          toggle2?.setAttribute("data-hcv-native-project-action", "");
          const id2 = item.dataset.sessionsProject;
          const region = () => item.querySelector(":scope > div.grid:not([data-hcv-project-row])");
          const motion2 = toggle2 ? disclosure(name, toggle2, region, `hcv-project-${encodeURIComponent(id2)}`) : null;
          entry = { row: row2, name, link, toggle: toggle2, id: id2, region, motion: motion2, status, menu: row2.querySelector('[data-row-actions] button[aria-haspopup="menu"]') };
          entry.detach = preview.attach(entry);
          rows.set(item, entry);
        } else if (entry.name.textContent !== text) entry.name.textContent = text;
        entry.motion?.sync();
        projectLists.push({ project: entry.id, list: entry.region() });
        showStatus(entry.status, entry.name.ariaExpanded === "true" ? "" : activity.get(entry.id) || "", t);
      }
      for (const [key, entry] of rows) if (!seen.has(key)) clearRow(key, entry);
      chatOrder.sync(projectLists);
      if (section2 && reveal) {
        if (section2.button.ariaExpanded === "false") {
          if (reveal.header !== section2.button) {
            reveal.header = section2.button;
            section2.button.click();
          }
        } else {
          const entry = [...rows.values()].find((row2) => row2.id === reveal.id);
          if (entry) {
            reveal = void 0;
            if (entry.name.ariaExpanded === "false") entry.name.click();
            entry.row.scrollIntoView({ block: "nearest" });
          }
        }
      }
    },
    dispose() {
      chatOrder.dispose();
      for (const [key, entry] of rows) clearRow(key, entry);
      clearSection();
      preview.dispose();
    }
  };
}
function projectSidebarStyles(active2) {
  const section2 = `${active2} ${projectSection}`;
  const header = `${active2} ${sectionHeader}`;
  const toggle2 = `${sectionHeader} > [data-hcv-section-toggle]`;
  const caret = '[data-hcv-icon="sidebarDisclosure"]';
  const row2 = `${active2} ${projectRow}`;
  const preview = `${active2} ${previewCard}`;
  const actions = `${header} ${sectionActions2}`;
  const status = "[data-hcv-project-status]";
  const unread = '[data-hcv-project-status="unread"]:not([hidden])';
  const unreadHeader = `${header}:has(> ${unread})`;
  const readAction = "button:has(> .codicon-check-all)";
  return `
  ${sidebarChatOrderStyles(active2)}
  ${active2} [data-hcv-native-project-action] { display: none !important; }
  ${active2} [data-tour="sessions-sidebar"] [data-sessions-mode="project"]:has(button[class~="group/back"]) { visibility: hidden; }
  ${active2} [data-hcv-disclosure-motion] {
    flex: 0 0 auto;
    min-block-size: 0;
    box-sizing: border-box;
    overflow: clip;
    transform-origin: center bottom;
  }
  ${row2} > div:has(> [data-hcv-project-name]) { gap: 8px; padding-block: 0; }
  ${row2} [data-hcv-project-name] {
    min-inline-size: 0;
    flex: 1 1 auto;
    align-self: stretch;
    align-content: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: start;
    border-radius: 8px;
    color: var(--hcv-text);
    font: 400 13px/20px var(--hcv-ui-font);
  }
  ${row2} button[data-hcv-project-name] { cursor: pointer; }
  ${row2} { position: relative; }
  ${row2}[data-hcv-preview-open] { background: var(--hcv-hover); }
  ${row2}:has(> ${status}:not([hidden])) { padding-inline-end: 23px; }
  ${row2} > ${status} {
    position: absolute; inset-inline-end: 5px; inset-block-start: 50%; translate: 0 -50%;
  }
  ${row2}:has(> [data-row-actions]):is(:hover, :has(:focus-visible), [data-hcv-preview-open]) > ${status} { opacity: 0; }
  ${header} { min-block-size: 32px; padding: 0 4px 0 8px; column-gap: 0; }
  ${active2} ${toggle2} {
    display: flex; align-items: center; gap: 4px; min-block-size: 28px;
    flex: 1 1 0; min-inline-size: 0; align-self: stretch;
    border-radius: 7px; background-color: transparent; color: var(--hcv-sidebar-heading);
    font: 500 13px/18px var(--hcv-ui-font); cursor: pointer;
  }
  ${active2} ${toggle2} ${caret} { inline-size: 12px; block-size: 12px; flex: none; opacity: 0; }
  ${active2} ${toggle2}[aria-expanded="false"] ${caret} { rotate: -90deg; opacity: 1; }
  ${section2}:hover ${toggle2} ${caret}, ${active2} ${toggle2}:focus-visible ${caret} { opacity: 1; }
  ${actions} button { opacity: 0; inline-size: 26px; block-size: 26px; border-radius: 7px; }
  ${header}:is(:hover, :focus-within) ${sectionActions2} button,
  ${actions}:has(button:is([aria-expanded="true"], [data-state="open"])) button { opacity: 1; }
  ${actions} > :has(.codicon-list-filter) { order: -1; }
  ${actions} > ${readAction} { display: none; }
  ${unreadHeader} ${sectionActions2} > ${readAction} {
    display: grid; order: 1; position: relative; opacity: 1; inline-size: 20px; block-size: 20px;
  }
  ${unreadHeader}:has(${sectionActions2} > button > .codicon-check-all) > ${unread} { display: none; }
  ${actions} > ${readAction} .codicon-check-all { opacity: 0; }
  ${actions} > ${readAction}::after {
    content: ''; position: absolute; inset: 0; margin: auto;
    inline-size: 7px; block-size: 7px; border-radius: 50%; background: var(--hcv-unread);
  }
  ${codexIconRules(`${actions} .codicon-list-filter`, "more")}
  ${codexIconRules(`${actions} .codicon-add`, "plus")}
  ${preview} {
    position: fixed; z-index: 48; inline-size: min(${codexReference.sidebar.previewWidth}px, calc(100vw - 16px));
    display: flex; flex-direction: column; gap: 6px;
    max-block-size: calc(100vh - 16px); overflow: auto; padding: 8px; border-radius: ${codexReference.sidebar.previewRadius}px;
    background: var(--hcv-menu); box-shadow: 0 0 0 .5px var(--hcv-hairline), 0 8px 16px -4px #00000030;
    color: var(--hcv-text); font: 400 13px/20px var(--hcv-ui-font);
    opacity: 1; scale: 1; transform-origin: left top;
  }
  ${preview}[hidden] { display: none; opacity: 0; scale: .97; pointer-events: none; }
  ${preview} [hidden] { display: none; }
  ${preview} [data-hcv-project-preview-summary] { display: flex; flex-direction: column; gap: 4px; }
  ${preview} :is(header, [data-hcv-project-preview-row]):not([hidden]) {
    display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: center; gap: 6px;
  }
  ${preview} header { font: 500 14px/24px var(--hcv-ui-font); }
  ${preview} header > :last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${preview} :is([data-hcv-project-preview-path], [data-hcv-project-preview-edit]) {
    border-block-start: 1px solid var(--hcv-hairline); padding-block-start: 6px;
  }
  ${preview} [data-hcv-project-preview-path] > :last-child { word-break: break-all; }
  ${preview} [data-hcv-icon] { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; color: var(--hcv-muted); }
  ${preview} button { inline-size: 100%; text-align: start; border-radius: 6px; cursor: pointer; }
  ${active2} :is(${sectionHeader}, ${previewCard}) button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  @media (hover: hover) and (pointer: fine) {
    ${preview} button:hover { background: var(--hcv-hover); }
  }
  @media (any-hover: none) {
    ${actions} button { opacity: 1; }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${preview} { transition: opacity 150ms var(--hcv-enter), scale 150ms var(--hcv-enter), display 150ms allow-discrete; }
    ${preview}[hidden] { transition: opacity 100ms var(--hcv-exit), scale 100ms var(--hcv-exit), display 100ms allow-discrete; }
    @starting-style { ${preview}:not([hidden]) { opacity: 0; scale: .95; } }
    ${active2} ${toggle2} ${caret} { transition: opacity 150ms var(--hcv-enter), rotate 150ms var(--hcv-enter); }
  }
`;
}

// source/sidebar-cron.js
import { host as host3, translateNow } from "@hermes/plugin-sdk";
var projects = '[data-sessions-mode="projects"]';
var nativeSection = "[data-hcv-cron-native]";
var nativeRows = '[class~="group/cron"]';
var nativeRowToggle = "> button[aria-expanded]";
var motion = { ...codexReference.disclosure, heightTime: 220, enterTime: 170, enterDelay: 0, exitTime: 120 };
function element(tag, attrs = {}, value) {
  const node2 = document.createElement(tag);
  for (const [name, attr] of Object.entries(attrs)) node2.setAttribute(name, attr);
  if (value) node2.textContent = value;
  return node2;
}
function glyph2(name) {
  const node2 = element("span", { "aria-hidden": "true", "data-hcv-cron-icon": name });
  Object.assign(node2.style, codexIconStyle(name));
  return node2;
}
function nextRun(job) {
  const time = Date.parse(job.next_run_at || "");
  return Number.isFinite(time) ? time : Infinity;
}
function attachNativeCron(content) {
  const headings = ':scope > [data-sessions-mode] > [data-slot="sidebar-group"] > [class~="group/section"] > button[class~="group/section-label"]';
  let heading;
  let group;
  let section2;
  let nextId = 0;
  const rows = /* @__PURE__ */ new Map();
  function dispose() {
    for (const row2 of rows.values()) row2.dispose();
    rows.clear();
    section2?.dispose();
    section2 = void 0;
    group?.removeAttribute("data-hcv-cron-native");
    group = void 0;
  }
  return {
    sync() {
      const label = translateNow("sidebar.cronJobs");
      const current = [...content.querySelectorAll(headings)].find((node2) => node2.textContent.trim() === label);
      if (current !== heading) {
        dispose();
        heading = current;
        if (heading) {
          group = heading.closest('[data-slot="sidebar-group"]');
          group.setAttribute("data-hcv-cron-native", "");
          section2 = disclosure(heading, heading, () => group.querySelector(':scope > [data-slot="sidebar-group-content"]'), "hcv-native-cron-list", motion);
        }
      }
      if (!group) return;
      section2.sync();
      const visible = new Set(group.querySelectorAll(`${nativeRows} ${nativeRowToggle}`));
      for (const [button2, row2] of rows) {
        if (visible.has(button2)) continue;
        row2.dispose();
        rows.delete(button2);
      }
      for (const button2 of visible) {
        if (!rows.has(button2)) {
          const shell = button2.parentElement;
          rows.set(button2, disclosure(button2, button2, () => shell.nextElementSibling, `hcv-native-cron-runs-${++nextId}`, motion));
        }
        rows.get(button2).sync();
      }
    },
    dispose
  };
}
function attachSidebarCron(content, storage) {
  const native = attachNativeCron(content);
  const ru = document.documentElement.matches(":lang(ru)");
  const area = element("section", { "data-hcv-cron-sidebar": "" });
  const header = element("header");
  const toggle2 = element("button", { type: "button", "aria-controls": "hcv-cron-sidebar-list" }, ru ? "Cron-\u0437\u0430\u0434\u0430\u0447\u0438" : "Cron jobs");
  toggle2.append(glyph2("right"));
  const all = element("button", { type: "button", "data-hcv-cron-manage": "" });
  const allLabel = ru ? "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438" : "Open scheduled tasks";
  all.setAttribute("aria-label", allLabel);
  all.title = allLabel;
  all.append(glyph2("schedule"));
  all.addEventListener("click", () => host3.navigate("/cron"));
  header.append(toggle2, all);
  const details = element("div", { id: "hcv-cron-sidebar-list", "data-hcv-cron-body": "" });
  const list = element("div", { "data-hcv-cron-list": "" });
  details.append(list);
  area.append(header, details);
  let open = storage.get("cron-preview-open", false) === true;
  let generation = 0;
  function updateDisclosure() {
    toggle2.setAttribute("aria-expanded", String(open));
    details.inert = !open;
    area.toggleAttribute("data-hcv-cron-open", open);
  }
  function note(text) {
    list.replaceChildren(element("p", { role: "status" }, text));
  }
  async function load() {
    if (!open || !area.isConnected) return;
    const request = ++generation;
    const profile2 = host3.state.profile.get();
    const connectionId = host3.state.connectionId.get();
    const isCurrent = () => request === generation && area.isConnected && open && profile2 === host3.state.profile.get() && connectionId === host3.state.connectionId.get();
    if (!profile2) {
      note(ru ? "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D" : "No profile selected");
      return;
    }
    note(ru ? "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" : "Loading\u2026");
    try {
      const path = `/api/cron/jobs?profile=${encodeURIComponent(profile2)}`;
      const jobs = await window.hermesDesktop.api({ ...connectionId ? { connectionId } : {}, profile: profile2, path, timeoutMs: 8e3 });
      if (!isCurrent()) return;
      const named = jobs.filter((job) => typeof job?.id === "string" && job.id).map((job) => ({ ...job, label: typeof job.name === "string" && job.name.trim() || job.id }));
      named.sort((a, b) => nextRun(a) - nextRun(b) || a.label.localeCompare(b.label));
      list.replaceChildren();
      for (const job of named.slice(0, 3)) {
        const row2 = element("button", { type: "button", title: job.label, "data-hcv-cron-job": "" });
        row2.append(glyph2("schedule"), element("span", { "data-hcv-cron-label": "" }, job.label), glyph2("right"));
        row2.addEventListener("click", () => {
          if (isCurrent() && !manageSidebarCronJob(content.querySelector(projects), job.id)) host3.navigate("/cron");
        });
        list.append(row2);
      }
      if (!named.length) note(ru ? "\u0412 \u044D\u0442\u043E\u043C \u043F\u0440\u043E\u0444\u0438\u043B\u0435 \u043D\u0435\u0442 \u0437\u0430\u0434\u0430\u0447" : "No tasks in this profile");
    } catch {
      if (isCurrent()) note(ru ? "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0438" : "Could not load tasks");
    }
  }
  toggle2.addEventListener("click", () => {
    open = !open;
    storage.set("cron-preview-open", open);
    updateDisclosure();
    if (open) void load();
    else ++generation;
  });
  updateDisclosure();
  const stopProfile = host3.state.profile.subscribe(load);
  const stopConnection = host3.state.connectionId.subscribe(load);
  const stopCron = host3.onEvent?.("cron.changed", load);
  return {
    sync() {
      native.sync();
      const tree = content.querySelector(`:scope > ${projects}`);
      if (!tree || !content.querySelector('[data-tour="sidebar-nav-cron"]')) {
        if (area.isConnected) {
          ++generation;
          area.remove();
        }
        return;
      }
      if (area.previousElementSibling !== tree) {
        tree.after(area);
        void load();
      }
    },
    dispose() {
      ++generation;
      native.dispose();
      stopProfile();
      stopConnection();
      stopCron?.();
      area.remove();
    }
  };
}
function sidebarCronStyles(active2) {
  const section2 = `${active2} [data-hcv-cron-sidebar]`;
  const stock = `${active2} ${nativeSection}`;
  const heading = `${stock} > div > button[class~="group/section-label"]`;
  const row2 = `${stock} ${nativeRows}`;
  const rowLabel = `${nativeRowToggle} > .truncate`;
  const trailing = `${row2} > [data-row-actions] > div`;
  const rowCaret = `${nativeRowToggle} > .codicon-chevron-right`;
  const caret = `${row2} ${rowCaret}`;
  const run = `${row2} + div > button`;
  return `
  ${section2} { flex: none; padding: 2px 5px 4px; }
  ${section2} > header { display: flex; align-items: center; justify-content: space-between; min-block-size: 28px; }
  ${section2} button {
    display: flex; align-items: center; gap: 6px; min-inline-size: 0; min-block-size: 26px;
    padding: 0 6px; border-radius: 7px; color: var(--hcv-muted); font: 500 12px/18px var(--hcv-ui-font);
  }
  ${section2} button:is(:hover, :focus-visible) { color: var(--hcv-text); background: var(--hcv-hover); }
  ${section2} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${section2} [data-hcv-cron-icon] { display: block; inline-size: 14px; block-size: 14px; flex: none; }
  ${section2} [aria-expanded="true"] > [data-hcv-cron-icon] { rotate: 90deg; }
  ${section2} [data-hcv-cron-manage] { inline-size: 26px; padding: 0; justify-content: center; }
  ${section2} [data-hcv-cron-body] { display: grid; grid-template-rows: 0fr; opacity: 0; }
  ${section2}[data-hcv-cron-open] [data-hcv-cron-body] { grid-template-rows: 1fr; opacity: 1; }
  ${section2} [data-hcv-cron-list] { min-block-size: 0; overflow: hidden; }
  ${section2} [data-hcv-cron-job] { inline-size: 100%; text-align: start; padding-inline: 8px; }
  ${section2} [data-hcv-cron-label] { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${section2} [data-hcv-cron-job] > [data-hcv-cron-icon="right"] { opacity: 0; }
  ${section2} [data-hcv-cron-job]:is(:hover, :focus-visible) > [data-hcv-cron-icon="right"] { opacity: 1; }
  ${section2} p { margin: 0; padding: 4px 6px; color: var(--hcv-muted); font-size: 12px; }

  ${heading} { min-block-size: 26px; padding-inline: 0 6px; gap: 6px; border-radius: 7px; }
  ${heading}:is(:hover, :focus-visible), ${row2}:is(:hover, :focus-within), ${run}:is(:hover, :focus-visible) {
    background-color: var(--hcv-hover);
    color: var(--hcv-text);
  }
  ${row2} { border-radius: 8px; }
  ${heading}:is(:hover, :focus-visible) > span, ${row2}:is(:hover, :focus-within) ${rowLabel} {
    color: var(--hcv-text);
  }
  ${row2} ${nativeRowToggle} { border-radius: inherit; }
  ${row2} ${nativeRowToggle}:focus-visible { background-color: transparent; box-shadow: none; }
  ${trailing} { display: grid; align-items: center; }
  ${trailing} > :is(span, div) { grid-area: 1 / 1; justify-self: end; }
  ${trailing} > span { display: inline; }
  ${trailing} > div { display: flex; gap: 2px; opacity: 0; pointer-events: none; }
  ${row2}:is(:hover, :focus-within) > [data-row-actions] > div > span { opacity: 0; }
  ${row2}:is(:hover, :focus-within) > [data-row-actions] > div > div { opacity: 1; pointer-events: auto; }
  ${trailing} button { inline-size: 24px; block-size: 24px; border-radius: 7px; }
  ${trailing} button:is(:hover, :focus-visible):enabled { color: var(--hcv-text); background-color: var(--hcv-hover); }
  ${stock} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${stock} :is(.codicon-chevron-right, .codicon-zap, .codicon-watch) { inline-size: 14px; block-size: 14px; }
  ${codexIconRules(`${heading} > .codicon-chevron-right, ${caret}`, "right")}
  ${codexIconRules(`${trailing} .codicon-zap`, "bolt")}
  ${codexIconRules(`${trailing} .codicon-watch`, "schedule")}
  ${heading} > .codicon-chevron-right { opacity: 1; }
  ${heading} > .codicon-chevron-right, ${caret} { rotate: 0deg; transform: none; transition: none; }
  ${heading}[aria-expanded="true"] > .codicon-chevron-right,
  ${row2} > button[aria-expanded="true"] > .codicon-chevron-right { opacity: 1; rotate: 90deg; }
  ${row2}:is(:hover, :focus-within) ${rowCaret} { opacity: 1; }
  @media (any-hover: none) {
    ${trailing} > span { opacity: 0; }
    ${trailing} > div { opacity: 1; pointer-events: auto; }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${section2} [data-hcv-cron-body] { transition: grid-template-rows ${motion.heightTime}ms ${motion.ease}, opacity 150ms ${motion.ease}; }
    ${section2} [data-hcv-cron-icon="right"] { transition: rotate 150ms var(--hcv-enter); }
    ${section2} button, ${heading}, ${row2}, ${trailing} button, ${run} {
      transition: background-color 120ms var(--hcv-ease), color 120ms var(--hcv-ease);
    }
    ${heading} > span, ${row2} ${rowLabel} { transition: color 120ms var(--hcv-ease); }
    ${section2} [data-hcv-cron-job] > [data-hcv-cron-icon="right"], ${trailing} > :is(span, div) {
      transition: opacity 120ms var(--hcv-ease);
    }
    ${heading} > .codicon-chevron-right, ${caret} { transition: rotate 150ms var(--hcv-enter), opacity 120ms var(--hcv-ease); }
  }
  `;
}

// source/chrome.js
function icon(name) {
  return h2("span", { "aria-hidden": true, "data-hcv-icon": name, style: codexIconStyle(name) });
}
var sideSelector = '[data-tour="sessions-sidebar"]';
var filterButton = "button:has(> .codicon-list-filter)";
var filterSelector = `${sideSelector} ${filterButton}`;
var flatSelector = '[data-sessions-mode="flat"]:has(button > .codicon-list-filter)';
var newChatSelector = `${sideSelector} button:has(> [data-tour="sidebar-nav-new-session"])`;
var selectedTerminal = '[data-tree-tab="terminal"][aria-selected="true"]';
var toolbarOffsetEvent = "hcv:toolbar-offset";
var russianPlurals = new Intl.PluralRules("ru");
var sidebarCopy = {
  en: {
    projects: "Projects",
    recent: "Recent",
    recentActions: "Recent chats actions",
    newChat: "New chat",
    refreshRecent: "Refresh recent chats",
    findSession: "Find a session",
    recentEmpty: "No chats",
    recentLoading: "Loading\u2026",
    recentProfile: "Open a Hermes profile",
    recentUnavailable: "Recent chats unavailable. Reopen this list.",
    recentRefreshError: "Could not refresh recent chats",
    recentOpenError: "Could not open the chat. Reopen this list.",
    untitledChat: "Untitled chat",
    projectDetails: "Project details",
    editProject: "Edit project",
    working: "Working",
    unread: "Unread chats",
    projectChats: (count) => `${count} ${count === 1 ? "chat" : "chats"}`,
    noTerminals: "No open terminals",
    terminalShortcut: "Use the New terminal shortcut to start a shell.",
    terminalUnbound: "Set a shortcut for New terminal in Keyboard shortcuts."
  },
  ru: {
    projects: "\u041F\u0440\u043E\u0435\u043A\u0442\u044B",
    recent: "\u041D\u0435\u0434\u0430\u0432\u043D\u0438\u0435",
    recentActions: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441 \u043D\u0435\u0434\u0430\u0432\u043D\u0438\u043C\u0438",
    newChat: "\u041D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442",
    refreshRecent: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043D\u0435\u0434\u0430\u0432\u043D\u0438\u0435",
    findSession: "\u041D\u0430\u0439\u0442\u0438 \u0441\u0435\u0430\u043D\u0441",
    recentEmpty: "\u041D\u0435\u0442 \u0447\u0430\u0442\u043E\u0432",
    recentLoading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026",
    recentProfile: "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043D\u0443\u0436\u043D\u044B\u0439 \u043F\u0440\u043E\u0444\u0438\u043B\u044C Hermes",
    recentUnavailable: "\u0421\u043F\u0438\u0441\u043E\u043A \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0435\u0433\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E.",
    recentRefreshError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043D\u0435\u0434\u0430\u0432\u043D\u0438\u0435 \u0447\u0430\u0442\u044B",
    recentOpenError: "\u0427\u0430\u0442 \u043D\u0435 \u043E\u0442\u043A\u0440\u044B\u043B\u0441\u044F. \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0441\u043F\u0438\u0441\u043E\u043A.",
    untitledChat: "\u0427\u0430\u0442 \u0431\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F",
    projectDetails: "\u041E \u043F\u0440\u043E\u0435\u043A\u0442\u0435",
    editProject: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442",
    working: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435",
    unread: "\u0415\u0441\u0442\u044C \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0435 \u0447\u0430\u0442\u044B",
    projectChats: (count) => `${count} ${{ one: "\u0447\u0430\u0442", few: "\u0447\u0430\u0442\u0430" }[russianPlurals.select(count)] || "\u0447\u0430\u0442\u043E\u0432"}`,
    noTerminals: "\u041D\u0435\u0442 \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0445 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u043E\u0432",
    terminalShortcut: "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u043E\u0431\u043E\u043B\u043E\u0447\u043A\u0443 \u0441\u043E\u0447\u0435\u0442\u0430\u043D\u0438\u0435\u043C \xAB\u041D\u043E\u0432\u044B\u0439 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B\xBB.",
    terminalUnbound: "\u0417\u0430\u0434\u0430\u0439\u0442\u0435 \u0441\u043E\u0447\u0435\u0442\u0430\u043D\u0438\u0435 \xAB\u041D\u043E\u0432\u044B\u0439 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B\xBB \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u043A\u043B\u0430\u0432\u0438\u0430\u0442\u0443\u0440\u044B."
  }
};
function visibleControl(selector) {
  return [...document.querySelectorAll(selector)].find(
    (control) => !control.disabled && !control.closest("[inert], [hidden]") && control.getClientRects().length && getComputedStyle(control).visibility === "visible"
  );
}
function newChat() {
  const native = visibleControl(newChatSelector);
  if (native) native.click();
  else host4.newChat();
}
function openGrouping() {
  const trigger = visibleControl(filterSelector);
  if (!trigger) return;
  trigger.focus({ preventScroll: true });
  trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}
function edit(command) {
  const input = visibleControl('[data-chat-surface][data-composer-target="main"] [data-slot="composer-rich-input"]');
  if (!input) return;
  input.focus();
  if (command === "selectAll") document.execCommand(command);
  else input.dispatchEvent(new KeyboardEvent("keydown", {
    key: "z",
    code: "KeyZ",
    ctrlKey: true,
    shiftKey: command === "redo",
    bubbles: true,
    cancelable: true
  }));
}
function WindowMenus({ menus: menus2 }) {
  const [current, setCurrent] = useState(null);
  const leaveTimer = useRef(0);
  const keepOpen = () => clearTimeout(leaveTimer.current);
  useEffect(() => {
    const wide = window.matchMedia("(forced-colors: none) and (min-width: 800px) and (min-height: 480px)");
    const dismiss = () => {
      keepOpen();
      setCurrent(null);
    };
    wide.addEventListener("change", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      keepOpen();
      wide.removeEventListener("change", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, []);
  function leave(event, label) {
    if (event.pointerType !== "mouse") return;
    keepOpen();
    leaveTimer.current = setTimeout(() => {
      setCurrent((previous) => previous?.label === label && previous.preview ? null : previous);
    }, 160);
  }
  return h2("nav", { "aria-label": "\u041C\u0435\u043D\u044E \u043E\u043A\u043D\u0430", "data-hcv-window-menu": "" }, menus2.map(([label, items2]) => {
    const open = current?.label === label;
    const preview = open && current.preview;
    const change = (next) => {
      keepOpen();
      setCurrent((previous) => next ? { label, preview: false } : previous?.label === label ? null : previous);
    };
    const engage = (event) => {
      event.preventDefault();
      change(true);
      document.getElementById(event.currentTarget.getAttribute("aria-controls"))?.focus({ preventScroll: true });
    };
    return h2(
      DropdownMenu,
      { key: label, modal: false, open, onOpenChange: change },
      h2(DropdownMenuTrigger, { asChild: true }, h2("button", {
        type: "button",
        "data-hcv-menu-button": "",
        onPointerEnter: (event) => {
          if (event.pointerType !== "mouse" || event.buttons) return;
          keepOpen();
          setCurrent((previous) => previous?.label === label ? previous : { label, preview: true });
        },
        onPointerLeave: (event) => leave(event, label),
        onPointerDown: (event) => {
          if (preview && event.button === 0 && !event.ctrlKey) engage(event);
        },
        onKeyDown: (event) => {
          if (preview && ["Enter", " ", "ArrowDown"].includes(event.key)) engage(event);
        },
        onClick: (event) => {
          if (event.detail === 0) change(!open || preview);
        }
      }, label)),
      // Unmount the previous popup immediately when moving between triggers.
      open && h2(DropdownMenuContent, {
        align: "start",
        "data-hcv-window-menu-content": "",
        onPointerEnter: keepOpen,
        onPointerLeave: (event) => leave(event, label),
        onOpenAutoFocus: (event) => {
          if (preview) event.preventDefault();
        },
        onCloseAutoFocus: (event) => {
          if (preview || document.querySelector('[data-hcv-menu-button][aria-expanded="true"]')) event.preventDefault();
        },
        onInteractOutside: (event) => {
          if (event.target.closest?.("[data-hcv-menu-button]")) event.preventDefault();
        }
      }, items2.map(([title, run, disabled]) => h2(DropdownMenuItem, {
        key: title,
        disabled: typeof disabled === "function" ? disabled() : disabled,
        // Mouse preview leaves the typing focus where it was.
        onPointerMove: (event) => {
          if (preview && event.pointerType === "mouse") event.preventDefault();
        },
        onPointerLeave: (event) => {
          if (preview && event.pointerType === "mouse") event.preventDefault();
        },
        onSelect: () => setTimeout(run, 0)
      }, title)))
    );
  }));
}
function WindowChrome({ themeName: themeName2, recentRows }) {
  const selected = useTheme().themeName === themeName2;
  const [historyState, setHistoryState] = useState({ back: false, forward: false });
  useEffect(() => {
    if (!selected || !window.navigation) return;
    const update = () => setHistoryState({ back: window.navigation.canGoBack, forward: window.navigation.canGoForward });
    update();
    window.navigation.addEventListener("currententrychange", update);
    return () => window.navigation.removeEventListener("currententrychange", update);
  }, [selected]);
  if (!selected) return null;
  const menus2 = [
    ["\u0424\u0430\u0439\u043B", [["\u041D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442", newChat], ["\u0424\u0430\u0439\u043B\u044B \u043F\u0440\u043E\u0435\u043A\u0442\u0430", () => host4.revealPane("files")], ["\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438", () => host4.navigate("/settings")]]],
    ["\u041F\u0440\u0430\u0432\u043A\u0430", [["\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0432\u0432\u043E\u0434", () => edit("undo")], ["\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C \u0432\u0432\u043E\u0434", () => edit("redo")], ["\u0412\u044B\u0434\u0435\u043B\u0438\u0442\u044C \u0442\u0435\u043A\u0441\u0442 \u0432\u0432\u043E\u0434\u0430", () => edit("selectAll")]]],
    ["\u0412\u0438\u0434", [
      ["\u0421\u0435\u0430\u043D\u0441\u044B", () => host4.revealPane("sessions")],
      ["\u0411\u043E\u0442\u044B", () => host4.revealPane("hermes-bots:pane")],
      ["\u0413\u0440\u0443\u043F\u043F\u0438\u0440\u043E\u0432\u043A\u0430 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432 \u0438 \u0447\u0430\u0442\u043E\u0432", openGrouping, () => !visibleControl(filterSelector)],
      ["\u041F\u0440\u0430\u0432\u0430\u044F \u043F\u0430\u043D\u0435\u043B\u044C", () => visibleControl('[data-tour="right-pane-toggle"]')?.click()]
    ]],
    ["\u0421\u043F\u0440\u0430\u0432\u043A\u0430", [["\u041E \u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0435", () => host4.navigate("/settings?tab=about")]]]
  ];
  return h2(
    Fragment,
    null,
    h2(
      "div",
      { "data-hcv-history": "" },
      h2("button", { type: "button", "aria-label": "\u041D\u0430\u0437\u0430\u0434", title: "\u041D\u0430\u0437\u0430\u0434", disabled: !historyState.back, onClick: () => history.back() }, icon("back")),
      h2("button", { type: "button", "aria-label": "\u0412\u043F\u0435\u0440\u0451\u0434", title: "\u0412\u043F\u0435\u0440\u0451\u0434", disabled: !historyState.forward, onClick: () => history.forward() }, icon("forward"))
    ),
    h2(WindowMenus, { menus: menus2 }),
    h2(NativeRecentRows, { rows: recentRows })
  );
}
function element2(tag, attrs = {}, text) {
  const node2 = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node2.setAttribute(key, value);
  if (text) node2.textContent = text;
  return node2;
}
function appendIcon(node2, name) {
  const glyph3 = element2("span", { "aria-hidden": "true", "data-hcv-icon": name });
  Object.assign(glyph3.style, codexIconStyle(name));
  node2.append(glyph3);
}
function sidebarButton(label, symbol, onClick) {
  const button2 = element2("button", { type: "button", "aria-label": label, title: label });
  appendIcon(button2, symbol);
  if (onClick) button2.addEventListener("click", onClick);
  return button2;
}
function recentsControl(groupId, rows, t) {
  const area = element2("div", { "data-hcv-recents": "" });
  const id2 = `hcv-recents-${groupId}`;
  const body = element2("div", { id: id2, "data-hcv-recents-body": "" });
  const list = element2("div", { "data-hcv-recents-list": "" });
  const fallback = element2("div", { "data-hcv-recents-fallback": "", hidden: "" });
  body.append(list, fallback);
  body.inert = true;
  const button2 = element2("button", { type: "button", "aria-expanded": "false", "aria-controls": id2 });
  const label = document.createTextNode("");
  button2.dataset.hcvRecentsToggle = "";
  button2.append(label);
  appendIcon(button2, "sidebarDisclosure");
  const header = element2("div", { "data-hcv-recents-header": "" });
  const actions = element2("div", { "data-hcv-recents-actions": "" });
  const popup = element2("div", { popover: "auto", "data-hcv-recents-menu": "" });
  const more = sidebarButton(t("recentActions"), "more", () => {
    const rect = more.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(window.innerWidth - 218, rect.left))}px`;
    popup.style.top = `${Math.max(8, rect.bottom + 84 < window.innerHeight ? rect.bottom + 4 : rect.top - 84)}px`;
  });
  more.popoverTargetElement = popup;
  more.setAttribute("aria-expanded", "false");
  popup.addEventListener("toggle", (event) => more.setAttribute("aria-expanded", String(event.newState === "open")));
  const add = sidebarButton(t("newChat"), "newChat", newChat);
  const refresh = element2("button", { type: "button", autofocus: "" });
  const all = element2("button", { type: "button" });
  function localize() {
    label.data = t("recent");
    more.title = t("recentActions");
    more.setAttribute("aria-label", more.title);
    add.title = t("newChat");
    add.setAttribute("aria-label", add.title);
    refresh.textContent = t("refreshRecent");
    all.textContent = t("findSession");
  }
  const dismiss = () => {
    if (popup.matches(":popover-open")) popup.hidePopover();
  };
  refresh.addEventListener("click", () => {
    dismiss();
    const source = rows.get();
    if (source?.container === list && source.refresh) {
      void Promise.resolve().then(source.refresh).catch((error) => host4.notifyError(error, t("recentRefreshError")));
    } else void show();
  });
  all.addEventListener("click", () => {
    dismiss();
    host4.navigate("/command-center?section=sessions");
  });
  popup.append(refresh, all);
  actions.append(more, add);
  header.append(button2, actions);
  let generation = 0;
  let nativeUpdates;
  const close = () => {
    ++generation;
    clearInterval(nativeUpdates);
    area.removeAttribute("data-hcv-recents-open");
    body.inert = true;
    fallback.removeAttribute("aria-busy");
    button2.setAttribute("aria-expanded", "false");
    dismiss();
  };
  const reset = () => {
    close();
    rows.clear(list);
  };
  async function show() {
    if (!area.isConnected) return;
    const request = ++generation;
    clearInterval(nativeUpdates);
    area.setAttribute("data-hcv-recents-open", "");
    body.inert = false;
    button2.setAttribute("aria-expanded", "true");
    const update = () => rows.update(area.parentElement, list, t("recentEmpty"));
    if (update()) {
      list.hidden = false;
      fallback.hidden = true;
      nativeUpdates = setInterval(() => {
        if (!update()) void show();
      }, 400);
      return;
    }
    rows.clear(list);
    list.hidden = true;
    fallback.hidden = false;
    fallback.textContent = t("recentLoading");
    fallback.setAttribute("aria-busy", "true");
    const profile2 = host4.state.profile.get();
    const connection = host4.state.connectionId.get();
    const current = () => request === generation && fallback.isConnected && host4.state.profile.get() === profile2 && host4.state.connectionId.get() === connection;
    try {
      if (!profile2 || !connection) {
        fallback.textContent = t("recentProfile");
        return;
      }
      const query = new URLSearchParams({ recents_profile: profile2, recents_limit: "12", recents_exclude: "cron,tool", cron_limit: "1", messaging_limit: "1" });
      const result = await window.hermesDesktop.api({ connectionId: connection, path: `/api/profiles/sessions/sidebar?${query}`, timeoutMs: 8e3 });
      if (!current()) return;
      fallback.textContent = "";
      for (const session of (result.recents?.sessions ?? []).filter((session2) => session2.id && !session2.pinned).slice(0, 12)) {
        const title = session.title?.trim() || t("untitledChat");
        const row2 = element2("button", { type: "button", title }, title);
        row2.addEventListener("click", async () => {
          if (!current()) return;
          try {
            await host4.openSession(session.id);
          } catch {
            if (current()) fallback.textContent = t("recentOpenError");
          }
        });
        fallback.append(row2);
      }
      if (!fallback.childElementCount) fallback.textContent = t("recentEmpty");
    } catch {
      if (current()) fallback.textContent = t("recentUnavailable");
    } finally {
      if (current()) fallback.removeAttribute("aria-busy");
    }
  }
  button2.addEventListener("click", () => {
    if (area.hasAttribute("data-hcv-recents-open")) close();
    else void show();
  });
  area.append(header, body, popup);
  return {
    area,
    localize,
    reset,
    show,
    remove() {
      reset();
      area.remove();
    }
  };
}
function sidebarMenuBehavior(content) {
  const triggerSelector = '[data-sessions-mode] :is([class~="group/workspace"], .row-hover) [data-row-actions] button[aria-haspopup="menu"][aria-expanded="true"][aria-controls]';
  let open;
  let returnFocus;
  function clear() {
    open?.menu.removeAttribute("data-hcv-sidebar-menu");
    open?.menu.style.removeProperty("--hcv-sidebar-menu-shift");
    open?.menu.style.removeProperty("--hcv-sidebar-menu-origin");
    open = void 0;
  }
  function handleEscape(event) {
    if (event.key === "Escape" && open?.menu.contains(event.target)) returnFocus = open;
  }
  document.addEventListener("keydown", handleEscape, true);
  return {
    sync() {
      if (returnFocus && !returnFocus.menu.isConnected) {
        const { trigger: trigger2 } = returnFocus;
        returnFocus = void 0;
        if (trigger2.isConnected && document.activeElement === document.body) trigger2.focus({ preventScroll: true });
      }
      const trigger = content.querySelector(triggerSelector);
      const menu = trigger && document.getElementById(trigger.getAttribute("aria-controls"));
      const wrapper = menu?.closest("[data-radix-popper-content-wrapper]");
      if (!wrapper || !menu.matches('[data-slot="dropdown-menu-content"][data-state="open"]')) {
        if (open && !open.menu.isConnected) clear();
        return;
      }
      if (open?.menu !== menu) {
        clear();
        open = { menu, trigger };
        menu.setAttribute("data-hcv-sidebar-menu", "");
      }
      const rect = trigger.getBoundingClientRect();
      const base = wrapper.getBoundingClientRect();
      const width = menu.offsetWidth;
      const center = rect.left + rect.width / 2;
      const left = Math.max(8, Math.min(
        window.innerWidth - width - 8,
        center < window.innerWidth / 2 ? rect.left : rect.right - width
      ));
      const origin = Math.max(0, Math.min(width, center - left));
      menu.style.setProperty("--hcv-sidebar-menu-shift", `${left - base.left}px`);
      menu.style.setProperty("--hcv-sidebar-menu-origin", `${origin}px ${menu.dataset.side === "top" ? "bottom" : "top"}`);
    },
    dispose() {
      document.removeEventListener("keydown", handleEscape, true);
      returnFocus = void 0;
      clear();
    }
  };
}
function newTerminalShortcut() {
  let binding;
  try {
    binding = JSON.parse(localStorage.getItem("hermes.desktop.keybinds"))?.["view.newTerminal"];
  } catch {
  }
  const combo = Array.isArray(binding) ? binding.find((value) => typeof value === "string") : "ctrl+shift+`";
  const mod = /Mac/.test(navigator.platform) ? "\u2318" : "Ctrl";
  const labels10 = { ctrl: "Ctrl", mod, meta: mod, alt: "Alt", shift: "Shift" };
  return combo?.split("+").map((key) => labels10[key] || key.toUpperCase()).join(" + ");
}
function attachSidebarHeader(group, t) {
  const bar = element2("header", { "data-hcv-sidebar-bar": "" });
  const search = sidebarButton("\u041F\u043E\u0438\u0441\u043A \u0447\u0430\u0442\u043E\u0432", "search");
  const bell = sidebarButton("\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F", "bell", () => host4.navigate("/settings?tab=notifications"));
  search.dataset.hcvSearchToggle = "";
  bell.dataset.hcvNotifications = "";
  search.setAttribute("aria-expanded", "false");
  bar.append(element2("span", { "data-hcv-brand": "" }, "Hermes"), bell, search);
  group.setAttribute("data-hcv-sidebar-shell", "");
  let terminalEmpty;
  function syncTerminal() {
    const surface2 = group.querySelector(`:scope > [data-panel-header] ${selectedTerminal}`) && document.querySelector("[data-persistent-terminal]:not(:has(> [data-terminal]))");
    if (!surface2) {
      terminalEmpty?.remove();
      return;
    }
    if (!terminalEmpty) {
      terminalEmpty = element2("div", { "data-hcv-terminal-empty": "" });
      terminalEmpty.append(element2("p"), element2("p"), element2("kbd"));
    }
    const shortcut = newTerminalShortcut();
    const [title, description, keys] = terminalEmpty.children;
    const copy6 = [t("noTerminals"), t(shortcut ? "terminalShortcut" : "terminalUnbound"), shortcut || ""];
    for (const [index, node2] of [title, description, keys].entries()) {
      if (node2.textContent !== copy6[index]) node2.textContent = copy6[index];
    }
    if (terminalEmpty.parentElement !== surface2) surface2.append(terminalEmpty);
  }
  return {
    group,
    search,
    sync(content) {
      const parent = group.querySelector(":scope > [data-panel-header]") || content;
      if (parent && bar.parentElement !== parent) parent.prepend(bar);
      if (search.hidden !== !content) search.hidden = !content;
      syncTerminal();
    },
    remove() {
      bar.remove();
      terminalEmpty?.remove();
      group.removeAttribute("data-hcv-sidebar-shell");
    }
  };
}
function flatRecents(recentRows, t) {
  let flatHeader;
  let previousFlatLabel;
  const flatList = element2("div", { "data-hcv-flat-list": "" });
  function localizeFlatHeader() {
    if (!flatHeader) return;
    const label = t("recent");
    flatHeader.setAttribute("data-hcv-flat-recent", label);
    flatHeader.setAttribute("aria-label", label);
  }
  function updateFlatHeader(next) {
    if (flatHeader === next) return;
    if (flatHeader) {
      flatHeader.removeAttribute("data-hcv-flat-recent");
      if (previousFlatLabel === null) flatHeader.removeAttribute("aria-label");
      else flatHeader.setAttribute("aria-label", previousFlatLabel);
    }
    flatHeader = next;
    if (flatHeader) {
      previousFlatLabel = flatHeader.getAttribute("aria-label");
      localizeFlatHeader();
    }
  }
  function syncFlatList(flat) {
    const nativeFlat = flat && recentRows.update(flat, flatList);
    if (nativeFlat) {
      if (flatList.nextElementSibling !== nativeFlat) nativeFlat.before(flatList);
    } else {
      recentRows.clear(flatList);
      flatList.remove();
    }
    const root = nativeFlat && flatList.firstElementChild ? flatList : flat;
    updateFlatHeader(root?.querySelector(':scope > [data-slot="sidebar-group"] > :first-child:has(button > .codicon-list-filter) > button'));
  }
  return { sync: syncFlatList, localize: localizeFlatHeader };
}
function attachSidebar(content, group, recentRows, t, { search }) {
  let searchField;
  let searchOpen = false;
  let chooseGrouping;
  let projectRequest;
  const searchFieldId = `hcv-search-${group.dataset.treeGroup}`;
  const toggleSearch = () => {
    if (searchOpen) closeSearch(true);
    else openSearch();
  };
  search.addEventListener("click", toggleSearch);
  const recent = recentsControl(group.dataset.treeGroup, recentRows, t);
  const sidebarMenu = sidebarMenuBehavior(content);
  const projectsLabel = document.createTextNode("");
  const projectsButton = element2("button", {
    type: "button",
    "data-hcv-show-projects": "",
    "aria-expanded": "false"
  });
  projectsButton.append(projectsLabel);
  appendIcon(projectsButton, "sidebarDisclosure");
  function localize() {
    recent.localize();
    projectsLabel.data = t("projects");
  }
  localize();
  projectsButton.addEventListener("click", () => {
    if (!chooseGrouping || projectRequest) return;
    const recentGroup = projectsButton.parentElement?.querySelector("[data-hcv-flat-recent]")?.closest('[data-slot="sidebar-group"]');
    projectRequest = {
      keepRecentOpen: Boolean(recentGroup?.querySelector(':scope > [data-slot="sidebar-group-content"]')),
      restoreFocus: document.activeElement === projectsButton
    };
    chooseGrouping("project");
  });
  const reset = () => {
    projectRequest = void 0;
    recent.reset();
  };
  const stopProfile = host4.state.profile.subscribe(reset);
  const stopConnection = host4.state.connectionId.subscribe(reset);
  function showSearch(open) {
    searchOpen = open && Boolean(searchField);
    searchField?.toggleAttribute("data-hcv-search-open", searchOpen);
    search.setAttribute("aria-expanded", String(searchOpen));
  }
  function openSearch() {
    showSearch(true);
    searchField?.querySelector("input")?.focus({ preventScroll: true });
  }
  function closeSearch(restoreFocus) {
    const clear = searchField?.querySelector("button:has(.codicon-close)");
    const input = searchField?.querySelector("input");
    if (clear) clear.click();
    else if (input?.value) {
      const { set } = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      set.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    showSearch(false);
    if (restoreFocus) search.focus({ preventScroll: true });
  }
  function clearSearchField() {
    searchField?.removeAttribute("data-hcv-search-field");
    searchField?.removeAttribute("data-hcv-search-open");
    if (searchField?.id === searchFieldId) searchField.removeAttribute("id");
    search.removeAttribute("aria-controls");
  }
  function onSearchKey(event) {
    if (!searchOpen || event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    closeSearch(true);
  }
  function onSearchResult(event) {
    if (!searchOpen || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!event.target.closest?.('[data-sessions-mode="search"] button[data-slot="row-button"]')) return;
    queueMicrotask(() => {
      if (!event.defaultPrevented) closeSearch(false);
    });
  }
  function onOutsidePress(event) {
    if (searchOpen && !group.contains(event.target)) closeSearch(false);
  }
  content.addEventListener("click", onSearchResult);
  group.addEventListener("keydown", onSearchKey, true);
  document.addEventListener("pointerdown", onOutsidePress, true);
  window.addEventListener("hermes:focus-session-search", openSearch, true);
  return {
    content,
    group,
    localize,
    sync(flat) {
      const input = content.querySelector(':scope > div > div > input[type="text"][placeholder]');
      const field = input?.parentElement?.parentElement;
      if (field !== searchField) {
        clearSearchField();
        searchField = field;
        if (field) {
          field.setAttribute("data-hcv-search-field", "");
          if (!field.id) field.id = searchFieldId;
          search.setAttribute("aria-controls", field.id);
        }
        showSearch(searchOpen || input === document.activeElement || Boolean(input?.value));
      }
      search.disabled = !searchField;
      const tree = content.querySelector('[data-sessions-mode="projects"]');
      if (tree && recent.area.parentElement !== tree) {
        recent.reset();
        tree.append(recent.area);
      } else if (!tree && recent.area.isConnected) recent.remove();
      chooseGrouping = flat && projectGroupingAction(flat.querySelector(filterButton));
      if (chooseGrouping && projectsButton.parentElement !== flat) flat.prepend(projectsButton);
      else if (!chooseGrouping) projectsButton.remove();
      const projectsToggle = tree?.querySelector("[data-hcv-projects-header] [data-hcv-section-toggle]");
      if (projectRequest && projectsToggle) {
        const { keepRecentOpen, restoreFocus } = projectRequest;
        projectRequest = void 0;
        if (projectsToggle.getAttribute("aria-expanded") === "false") projectsToggle.click();
        if (keepRecentOpen) void recent.show();
        if (restoreFocus) projectsToggle.focus({ preventScroll: true });
      } else if (!tree && !flat) {
        projectRequest = void 0;
      }
      sidebarMenu.sync();
    },
    remove() {
      search.removeEventListener("click", toggleSearch);
      search.setAttribute("aria-expanded", "false");
      clearSearchField();
      content.removeEventListener("click", onSearchResult);
      group.removeEventListener("keydown", onSearchKey, true);
      document.removeEventListener("pointerdown", onOutsidePress, true);
      window.removeEventListener("hermes:focus-session-search", openSearch, true);
      stopProfile();
      stopConnection();
      recent.remove();
      projectsButton.remove();
      sidebarMenu.dispose();
    }
  };
}
function registerSidebar(ctx, active2, recentRows) {
  const wide = window.matchMedia("(forced-colors: none) and (min-width: 800px) and (min-height: 480px)");
  const contrast = window.matchMedia("(forced-colors: none)");
  const flatList = flatRecents(recentRows, ctx.i18n.t);
  let projects2;
  let cron;
  let projectContent;
  let mounted;
  let header;
  let anchors = [];
  let queued;
  const setToolbarOffset = (value) => {
    const property = "--hcv-sidebar-right-offset";
    const style = document.documentElement.style;
    const offset = value > 0 ? `${value}px` : "";
    if (style.getPropertyValue(property) === offset) return;
    if (offset) style.setProperty(property, offset);
    else style.removeProperty(property);
    window.dispatchEvent(new Event(toolbarOffsetEvent));
  };
  const sync = () => {
    queued = void 0;
    const enabled = contrast.matches && document.documentElement.matches(active2);
    const sidebar2 = enabled ? [...document.querySelectorAll(`${sideSelector} > [data-slot="sidebar-content"]`)].find(
      (node2) => !node2.closest("[data-pane-hidden], [hidden]") && node2.getClientRects().length
    ) : null;
    if (projectContent !== sidebar2) {
      projects2?.dispose();
      cron?.dispose();
      projectContent = sidebar2;
      projects2 = sidebar2 ? attachProjects(sidebar2, ctx.i18n.t, ctx.storage) : void 0;
      cron = sidebar2 ? attachSidebarCron(sidebar2, ctx.storage) : void 0;
    }
    projects2?.sync();
    cron?.sync();
    const content = wide.matches ? sidebar2 : null;
    const group = enabled && wide.matches ? content?.closest("[data-tree-group]") ?? document.querySelector('[data-tree-tab="sessions"]')?.closest("[data-tree-group]") ?? document.querySelector('[data-tree-group="grp-sessions"][data-window-top]:not([data-pane-host])') : null;
    const compatible = group?.clientWidth >= 190 && (content || group.querySelector(":scope > [data-panel-header]"));
    const workspace = group && document.querySelector('[data-tree-group="grp-main"][data-window-top]');
    const targets = [...new Set([content, group, workspace].filter(Boolean))];
    if (targets.length !== anchors.length || targets.some((node2, index) => node2 !== anchors[index])) {
      resize.disconnect();
      for (const node2 of targets) resize.observe(node2);
      anchors = targets;
    }
    const railBox = group?.getBoundingClientRect();
    const workspaceBox = workspace?.getBoundingClientRect();
    const rightRail = railBox?.width > 0 && workspaceBox?.width > 0 && railBox.left >= workspaceBox.right - 2;
    setToolbarOffset(rightRail ? Math.max(0, window.innerWidth - workspaceBox.right) : 0);
    if (mounted && (mounted.content !== content || mounted.group !== group || !compatible)) {
      mounted.remove();
      mounted = void 0;
    }
    if (header && (header.group !== group || !compatible)) {
      header.remove();
      header = void 0;
    }
    if (compatible && !header) header = attachSidebarHeader(group, ctx.i18n.t);
    header?.sync(content);
    if (header && content && !mounted) mounted = attachSidebar(content, group, recentRows, ctx.i18n.t, header);
    const flat = sidebar2?.querySelector(flatSelector);
    mounted?.sync(flat);
    flatList.sync(flat);
  };
  const schedule = () => {
    if (queued === void 0) queued = requestAnimationFrame(sync);
  };
  const stopBusy = host4.state.busyBySession.listen(schedule);
  ctx.i18n.onLocaleChange(() => {
    mounted?.localize();
    flatList.localize();
    schedule();
  });
  const resize = new ResizeObserver(schedule);
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-hermes-theme", "data-hermes-codex-visual", "aria-expanded", "aria-selected", "data-sessions-mode", "data-sessions-project", "data-working", "data-side", "inert", "hidden", "data-pane-hidden"],
    childList: true,
    subtree: true
  });
  wide.addEventListener("change", schedule);
  contrast.addEventListener("change", schedule);
  window.addEventListener("resize", schedule);
  ctx.onDispose(() => {
    stopBusy();
    observer.disconnect();
    resize.disconnect();
    wide.removeEventListener("change", schedule);
    contrast.removeEventListener("change", schedule);
    window.removeEventListener("resize", schedule);
    setToolbarOffset(0);
    if (queued !== void 0) cancelAnimationFrame(queued);
    mounted?.remove();
    flatList.sync(void 0);
    header?.remove();
    projects2?.dispose();
    cron?.dispose();
  });
  schedule();
}
function registerWorkspaceChrome(ctx, themeName2) {
  ctx.i18n.register(sidebarCopy);
  const active2 = `html[data-hermes-codex-visual][data-hermes-theme="${themeName2}"]`;
  const shell = `${active2}:has([data-hcv-window-menu])`;
  const side = `${shell} [data-hcv-sidebar-shell]`;
  const sidebarStrip = `${active2} :is([data-hcv-sidebar-shell] > [data-panel-header] [data-zone-tabstrip], [data-zone-tabstrip="grp-sessions"])`;
  const sidebarTab = `${sidebarStrip} > [role="tablist"] > [role="tab"]:has(> .pane-tab-content)`;
  const sidebarTerminal = `${active2}:has([data-hcv-sidebar-shell] > [data-panel-header] ${selectedTerminal}) [data-persistent-terminal]`;
  const sidebarRow = `${active2} ${sideSelector} [data-sessions-mode] .row-hover:not([class~="group/workspace"])`;
  const flat = `${active2} ${sideSelector} [data-sessions-mode="flat"]`;
  const rowMore = '[data-row-actions] > button[aria-haspopup="menu"]:has(> .codicon-kebab-vertical)';
  const recentsButton = "[data-hcv-recents-actions] button, [data-hcv-recents-menu] button, [data-hcv-recents-fallback] button";
  const recentToggle = "[data-hcv-recents-toggle]";
  const caret = '[data-hcv-icon="sidebarDisclosure"]';
  const flatRecent = "[data-hcv-flat-recent]";
  const flatCaret = `${flatRecent} > .codicon-chevron-right`;
  const flatGroup = `${flat} [data-slot="sidebar-group"]`;
  const flatOpenGroup = `${flatGroup}:has(> [data-slot="sidebar-group-content"])`;
  const neutralHeadings = `${side} :is([data-hcv-recents-toggle], [data-hcv-show-projects], [data-hcv-flat-recent])`;
  const chromeButton = `${shell} :is([data-hcv-history] button, [data-hcv-menu-button], [data-hcv-sidebar-bar] button, ${recentsButton})`;
  const recentRows = createRecentRows();
  const stylesheet = element2("style", { "data-hcv-chrome-styles": "" });
  stylesheet.textContent = `
@media (forced-colors: none) {
  ${active2} {
    --hcv-sidebar-heading: light-dark(color-mix(in oklab, var(--hcv-text) 50%, transparent), rgb(255 255 255 / 50%));
  }
  ${projectSidebarStyles(active2)}
  ${sidebarCronStyles(active2)}
  ${flat} [data-hcv-flat-list] { display: contents; }
  ${flat} [data-hcv-flat-list]:has(> [data-slot="sidebar-group"]) + [data-slot="sidebar-group"] { display: none; }
  ${flat} ${flatRecent} { flex: 1 1 0; align-self: stretch; }
  ${codexIconRules(`${flat} ${flatCaret}`, "sidebarDisclosure")}
  ${flat} ${flatCaret} { rotate: -90deg; opacity: 1; }
  ${flatOpenGroup} ${flatCaret} { rotate: none; opacity: 0; }
  ${flatOpenGroup}:hover ${flatCaret}, ${flatOpenGroup} ${flatRecent}:focus-visible > .codicon-chevron-right { opacity: 1; }
  ${flat} [data-hcv-flat-recent] > span:has(> .dither) { display: none; }
  ${flat} [data-hcv-flat-recent]::before {
    content: attr(data-hcv-flat-recent);
    padding-inline-start: 8px;
    font: 500 13px/18px var(--hcv-ui-font);
  }
  ${sidebarStrip} > [role="tablist"] { gap: 2px; align-items: center; }
  ${sidebarStrip} > button { margin-inline: 1px; }
  ${sidebarTab} {
    block-size: 28px;
    min-block-size: 28px;
    max-block-size: 28px;
    margin-inline: 0;
    padding-inline: 7px;
  }
  ${sidebarTab} > .pane-tab-content,
  ${sidebarTab} > .pane-tab-content > :has(> .truncate) { margin-inline: 0; padding-inline: 0; }
  ${sidebarTab} .pane-tab-content .truncate { font-size: 12px; line-height: 16px; }
  ${sidebarTab}[data-closeable] { --pane-tab-close-width: 16px; padding-inline-end: 17px; }
  ${sidebarTab}[data-closeable]:hover > .pane-tab-content { mask-image: none; }
  ${sidebarTerminal} > [data-terminal] { padding-block-start: 8px; padding-inline-start: 10px; }
  ${sidebarTerminal} > [data-hcv-terminal-empty] {
    display: grid;
    justify-items: start;
    gap: 6px;
    padding: 12px 14px;
    color: var(--hcv-muted);
    font: 400 12px/18px var(--hcv-ui-font);
  }
  ${sidebarTerminal} > [data-hcv-terminal-empty] > p:first-child { color: var(--hcv-text); font-weight: 600; }
  ${sidebarTerminal} > [data-hcv-terminal-empty] kbd {
    padding-inline: 5px;
    border-radius: 5px;
    background: var(--hcv-hover);
    color: var(--hcv-text);
  }
  ${sidebarTerminal} > [data-hcv-terminal-empty] kbd:empty,
  ${sidebarTerminal}:has(> [data-terminal]) > [data-hcv-terminal-empty] { display: none; }
  ${sidebarRow} ${rowMore} {
    inline-size: 24px;
    block-size: 24px;
    border-radius: 7px;
    color: var(--hcv-muted);
    opacity: 0;
    pointer-events: none;
  }
  ${sidebarRow}:is(:hover, :focus-within) ${rowMore},
  ${sidebarRow} ${rowMore}:is(:focus-visible, [aria-expanded="true"]) { opacity: 1; pointer-events: auto; }
  ${sidebarRow} ${rowMore}:is(:hover, :focus-visible, [aria-expanded="true"]) {
    color: var(--hcv-text);
    background: var(--hcv-hover);
  }
  ${sidebarRow} ${rowMore}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  @media (any-hover: none) {
    ${sidebarRow} ${rowMore} { opacity: 1; pointer-events: auto; }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${sidebarRow} ${rowMore} { transition: opacity 120ms var(--hcv-ease), color 120ms var(--hcv-ease), background-color 120ms var(--hcv-ease); }
  }
}
@media (forced-colors: none) and (min-width: 800px) and (min-height: 480px) {
  ${shell} [data-tree-split="spl-root"] { padding-block-start: 39px; }
  ${shell} [data-titlebar-cluster="left"] {
    inset-inline-start: 5px;
    inset-block-start: 5px;
    gap: 4px;
  }
  ${shell} [data-titlebar-cluster="right"] {
    inset-block-start: 51px;
    right: calc(13px + var(--hcv-sidebar-right-offset, 0px));
  }
  ${shell} :is([data-hcv-history], [data-hcv-window-menu]) { display: flex; align-items: center; gap: 3px; }
  ${shell} [data-hcv-history] { order: -1; }
  ${chromeButton} {
    display: flex;
    align-items: center;
    color: var(--hcv-muted);
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  ${shell} :is([data-hcv-history] button, [data-hcv-sidebar-bar] button) {
    inline-size: 28px;
    block-size: 28px;
    justify-content: center;
  }
  ${shell} [data-hcv-icon] { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; }
  ${shell} [data-hcv-menu-button] { block-size: 28px; padding-inline: 8px; font-size: 13px; }
  ${shell} [data-hcv-window-menu-content][data-state] { animation: none; }
  ${chromeButton}:not(:disabled, [data-hcv-recents-menu] button):is(:hover, :focus-visible, [data-state="open"]) {
    color: var(--hcv-text);
    background: var(--hcv-hover);
  }
  ${shell} [data-hcv-history] button:disabled { opacity: .32; cursor: default; }

  ${shell} [data-tree-group="grp-main"][data-window-top] > [data-panel-header]:has([data-zone-tabstrip]) {
    block-size: 48px !important;
    align-items: center;
    background: var(--hcv-chat);
    padding-inline: 20px 168px;
  }
  ${shell} [data-tree-group="grp-main"] > [data-panel-header]:has([data-zone-tabstrip]) > [style*="--panel-titlebar-left"] {
    inline-size: 0 !important;
  }
  ${shell} [data-tree-group="grp-main"] [data-zone-tabstrip] {
    position: static;
    background: transparent;
    box-shadow: none;
    border: 0;
  }
  ${shell} [data-tree-tab="workspace"] { font-size: 13px; text-transform: none; box-shadow: none; background: transparent; }
  ${shell} [data-tree-tab="workspace"] :is(span, .truncate) { font-size: 13px; font-weight: 600; letter-spacing: normal; text-transform: none; }
  ${shell} [data-tree-tab="workspace"]::before {
    content: '';
    inline-size: 16px;
    block-size: 16px;
    background: currentColor;
    mask: ${codexMask("folder")} center / contain no-repeat;
  }

  ${side} { border-start-start-radius: 12px; background: var(--hcv-sidebar); }
  ${side} > [data-panel-header]:has(> [data-hcv-sidebar-bar]) {
    block-size: 46px !important;
  }
  ${side} > [data-panel-header]:has(> [data-hcv-sidebar-bar]):has([data-zone-tabstrip]) {
    block-size: 78px !important;
  }
  ${side} > [data-panel-header]:has(> [data-hcv-sidebar-bar]) [data-zone-tabstrip] {
    position: absolute;
    inset: auto 6px 4px;
    block-size: 28px;
    background: transparent;
  }
  ${side} [data-hcv-sidebar-bar] {
    display: flex;
    align-items: center;
    block-size: 46px;
    flex: none;
    order: -2;
    gap: 3px;
    padding-inline: 6px 0;
  }
  ${side} > [data-panel-header] > [data-hcv-sidebar-bar] {
    position: absolute;
    inset: 0 0 auto;
    padding-inline: 15px 8px;
  }
  ${side} [data-hcv-sidebar-bar] [data-hcv-brand] {
    flex: 1;
    font: 600 16px/20px var(--hcv-ui-font, system-ui, sans-serif);
    letter-spacing: -.015em;
    color: var(--hcv-text);
  }
  ${side} [data-hcv-sidebar-bar] button {
    position: relative;
    color: var(--hcv-muted);
    transition: color 150ms var(--hcv-ease), background-color 150ms var(--hcv-ease);
  }
  ${side} [data-hcv-sidebar-bar] button:focus-visible {
    outline: 1px solid var(--hcv-focus);
    outline-offset: -1px;
  }
  ${side} [data-hcv-sidebar-bar] button:disabled { opacity: .4; cursor: default; }
  ${side} [data-hcv-sidebar-bar] button[hidden] { display: none; }
  ${side} [data-hcv-search-toggle][aria-expanded="true"] { background: var(--hcv-hover); }
  ${side} [data-hcv-search-field]:not([data-hcv-search-open]) { display: none; }
  ${side} [data-hcv-search-field] {
    order: -1;
    padding: 0 0 8px;
  }
  ${side} [data-hcv-search-field] > div {
    display: flex;
    inline-size: 100%;
    padding-inline: 8px;
    border: 1px solid var(--hcv-stroke);
    border-radius: 8px;
    background: var(--hcv-menu);
    opacity: 1;
  }
  ${side} [data-hcv-search-field] > div:focus-within { border-color: var(--hcv-focus); }
  ${side} [data-hcv-search-field] input { font-size: 13px; }
  ${side} [data-slot="sidebar-content"] > [data-slot="sidebar-group"]:has([data-slot="sidebar-menu"]) {
    padding-block: 2px 10px;
  }
  ${side} [data-slot="sidebar-menu"] > li > button {
    min-block-size: 32px;
    padding-inline: 8px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 430;
  }
  ${side} [data-sessions-mode="projects"] > [data-slot="sidebar-group"] {
    flex: none;
    min-block-size: 0;
    overflow: visible;
  }
  ${side} [data-sessions-mode="projects"] > [data-slot="sidebar-group"] > [data-slot="sidebar-group-content"] { overflow: visible; }
  ${side} [data-sessions-mode]:not([data-sessions-mode="search"]) > [data-slot="sidebar-group"]:first-of-type:has([data-slot="sidebar-group-content"] > div > span > .codicon-pin):not(:has([data-row-actions])) { display: none; }
  ${side} [data-sessions-mode] > [data-slot="sidebar-group"] > :first-child span:has(> .dither) {
    font-size: 13px;
    line-height: 18px;
    font-weight: 600;
    letter-spacing: normal;
    text-transform: none;
    color: var(--hcv-muted);
  }
  ${side} [data-sessions-mode] > [data-slot="sidebar-group"] > :first-child span > .dither { display: none; }
  ${side} [data-sessions-mode] > [data-slot="sidebar-group"] > :first-child button:not(${flatRecent}) > .codicon-chevron-right { opacity: 1; }
  ${codexIconRules(`${side} [data-sessions-mode] > [data-slot="sidebar-group"] > :first-child button:not(${flatRecent}) > .codicon-chevron-right`, "right")}
  ${side} [data-sessions-mode="projects"] .row-hover { min-block-size: 28px; border-radius: 9px; }
  ${side} [data-sessions-project]:not([data-sessions-mode]) :is(.codicon-folder-library, .codicon-repo)::before {
    content: '';
    display: block;
    inline-size: 15px;
    block-size: 15px;
    background: currentColor;
    mask: ${codexMask("folder")} center / contain no-repeat;
  }
  ${side} [data-sessions-project]:not([data-sessions-mode]):has(> .grid + .grid) .codicon-folder-library::before { mask-image: ${codexMask("folderOpen")}; }
  ${codexIconRules(`${side} [data-sessions-project]:not([data-sessions-mode]) .codicon-home`, "home")}
  ${side} [data-hcv-recents] { margin-block: 12px 5px; }
  ${side} [data-hcv-recents-header] { display: flex; align-items: center; justify-content: space-between; padding-inline: 0 4px; min-block-size: 32px; }
  ${side} :is(${recentsButton}) { min-block-size: 30px; gap: 5px; padding-inline: 8px; font-size: 13px; }
  ${side} :is([data-hcv-recents-toggle], [data-hcv-show-projects]) {
    display: flex;
    align-items: center;
    align-self: stretch;
    min-inline-size: 0;
    gap: 4px;
    min-block-size: 28px;
    padding-inline: 8px;
    border-radius: 8px;
    font: 500 13px/18px var(--hcv-ui-font);
  }
  ${side} ${recentToggle} { flex: 1 1 0; }
  ${side} [data-hcv-show-projects] { flex: none; }
  ${neutralHeadings}, ${neutralHeadings}:hover { background-color: transparent; color: var(--hcv-sidebar-heading); }
  ${neutralHeadings}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${side} :is(${recentToggle}, [data-hcv-show-projects]) ${caret} { inline-size: 12px; block-size: 12px; flex: none; opacity: 0; }
  ${side} :is(${recentToggle}, [data-hcv-show-projects])[aria-expanded="false"] ${caret} { rotate: -90deg; opacity: 1; }
  ${side} [data-hcv-recents]:hover ${recentToggle} ${caret}, ${side} ${recentToggle}:focus-visible ${caret} { opacity: 1; }
  ${side} [data-hcv-recents-actions] { display: flex; align-items: center; gap: 1px; opacity: 0; pointer-events: none; }
  ${side} [data-hcv-recents-header]:is(:hover, :focus-within) [data-hcv-recents-actions],
  ${side} [data-hcv-recents-actions]:has([aria-expanded="true"]) { opacity: 1; pointer-events: auto; }
  ${side} [data-hcv-recents-actions] button { inline-size: 26px; min-block-size: 26px; justify-content: center; padding: 0; }
  ${side} [data-hcv-recents-actions] [data-hcv-icon] { inline-size: 14px; block-size: 14px; }
  ${side} [data-hcv-recents-body] { display: grid; grid-template-rows: 0fr; opacity: 0; }
  ${side} [data-hcv-recents-open] [data-hcv-recents-body] { grid-template-rows: 1fr; opacity: 1; }
  ${side} [data-hcv-recents-menu] {
    position: fixed; inset: auto; margin: 0; padding: 6px; inline-size: 210px;
    border: 1px solid var(--hcv-hairline); border-radius: var(--hcv-menu-radius);
    background: var(--hcv-menu); color: var(--hcv-text); box-shadow: var(--hcv-menu-shadow);
    opacity: 0; scale: .95; pointer-events: none; transform-origin: top left;
  }
  ${side} [data-hcv-recents-menu]:popover-open { opacity: 1; scale: 1; pointer-events: auto; }
  ${side} [data-hcv-recents-menu] button {
    inline-size: 100%; color: var(--hcv-text); text-align: start; border-radius: var(--hcv-popup-button-radius);
  }
  @media (any-hover: none) {
    ${side} [data-hcv-recents-actions] { opacity: 1; pointer-events: auto; }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${side} ${recentToggle} ${caret}, ${flat} ${flatCaret} { transition: opacity 150ms var(--hcv-enter), rotate 150ms var(--hcv-enter); }
    ${side} [data-hcv-recents-actions] { transition: opacity 150ms var(--hcv-ease); }
    ${side} [data-hcv-recents-body] {
      transition: grid-template-rows ${codexReference.disclosure.heightTime}ms ${codexReference.disclosure.ease}, opacity ${codexReference.disclosure.exitTime}ms ${codexReference.disclosure.ease};
    }
    ${side} [data-hcv-recents-open] [data-hcv-recents-body] {
      transition-delay: 0ms, ${codexReference.disclosure.enterDelay}ms;
      transition-duration: ${codexReference.disclosure.heightTime}ms, ${codexReference.disclosure.enterTime}ms;
    }
    ${side} [data-hcv-recents-menu] {
      transition: opacity 100ms var(--hcv-exit), scale 100ms var(--hcv-exit), display 100ms allow-discrete, overlay 100ms allow-discrete;
    }
    ${side} [data-hcv-recents-menu]:popover-open {
      transition: opacity 150ms var(--hcv-enter), scale 150ms var(--hcv-enter), display 150ms allow-discrete, overlay 150ms allow-discrete;
    }
    @starting-style { ${side} [data-hcv-recents-menu]:popover-open { opacity: 0; scale: .95; } }
  }
  ${side} :is([data-hcv-recents-list], [data-hcv-recents-fallback]) { min-block-size: 0; overflow: hidden; padding-inline: 5px; font-size: 12px; }
  ${side} [data-hcv-recents-list] > [data-slot="sidebar-group"] { padding: 0; }
  ${side} [data-hcv-recents-list] > [data-slot="sidebar-group"] > :first-child { display: none; }
  /* The native virtual list owns scrolling once it has enough rows. */
  ${side} [data-hcv-recents-list] .hcv-recent-scroll .hcv-recent-scroll {
    block-size: min(40vh, 320px);
  }
  ${side} [data-hcv-recents-fallback]:not([hidden]) { display: grid; gap: 2px; }
  ${side} [data-hcv-recents-fallback] button { display: block; text-align: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${side} [data-hcv-recent-empty] { padding: 6px 8px; color: var(--hcv-muted); }
}
@media (prefers-reduced-motion: reduce) {
  ${active2} [data-hcv-sidebar-bar] button { transition: none; }
}
@media (forced-colors: active), (max-width: 799px), (max-height: 479px) {
  ${active2} :is([data-hcv-history], [data-hcv-window-menu]) { display: none; }
}
`;
  document.head.append(stylesheet);
  ctx.onDispose(() => stylesheet.remove());
  ctx.register({ id: "window-menu", area: TITLEBAR_AREAS.left, render: () => h2(WindowChrome, { themeName: themeName2, recentRows }) });
  registerSidebar(ctx, active2, recentRows);
}

// source/workspace-card.js
import {
  DropdownMenu as DropdownMenu4,
  DropdownMenuContent as DropdownMenuContent4,
  DropdownMenuItem as DropdownMenuItem4,
  DropdownMenuSeparator as DropdownMenuSeparator2,
  DropdownMenuTrigger as DropdownMenuTrigger4,
  host as host9,
  TITLEBAR_AREAS as TITLEBAR_AREAS3,
  Tip,
  useI18n as useI18n4,
  useTheme as useTheme2,
  useValue as useValue4
} from "@hermes/plugin-sdk";
import { createElement as h9, Fragment as Fragment2, useEffect as useEffect7, useId as useId3, useRef as useRef5, useState as useState7 } from "react";

// source/summary-sources.js
import { useEffect as useEffect2, useState as useState3 } from "react";

// source/chat-resources.js
var previewResourceCard = "div:has(> span:first-child > svg.tabler-icon-device-desktop-analytics):has(> span.truncate[title] + button[aria-label] + button:not([aria-label]):last-child)";
function registerChatResources(ctx, active2) {
  const thread = `${active2} [data-chat-surface] [data-slot="aui_thread-content"]`;
  const answer2 = `${thread} [data-slot="aui_assistant-message-content"]`;
  const preview = `${answer2} ${previewResourceCard}`;
  const site = `${preview}:has(> span[title]:is([title^="http://" i], [title^="https://" i]))`;
  const artifact = `${answer2} [data-slot="aui_artifact-card"]`;
  const icon8 = `:is(${preview}, ${artifact}) > span:first-child`;
  const open = `${preview} > button:last-child`;
  const download = `${preview} > button[aria-label]`;
  const media2 = `${answer2} .aui-md span[class~="bg-muted/35"]:has(> :is(audio, video))`;
  const image = `${thread} :is([data-slot="aui_embedded-images"], [data-slot="aui_markdown-image"])`;
  const generated2 = `${answer2} [data-slot="aui_generated-image"]`;
  const imageDownload = `:is(${image}, ${generated2}) button:has(> svg.tabler-icon-download)`;
  const imageFocus = `${image} button:focus-visible > img`;
  const forcedColors = window.matchMedia("(forced-colors: active)");
  function openFromCard(event) {
    const target = event.target;
    if (event.defaultPrevented || forcedColors.matches || !(target instanceof Element) || target.closest("button")) return;
    const card = target.closest(preview);
    if (card && document.getSelection()?.isCollapsed !== false) card.lastElementChild.click();
  }
  const style = document.createElement("style");
  style.dataset.hcvChatResources = "";
  style.textContent = `
@media (forced-colors: none) {
  :is(${preview}, ${artifact}) {
    box-sizing: border-box;
    inline-size: 100%;
    max-inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 64px;
    margin-block: 6px;
    padding: 12px;
    border: 0;
    border-radius: 10px;
    box-shadow: inset 0 0 0 .5px var(--hcv-stroke);
    background: var(--hcv-panel);
    color: var(--hcv-text);
    font-family: var(--hcv-ui-font);
  }
  ${preview} {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    grid-template-rows: 1fr 1fr;
    gap: 0 10px;
  }
  ${artifact} { gap: 10px; }
  ${icon8} {
    inline-size: 40px;
    block-size: 40px;
    border-radius: 10px;
    background: var(--hcv-hover);
    color: var(--hcv-muted);
  }
  ${preview} > span:first-child {
    grid-area: 1 / 1 / 3 / 2;
  }
  ${preview} > span:first-child > svg { display: none; }
  ${preview} > span:first-child::before {
    content: "";
    inline-size: 24px;
    block-size: 24px;
    background: currentColor;
    mask: ${codexMask("artifacts")} center / contain no-repeat;
  }
  ${site} > span:first-child::before { mask-image: ${codexMask("web")}; }
  ${preview} > span[title], ${artifact} > span:nth-child(2) > span:first-child {
    color: var(--hcv-text);
    font: 500 var(--conversation-text-font-size, 13px) / 20px var(--hcv-ui-font);
  }
  ${preview} > span[title] { grid-area: 1 / 2; align-self: end; }
  ${open}, ${artifact} > span:nth-child(2) > span + span {
    color: var(--hcv-muted);
    font: 400 calc(var(--conversation-text-font-size, 13px) - 1px) / 18px var(--hcv-ui-font);
  }
  ${open} {
    grid-area: 2 / 2;
    align-self: start;
    min-inline-size: 0;
    overflow: hidden;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  ${preview}:has(> button:last-child:not(:disabled)) { cursor: pointer; }
  ${preview}:hover:has(> button:last-child:not(:disabled)),
  ${artifact}:not(:disabled):hover { background: var(--hcv-hover); }
  ${download} {
    grid-area: 1 / 3 / 3 / 4;
    min-block-size: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--hcv-muted);
    font: 400 12px/18px var(--hcv-ui-font);
  }
  ${download} > svg { inline-size: 14px; block-size: 14px; }
  ${artifact} > span:nth-child(3) {
    max-inline-size: 40%;
    overflow: hidden;
    padding: 4px 8px;
    border-radius: 8px;
    color: var(--hcv-muted);
    font: 400 12px/18px var(--hcv-ui-font);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  ${artifact}:focus-visible > span:nth-child(3) { opacity: 1; }
  ${preview}:has(> button:last-child:focus-visible),
  :is(${artifact}, ${download}, ${imageDownload}):focus-visible,
  ${generated2} > button:first-of-type:focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -2px;
  }
  ${open}:focus-visible { outline: none; }

  ${media2} {
    padding: 12px;
    border: 0;
    border-radius: 10px;
    box-shadow: inset 0 0 0 .5px var(--hcv-stroke);
    background: var(--hcv-panel);
  }
  ${media2} > span:first-child { color: var(--hcv-muted); font: 500 13px/18px var(--hcv-ui-font); }
  ${media2} > video { border-radius: 8px; }
  ${image} img, ${generated2} { border-radius: 12px; }
  ${image} img {
    border: 0;
    outline: 1px solid light-dark(oklch(0 0 0 / 0.1), oklch(1 0 0 / 0.1));
    outline-offset: -1px;
  }
  ${imageFocus} { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${imageDownload} {
    border: 0;
    border-radius: 8px;
    box-shadow: none;
    background: var(--hcv-panel);
    color: var(--hcv-muted);
  }
  :is(${download}, ${imageDownload}):not(:disabled):hover {
    background: var(--hcv-selected);
    color: var(--hcv-text);
  }
  ${codexIconRules(`:is(${download}, ${imageDownload}) > svg.tabler-icon-download`, "download")}

  @media (prefers-reduced-motion: no-preference) {
    :is(${preview}, ${artifact}, ${download}) { transition: background-color 120ms ease-out, color 120ms ease-out; }
    ${download}:active:not(:disabled) { scale: .96; }
  }
}
`;
  document.head.append(style);
  document.addEventListener("click", openFromCard);
  ctx.onDispose(() => {
    document.removeEventListener("click", openFromCard);
    style.remove();
  });
}

// source/summary-sources-view.js
import { DropdownMenu as DropdownMenu2, DropdownMenuContent as DropdownMenuContent2, DropdownMenuItem as DropdownMenuItem2, DropdownMenuTrigger as DropdownMenuTrigger2, useI18n } from "@hermes/plugin-sdk";
import { createElement as h3, useId, useRef as useRef2, useState as useState2 } from "react";
var labels = {
  ru: {
    title: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438",
    showAll: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0432\u0441\u0435",
    add: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A",
    addHint: "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0444\u0430\u0439\u043B\u044B \u0438\u043B\u0438 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F",
    attach: "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0444\u0430\u0439\u043B\u044B \u0438\u043B\u0438 \u043F\u0430\u043F\u043A\u0438",
    plugins: "\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C \u043F\u043B\u0430\u0433\u0438\u043D\u044B",
    connectors: "\u041A\u043E\u043D\u043D\u0435\u043A\u0442\u043E\u0440\u044B",
    connector: "\u041A\u043E\u043D\u043D\u0435\u043A\u0442\u043E\u0440 Hermes",
    image: "\u0418\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0435",
    file: "\u0424\u0430\u0439\u043B",
    folder: "\u041F\u0430\u043F\u043A\u0430",
    link: "\u0421\u0441\u044B\u043B\u043A\u0430",
    attached: "\u041F\u0440\u0438\u043A\u0440\u0435\u043F\u043B\u0435\u043D\u043E \u043A \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0443",
    provided: "\u041F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E \u0432 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0435",
    fromChat: "\u0418\u0437 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430",
    empty: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u043E\u0432",
    loading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026",
    unavailable: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B"
  },
  en: {
    title: "Sources",
    showAll: "View all",
    add: "Add source",
    addHint: "Attach files or connect apps",
    attach: "Attach files or folders",
    plugins: "Use plugins",
    connectors: "Connectors",
    connector: "Hermes connector",
    image: "Image",
    file: "File",
    folder: "Folder",
    link: "Link",
    attached: "Attached to the conversation",
    provided: "Provided in the conversation",
    fromChat: "From the conversation",
    empty: "No active sources",
    loading: "Loading\u2026",
    unavailable: "Sources unavailable"
  }
};
var composerAdd = '[data-slot="composer-root"] button[aria-haspopup="menu"]:has(> .codicon-add)';
function icon2(name) {
  return h3("span", { "aria-hidden": true, className: "hcv-source-glyph", style: codexIconStyle(name) });
}
function viewAllIcon() {
  return h3(
    "svg",
    { "aria-hidden": true, className: "hcv-sources-all-icon", viewBox: "0 0 20 20", fill: "currentColor" },
    h3("path", { d: "M16.6345 5.83331C16.6345 4.81987 15.813 3.99835 14.7996 3.99835C13.7863 3.99855 12.9646 4.81999 12.9646 5.83331C12.9646 6.84663 13.7863 7.66808 14.7996 7.66827C15.813 7.66827 16.6345 6.84676 16.6345 5.83331ZM3.36499 14.1663C3.36499 15.1798 4.18651 16.0013 5.19995 16.0013C6.21339 16.0013 7.03491 15.1798 7.03491 14.1663C7.03471 13.153 6.21327 12.3314 5.19995 12.3314C4.18663 12.3314 3.36519 13.153 3.36499 14.1663ZM17.9646 5.83331C17.9646 7.58129 16.5475 8.99835 14.7996 8.99835C13.2785 8.99818 12.0078 7.92497 11.7039 6.49445L11.6667 6.49835H11.3347C10.5362 6.49835 9.96426 6.49872 9.54565 6.52081C9.21098 6.53848 9.04089 6.56873 8.96069 6.59113L8.90796 6.60968C8.41777 6.86301 8.2248 7.46527 8.47632 7.95636L8.50757 8.00323C8.55968 8.068 8.68066 8.19148 8.94312 8.4007C9.27097 8.66203 9.73648 8.99501 10.3865 9.45929L11.239 10.0716C11.489 10.2539 11.7044 10.4155 11.8855 10.5599C12.2255 10.8309 12.5425 11.1144 12.7078 11.4368L12.8054 11.6536C13.206 12.6785 12.8306 13.8502 11.9089 14.4515L11.7029 14.5716C11.381 14.7379 10.9584 14.785 10.5242 14.8079C10.0619 14.8323 9.44766 14.8314 8.66479 14.8314H8.33276C8.31992 14.8314 8.30734 14.8282 8.29468 14.8275C7.9907 16.2581 6.72124 17.3314 5.19995 17.3314C3.45197 17.3314 2.03491 15.9143 2.03491 14.1663C2.03511 12.4185 3.45209 11.0013 5.19995 11.0013C6.72066 11.0013 7.99008 12.0743 8.29468 13.5042C8.30731 13.5035 8.31995 13.5013 8.33276 13.5013H8.66479C9.46362 13.5013 10.0362 13.5019 10.4548 13.4798C10.9013 13.4562 11.0544 13.4096 11.0925 13.39L11.1804 13.3382C11.5766 13.0799 11.7385 12.5765 11.5662 12.136L11.5242 12.0433C11.5046 12.0051 11.4062 11.8788 11.0564 11.5999C10.8925 11.4693 10.6943 11.3206 10.4558 11.1468L9.61304 10.5413C8.97593 10.0862 8.47599 9.72927 8.11401 9.44073C7.81659 9.20364 7.53702 8.95681 7.36108 8.68292L7.29272 8.56378C6.70695 7.42066 7.15568 6.0189 8.29663 5.42902L8.42163 5.3714C8.7241 5.25059 9.09524 5.21275 9.47534 5.19269C9.93756 5.16829 10.5518 5.16827 11.3347 5.16827H11.6667L11.7039 5.1712C12.0082 3.74114 13.2788 2.66845 14.7996 2.66827C16.5475 2.66827 17.9646 4.08533 17.9646 5.83331Z" })
  );
}
function connectorRows(connectors) {
  return (connectors ?? []).map(({ name }) => ({ kind: "source", key: name, name }));
}
function sourceLabel(row2, copy6) {
  return row2.name || ({ image: copy6.image, folder: copy6.folder, link: copy6.link }[row2.kind] ?? copy6.file);
}
function sourceDescription(row2, copy6) {
  if (row2.kind === "source") return copy6.connector;
  if (!row2.attached) return copy6.fromChat;
  return row2.kind === "link" ? copy6.provided : copy6.attached;
}
function SourceRow({ row: row2, expanded = false, copy: copy6, onOpenSource, onConnectors }) {
  const name = sourceLabel(row2, copy6);
  const open = row2.kind === "source" ? onConnectors && (() => onConnectors(row2.name)) : row2.action && onOpenSource && (() => onOpenSource(row2));
  const props = { className: "hcv-source-row", title: name };
  const content = h3("span", { className: "hcv-source-leading", "aria-hidden": true }, row2.thumbnail ? h3("img", { className: "hcv-source-thumbnail", src: row2.thumbnail, alt: "", draggable: false }) : icon2(row2.kind));
  const text = h3(
    "span",
    { className: "hcv-source-text" },
    h3("span", { className: "hcv-source-title", dir: "auto" }, name),
    expanded && row2.meta && h3("span", { className: "hcv-source-meta", dir: "auto" }, row2.meta)
  );
  return h3(
    "li",
    { "data-hcv-source-row": row2.kind },
    h3(open ? "button" : "div", open ? { ...props, type: "button", "aria-label": name, onClick: open } : props, content, text),
    expanded && h3("p", { className: "hcv-source-description" }, sourceDescription(row2, copy6))
  );
}
function sourceList(rows, props) {
  return rows.map((row2) => h3(SourceRow, { ...props, key: `${row2.kind}:${row2.key}`, row: row2 }));
}
function openComposerMenu(getChat) {
  const chat2 = getChat?.();
  requestAnimationFrame(() => {
    if (!chat2?.isConnected || getChat() !== chat2) return;
    const add = chat2.querySelector(composerAdd);
    if (!add || add.disabled || add.getAttribute("aria-expanded") === "true") return;
    add.focus({ preventScroll: true });
    add.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
}
function CompactSources({ rows = [], connectors, loading, onExpand, onConnectors, onOpenSource, getChat }) {
  const { locale } = useI18n();
  const copy6 = labels[locale] || labels.en;
  const contentId = useId();
  const [expanded, setExpanded] = useState2(true);
  const [menuOpen, setMenuOpen] = useState2(false);
  const movingFocus = useRef2(false);
  const items2 = [...rows, ...connectorRows(connectors)];
  const showMenu = () => setMenuOpen(true);
  function menuAction(action) {
    movingFocus.current = true;
    action();
  }
  return h3(
    "section",
    { "data-hcv-sources-compact": "", "data-collapsed": !expanded || void 0, "aria-label": copy6.title },
    h3(
      "header",
      null,
      h3(
        "button",
        {
          className: "hcv-sources-heading",
          type: "button",
          "aria-controls": contentId,
          "aria-expanded": expanded,
          onClick: () => setExpanded((value) => !value)
        },
        h3("span", null, copy6.title),
        !expanded && items2.length > 0 && h3("span", { className: "hcv-sources-count" }, items2.length),
        h3("span", { className: "hcv-sources-chevron" }, icon2("down"))
      ),
      h3(
        DropdownMenu2,
        { open: menuOpen, onOpenChange: setMenuOpen, modal: false },
        h3(DropdownMenuTrigger2, { asChild: true }, h3("button", {
          type: "button",
          className: "hcv-sources-add",
          "aria-label": copy6.add,
          title: copy6.addHint
        }, icon2("plus"))),
        h3(
          DropdownMenuContent2,
          {
            align: "end",
            sideOffset: 4,
            "data-hcv-sources-add-menu": "",
            onCloseAutoFocus: (event) => {
              if (movingFocus.current) event.preventDefault();
              movingFocus.current = false;
            }
          },
          h3(DropdownMenuItem2, { disabled: !onConnectors, onSelect: () => menuAction(() => onConnectors()) }, icon2("plugins"), copy6.plugins),
          h3(DropdownMenuItem2, { disabled: !getChat, onSelect: () => menuAction(() => openComposerMenu(getChat)) }, icon2("attach"), copy6.attach)
        )
      )
    ),
    h3(
      "div",
      { id: contentId, className: "hcv-sources-disclosure", inert: !expanded, "aria-hidden": !expanded },
      h3("div", { className: "hcv-sources-compact-content" }, items2.length ? [
        h3("ul", { key: "list", "aria-label": copy6.title }, ...sourceList(items2.slice(0, 3), { copy: copy6, onOpenSource, onConnectors })),
        h3(
          "button",
          { key: "expand", type: "button", className: "hcv-source-row hcv-sources-all", onClick: onExpand },
          h3("span", { className: "hcv-source-leading" }, viewAllIcon()),
          h3("span", null, copy6.showAll)
        )
      ] : loading ? h3("p", { role: "status", className: "hcv-sources-state" }, copy6.loading) : h3("button", { type: "button", className: "hcv-source-row hcv-sources-empty", onClick: showMenu }, copy6.addHint))
    )
  );
}
function SourcesPane({ rows = [], connectors, loading, onConnectors, onOpenSource }) {
  const { locale } = useI18n();
  const copy6 = labels[locale] || labels.en;
  const items2 = [...rows, ...connectorRows(connectors)];
  return h3(
    "div",
    { "data-hcv-sources-pane": "" },
    items2.length ? h3("ul", { "aria-label": copy6.title }, ...sourceList(items2, { expanded: true, copy: copy6, onOpenSource, onConnectors })) : h3("p", { role: "status", className: "hcv-sources-state" }, loading ? copy6.loading : connectors == null ? copy6.unavailable : copy6.empty),
    onConnectors && h3("button", { type: "button", className: "hcv-sources-connectors", onClick: () => onConnectors() }, icon2("source"), copy6.connectors)
  );
}
function registerSummarySources(ctx, active2) {
  const compact = `${active2} [data-hcv-sources-compact]`;
  const pane = `${active2} [data-hcv-sources-pane]`;
  const view = `${active2} :is([data-hcv-sources-compact], [data-hcv-sources-pane])`;
  const menu = `${active2} [data-hcv-sources-add-menu]`;
  const style = document.createElement("style");
  style.dataset.hcvSummarySources = "";
  style.textContent = `
    ${view} { color: var(--hcv-text); font: 13px/20px var(--hcv-ui-font); text-align: start; min-inline-size: 0; }
    ${view} ul { list-style: none; margin: 0; padding: 0; }
    ${view} :is(button, p) { margin: 0; }
    ${view} button { appearance: none; background: transparent; border: 0; color: inherit; font: inherit; text-align: inherit; cursor: pointer; }
    ${view} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
    ${view} .hcv-source-leading { display: grid; place-items: center; flex: 0 0 18px; inline-size: 18px; }
    ${view} .hcv-source-text { display: flex; flex: 1; flex-direction: column; min-inline-size: 0; }
    :is(${view}, ${menu}) .hcv-source-glyph { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; }
    ${view} .hcv-source-thumbnail {
      display: block; inline-size: 18px; block-size: 18px; border-radius: 3px;
      border: 1px solid var(--hcv-hairline); object-fit: cover;
    }
    ${view} .hcv-source-row { inline-size: 100%; min-inline-size: 0; display: flex; align-items: center; }
    ${view} .hcv-sources-state { padding-block: 4px; color: var(--hcv-muted); }

    ${compact} { border-block-start: 1px solid var(--hcv-hairline); padding-block-start: 6px; }
    ${compact} > header { display: flex; align-items: center; gap: 8px; min-block-size: 28px; color: var(--hcv-muted); }
    ${compact} .hcv-sources-heading {
      display: flex; align-items: center; gap: 4px; flex: 1; min-inline-size: 0;
      padding: 2px 4px; margin-inline-start: -4px; border-radius: 8px;
    }
    ${compact} .hcv-sources-chevron { display: grid; place-items: center; opacity: 0; }
    ${compact} .hcv-sources-chevron > span { inline-size: 12px; block-size: 12px; }
    ${compact} .hcv-sources-heading:is(:hover, :focus-visible) .hcv-sources-chevron { opacity: 1; }
    ${compact}[data-collapsed] .hcv-sources-chevron { opacity: 1; rotate: -90deg; }
    ${compact} .hcv-sources-count { color: color-mix(in srgb, var(--hcv-text) 45%, transparent); }
    ${compact} .hcv-sources-add {
      display: grid; place-items: center; inline-size: 24px; block-size: 24px; padding: 0; margin-inline-end: -6px;
      border-radius: 7px; color: color-mix(in srgb, var(--hcv-text) 40%, transparent);
    }
    ${compact} .hcv-sources-add:is(:hover, [data-state="open"]) { color: var(--hcv-text); background: color-mix(in srgb, var(--hcv-text) 8%, transparent); }
    ${compact} .hcv-sources-disclosure { display: grid; grid-template-rows: 1fr; opacity: 1; }
    ${compact}[data-collapsed] .hcv-sources-disclosure { grid-template-rows: 0fr; opacity: 0; }
    ${compact} .hcv-sources-compact-content { min-block-size: 0; overflow: clip; margin-inline: -8px; padding-inline: 8px; }
    ${compact} .hcv-sources-compact-content > ul { display: flex; flex-direction: column; gap: 2px; padding-block-start: 2px; }
    ${compact} .hcv-source-row {
      position: relative; isolation: isolate; gap: 12px; min-block-size: 28px;
      padding: 4px 0; border-radius: 6px; color: var(--hcv-muted);
    }
    ${compact} button.hcv-source-row:not(.hcv-sources-all):not(.hcv-sources-empty):hover::before {
      content: ''; position: absolute; z-index: -1; inset: 0 -8px; border-radius: 6px;
      background: color-mix(in srgb, var(--hcv-text) 8%, transparent);
    }
    ${compact} .hcv-source-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    ${compact} :is(.hcv-sources-all, .hcv-sources-empty) { color: color-mix(in srgb, var(--hcv-text) 40%, transparent); }
    ${compact} :is(.hcv-sources-all, .hcv-sources-empty):hover { color: var(--hcv-text); }
    ${compact} .hcv-sources-all-icon { inline-size: 20px; block-size: 20px; max-inline-size: none; }
    ${menu} { min-inline-size: 200px; z-index: calc(var(--z-modal-backdrop, 120) - 1); }

    ${pane} { flex: 1; block-size: 100%; min-block-size: 0; overflow: auto; background: var(--hcv-chat); }
    ${pane} > ul { padding-inline: 16px; }
    ${pane} [data-hcv-source-row] { padding-block: 16px; border-block-end: 1px solid var(--hcv-hairline); }
    ${pane} [data-hcv-source-row]:last-child { border-block-end: 0; }
    ${pane} .hcv-source-row { gap: 8px; padding: 0; border-radius: 8px; }
    ${pane} .hcv-source-text { gap: 2px; }
    ${pane} .hcv-source-title { font: 500 13px/18.5714px var(--hcv-ui-font); overflow-wrap: anywhere; }
    ${pane} .hcv-source-meta { font: 12px/16px var(--hcv-ui-font); color: var(--hcv-muted); word-break: break-all; }
    ${pane} .hcv-source-description { margin-block-start: 12px; padding-inline-start: 24px; color: var(--hcv-muted); }
    ${pane} .hcv-sources-state { margin: 12px 16px 0; }
    ${pane} .hcv-sources-connectors {
      display: flex; align-items: center; gap: 8px; margin: 0 16px 16px; padding: 4px 8px;
      border-radius: 8px; color: var(--hcv-muted);
    }
    ${pane} .hcv-sources-connectors:hover { color: var(--hcv-text); background: var(--hcv-hover); }
    @media (prefers-reduced-motion: no-preference) {
      ${compact} .hcv-sources-disclosure { transition: grid-template-rows 160ms ease-out, opacity 140ms ease-out; }
      ${compact} .hcv-sources-chevron { transition: rotate 160ms ease-out, opacity 140ms ease-out; }
    }
  `;
  document.head.append(style);
  ctx.onDispose(() => style.remove());
}

// source/summary-sources.js
var transcript = '[data-slot="aui_thread-content"]';
var filePreview = `[data-slot="aui_assistant-message-content"] ${previewResourceCard} > button:last-child`;
var candidates = [
  '[data-slot="aui_directive-chip"]:is([data-ref="file"], [data-ref="folder"], [data-ref="image"], [data-ref="url"])',
  ':is([data-slot="aui_embedded-images"], [data-slot="aui_generated-image"], [data-slot="aui_markdown-image"]) img',
  '[data-slot="aui_artifact-card"]:is(button, a[href])',
  filePreview,
  ".aui-md a[href]"
].join(", ");
var directiveKinds = /* @__PURE__ */ new Map([["file", "artifacts"], ["folder", "folder"], ["image", "image"]]);
function httpLink(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}
function sourceFrom(node2) {
  const attached = Boolean(node2.closest('[data-slot="aui_user-message-root"]'));
  if (node2 instanceof HTMLImageElement) {
    const action2 = node2.closest("button");
    const src = node2.currentSrc || node2.getAttribute("src");
    if (!action2 || !src || !node2.complete || !node2.naturalWidth) return null;
    const thumbnail = /^(?:blob:|file:|hermes-[a-z-]+:|data:image\/(?:png|jpe?g|gif|webp|avif|bmp);)/i.test(src) ? src : null;
    const alt = node2.alt.trim() || action2.title?.trim() || "";
    const path = /^(?:[a-z]:[/\\]|[/\\])/i.test(alt) ? alt : null;
    const name2 = path ? path.split(/[/\\]/).at(-1) : alt;
    return { kind: "image", key: src, name: name2, meta: path, thumbnail, attached, action: action2 };
  }
  if (node2.matches(filePreview)) {
    const label = node2.previousElementSibling?.previousElementSibling;
    const name2 = label?.textContent.trim();
    return name2 ? { kind: "artifacts", key: label.title, name: name2, meta: label.title, attached, action: node2 } : null;
  }
  const reference = node2.dataset.directiveId;
  const kind = directiveKinds.get(node2.dataset.ref) || (node2.dataset.slot === "aui_artifact-card" ? "artifacts" : "link");
  const link = kind === "link" && httpLink(node2.getAttribute("href") || reference);
  if (kind === "link" && !link) return null;
  const name = node2.querySelector(".truncate")?.textContent.trim() || node2.textContent.trim() || link?.hostname || null;
  const action = node2.matches("button, a[href]") ? node2 : null;
  return { kind, key: reference || link?.href || name, name, meta: link?.href || reference, attached, action };
}
function useChatSources(getChat, scopeKey2, enabled) {
  const [snapshot, setSnapshot] = useState3(null);
  useEffect2(() => {
    if (!enabled) return;
    let frame = 0;
    let chat2 = null;
    let body = null;
    const content = new MutationObserver(queue);
    const mounts = new MutationObserver((records) => {
      if (!chat2?.isConnected || !body?.isConnected || records.some((record) => [...record.addedNodes, ...record.removedNodes].some(
        (node2) => node2 instanceof Element && (node2.matches(transcript) || node2.querySelector(transcript))
      ))) queue();
    });
    function collect() {
      frame = 0;
      chat2 = getChat();
      const next = chat2?.querySelector(transcript);
      if (next !== body) {
        content.disconnect();
        body?.removeEventListener("load", queue, true);
        body = next;
        if (body) {
          content.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "src", "alt"] });
          body.addEventListener("load", queue, true);
        }
      }
      const unique = /* @__PURE__ */ new Map();
      for (const node2 of [...body?.querySelectorAll(candidates) || []].reverse()) {
        const row2 = sourceFrom(node2);
        const key = row2 && `${row2.kind}:${row2.key}`;
        if (key && !unique.has(key)) unique.set(key, row2);
      }
      const rows = [...unique.values()];
      setSnapshot((old) => old?.scopeKey === scopeKey2 && old.rows.length === rows.length && rows.every((row2, i) => row2.action === old.rows[i].action && row2.key === old.rows[i].key && row2.name === old.rows[i].name && row2.thumbnail === old.rows[i].thumbnail && row2.kind === old.rows[i].kind && row2.meta === old.rows[i].meta && row2.attached === old.rows[i].attached) ? old : { scopeKey: scopeKey2, rows });
    }
    function queue() {
      if (!frame) frame = requestAnimationFrame(collect);
    }
    mounts.observe(document.body, { childList: true, subtree: true });
    queue();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      mounts.disconnect();
      content.disconnect();
      body?.removeEventListener("load", queue, true);
    };
  }, [getChat, scopeKey2, enabled]);
  return enabled && snapshot?.scopeKey === scopeKey2 ? snapshot.rows : [];
}

// source/subagents.js
import { atom, host as host6, useValue } from "@hermes/plugin-sdk";
import { createElement as h5, useEffect as useEffect4 } from "react";

// source/agent-avatars.js
var shapes = [
  '<circle cx="12" cy="12" r="2.1" fill="currentColor"/><ellipse cx="12" cy="12" rx="7.5" ry="3.7" transform="rotate(-28 12 12)" fill="none" stroke="currentColor" stroke-width="1.65"/>',
  '<path d="M12 4.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z" fill="currentColor"/>',
  '<path d="M7.8 17.5l-2.6-4.3L8 7.3l4.3-1.4 6.5 3.3-.6 5.4-5.2 4.1z" fill="currentColor"/><path d="M8 7.3l3.9 5.1 6.9-3.2m-6.9 3.2 1.1 6.3" fill="none" stroke="var(--badge-bg)" stroke-width="1.2"/>',
  '<path d="M6.3 12a3.5 3.5 0 0 1 5.7-2.7 3.5 3.5 0 0 1 5.7 2.7c0 2.3-2.9 4.3-5.7 5.8-2.8-1.5-5.7-3.5-5.7-5.8z" fill="currentColor"/><circle cx="12" cy="6.1" r="1.15" fill="currentColor"/>'
];
var palettes = [
  [["#39304d", "#d1b5ff"], ["#eae0fb", "#6947aa"]],
  [["#263f4d", "#a0dcf1"], ["#d9edf4", "#27627a"]],
  [["#27443d", "#93e0bb"], ["#d9eee1", "#21684e"]],
  [["#4a2c42", "#f1a7d0"], ["#f3deeb", "#94426e"]],
  [["#4a3b28", "#f4ce91"], ["#f3e9d5", "#875917"]],
  [["#2f3959", "#b4c3ff"], ["#e1e7fb", "#4a5eac"]],
  [["#4b3230", "#ffb4a1"], ["#f5e1d9", "#963e35"]]
];
var agentAvatars = shapes.flatMap(
  (shape) => palettes.map((palette) => palette.map(
    ([background, foreground]) => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style="color:${foreground};--badge-bg:${background}"><rect x="1" y="1" width="22" height="22" rx="8" fill="${background}"/>${shape}</svg>`
  ))
);

// source/summary-agents.js
import { CopyButton, host as host5, reasoningEffortLabel, Streamdown } from "@hermes/plugin-sdk";
import { createElement as h4, useEffect as useEffect3, useLayoutEffect, useRef as useRef3, useState as useState4 } from "react";
var labels2 = {
  ru: {
    title: "\u0421\u0443\u0431\u0430\u0433\u0435\u043D\u0442\u044B",
    active: "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435",
    done: "\u0413\u043E\u0442\u043E\u0432\u043E",
    noActive: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0441\u0443\u0431\u0430\u0433\u0435\u043D\u0442\u043E\u0432",
    back: "\u041D\u0430\u0437\u0430\u0434 \u043A \u0441\u0443\u0431\u0430\u0433\u0435\u043D\u0442\u0430\u043C",
    fallback: "\u0421\u0443\u0431\u0430\u0433\u0435\u043D\u0442",
    waitingCount: (count) => new Intl.PluralRules("ru").select(count) === "one" ? count + " \u043E\u0436\u0438\u0434\u0430\u0435\u0442" : count + " \u043E\u0436\u0438\u0434\u0430\u044E\u0442",
    more: (count) => "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0435\u0449\u0451 " + count,
    worked: (time) => "\u0420\u0430\u0431\u043E\u0442\u0430\u043B \u043D\u0430 \u043F\u0440\u043E\u0442\u044F\u0436\u0435\u043D\u0438\u0438 " + time,
    elapsed: (time) => "\u0420\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0443\u0436\u0435 " + time,
    activity: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C",
    result: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442",
    loading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043E\u0442\u0432\u0435\u0442\u0430\u2026",
    noResult: "\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u043F\u043E\u043A\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D",
    copy: "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
    native: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u043E\u0441\u0442\u0438 \u0432 Hermes",
    receipt: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043E\u0442\u0447\u0451\u0442 \u0432 \u0447\u0430\u0442\u0435",
    status: { running: "\u0420\u0430\u0431\u043E\u0442\u0430\u0435\u0442", queued: "\u041E\u0436\u0438\u0434\u0430\u0435\u0442", dispatched: "\u041F\u0435\u0440\u0435\u0434\u0430\u043D\u043E", failed: "\u041E\u0448\u0438\u0431\u043A\u0430", interrupted: "\u041F\u0440\u0435\u0440\u0432\u0430\u043D\u043E" }
  },
  en: {
    title: "Subagents",
    active: "Active",
    done: "Done",
    noActive: "No active subagents",
    back: "Back to subagents",
    fallback: "Subagent",
    waitingCount: (count) => count + " waiting",
    more: (count) => "Show " + count + " more",
    worked: (time) => "Worked for " + time,
    elapsed: (time) => "Working for " + time,
    activity: "Activity",
    result: "Result",
    loading: "Loading response\u2026",
    noResult: "Result unavailable",
    copy: "Copy",
    native: "Open details in Hermes",
    receipt: "Open report in chat",
    status: { running: "Working", queued: "Waiting", dispatched: "Dispatched", failed: "Failed", interrupted: "Interrupted" }
  }
};
var finished = ({ status }) => ["completed", "failed", "interrupted"].includes(status);
var recency = (agent) => agent.updatedAt ?? agent.finishedAt ?? agent.startedAt ?? 0;
var goalLabel = (agent, copy6) => agent.goal || copy6.fallback;
var normalizeProfile = (name) => (name || "default").trim().toLowerCase() || "default";
function formatDuration(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole / 60) % 60;
  return [hours && hours + "h", (hours || minutes) && minutes + "m", whole % 60 + "s"].filter(Boolean).join(" ");
}
function relativeTime(value, now, lang) {
  const minutes = Math.max(0, Math.floor((now - value) / 6e4));
  const days = Math.floor(minutes / 1440);
  const weeks = Math.floor(days / 7);
  const [age, unit] = weeks ? [weeks, "week"] : days ? [days, "day"] : minutes >= 60 ? [Math.floor(minutes / 60), "hour"] : [minutes, "minute"];
  return new Intl.RelativeTimeFormat(lang, { style: "narrow", numeric: "auto" }).format(-age, unit);
}
function AgentAvatar({ agent, dark: dark2, avatarUrl: avatarUrl2 }) {
  return h4("img", {
    "data-hcv-subagent-avatar": "",
    src: avatarUrl2(agent.seed, dark2),
    alt: "",
    draggable: false,
    width: 24,
    height: 24
  });
}
function Glyph({ name }) {
  return h4("span", { "aria-hidden": true, "data-hcv-subagent-glyph": name, style: codexIconStyle(name) });
}
function trailingLabel(agent, now, lang, copy6) {
  if (agent.status === "running" && agent.startedAt) return formatDuration((now - agent.startedAt) / 1e3);
  if (agent.status === "completed" && agent.finishedAt) {
    return h4("time", { dateTime: new Date(agent.finishedAt).toISOString() }, relativeTime(agent.finishedAt, now, lang));
  }
  return copy6.status[agent.status] || null;
}
function AgentGroup({ name, title, agents, limit, empty, copy: copy6, now, lang, dark: dark2, avatarUrl: avatarUrl2, select, trailing }) {
  const [expanded, setExpanded] = useState4(false);
  if (!agents.length && !empty) return null;
  const shown = expanded ? agents : agents.slice(0, limit);
  return h4(
    "section",
    { "data-hcv-subagent-group": name },
    h4("h2", null, h4("span", null, title + " \xB7 " + agents.length), trailing && h4("small", null, trailing)),
    agents.length ? h4("ul", null, shown.map((agent) => {
      const goal = goalLabel(agent, copy6);
      const preview = !finished(agent) && (agent.activity?.at(-1) || (agent.status === "running" ? copy6.status.running : ""));
      return h4(
        "li",
        { key: agent.id },
        h4(
          "button",
          {
            type: "button",
            "data-hcv-subagent-row": agent.id,
            "data-status": agent.status,
            onClick: () => select(agent.id)
          },
          h4(AgentAvatar, { agent, dark: dark2, avatarUrl: avatarUrl2 }),
          h4(
            "span",
            { "data-hcv-subagent-row-body": "" },
            h4(
              "span",
              { "data-hcv-subagent-row-title": "" },
              h4("span", { "data-hcv-subagent-name": "", title: goal, dir: "auto" }, goal),
              h4("span", { "data-hcv-subagent-trailing": "" }, trailingLabel(agent, now, lang, copy6))
            ),
            preview && h4("span", { "data-hcv-subagent-preview": "", title: preview, dir: "auto" }, preview)
          )
        )
      );
    })) : h4("p", { "data-hcv-subagent-empty": "" }, empty),
    !expanded && agents.length > limit && h4("button", { type: "button", "data-hcv-subagent-more": "", onClick: () => setExpanded(true) }, copy6.more(agents.length - limit))
  );
}
function textFromContent(value) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
}
function useChildResponse(childSession, scope2, status) {
  const [snapshot, setSnapshot] = useState4(null);
  useEffect3(() => {
    if (!childSession || !scope2 || !window.hermesDesktop?.api) return;
    const [connectionId, profile2, parent] = JSON.parse(scope2);
    if (childSession === parent) return;
    let current = true;
    const sameOwner = () => current && host5.state.activeSessionId.get() === parent && (host5.state.connectionId.get() || null) === connectionId && normalizeProfile(host5.state.profile.get()) === profile2;
    async function read() {
      if (!sameOwner()) return;
      const routes = connectionId && connectionId !== "local" ? await host5.profileRoutes().catch(() => []) : [];
      if (!sameOwner()) return;
      const route = routes.find((entry) => entry.connectionId === connectionId && normalizeProfile(entry.profile) === profile2);
      const targetProfile = route?.targetProfile ?? profile2;
      const query = new URLSearchParams({ profile: targetProfile, order: "latest", limit: "80", include_compacted: "true" });
      const result = await window.hermesDesktop.api({
        ...connectionId ? { connectionId } : {},
        profile: profile2,
        passive: true,
        timeoutMs: 8e3,
        path: "/api/sessions/" + encodeURIComponent(childSession) + "/messages?" + query
      });
      if (!sameOwner()) return;
      const history2 = result?.messages ?? result?.data;
      const available = Array.isArray(history2) && (!result.profile || normalizeProfile(result.profile) === normalizeProfile(targetProfile));
      const messages = available ? history2.filter((message) => message?.role === "assistant" && !message.display_kind).map((message) => textFromContent(message.display_content === void 0 ? message.content : message.display_content)).filter(Boolean) : [];
      setSnapshot({ childSession, status, messages });
    }
    void read().catch(() => {
      if (sameOwner()) setSnapshot({ childSession, status, messages: [] });
    });
    return () => {
      current = false;
    };
  }, [childSession, scope2, status]);
  return snapshot?.childSession === childSession ? snapshot : null;
}
var markdownComponents = {
  img: ({ alt }) => alt ? h4("span", null, alt) : null,
  a: ({ children, href }) => /^https?:\/\//i.test(href || "") ? h4("a", { href, target: "_blank", rel: "noopener noreferrer" }, children) : h4("span", null, children)
};
function AgentDetail({ agent, scope: scope2, now, copy: copy6, dark: dark2, avatarUrl: avatarUrl2, onBack, nativeActions: nativeActions2, openNativeAgent: openNativeAgent2 }) {
  const back = useRef3(null);
  useLayoutEffect(() => {
    back.current?.focus({ preventScroll: true });
  }, []);
  const snapshot = useChildResponse(agent.childSession, scope2, agent.status);
  const completed = finished(agent);
  const model = [agent.model, agent.effort && reasoningEffortLabel(agent.effort)].filter(Boolean).join(" \xB7 ");
  const elapsed = agent.durationSeconds ?? (agent.startedAt && ((agent.finishedAt || now) - agent.startedAt) / 1e3);
  const durationLabel = elapsed == null ? null : (completed ? copy6.worked : copy6.elapsed)(formatDuration(elapsed));
  const statusLabel = copy6.status[agent.status];
  const meta = completed && statusLabel ? [durationLabel, statusLabel].filter(Boolean).join(" \xB7 ") : durationLabel || statusLabel;
  const activity = agent.activity || [];
  const source = snapshot?.messages.length ? "transcript" : agent.summary ? "summary" : void 0;
  const result = source === "transcript" ? snapshot.messages : source === "summary" ? [agent.summary] : [];
  const destinations = nativeActions2(agent, scope2);
  const loading = window.hermesDesktop?.api && agent.childSession && (!snapshot || snapshot.status !== agent.status);
  const label = goalLabel(agent, copy6);
  const actions = (result.length > 0 || destinations.length > 0) && h4(
    "div",
    { "data-hcv-subagent-actions": "" },
    result.length > 0 && h4(CopyButton, { label: copy6.copy, text: result.join("\n\n"), appearance: "icon", buttonSize: "icon-sm" }),
    destinations.map((action) => h4(
      "button",
      {
        key: action,
        type: "button",
        "data-hcv-subagent-native": action,
        "aria-label": copy6[action],
        title: copy6[action],
        onClick: () => openNativeAgent2(agent, scope2, action)
      },
      h4(Glyph, { name: action === "native" ? "open" : "chatTab" })
    ))
  );
  return h4(
    "div",
    { "data-hcv-subagent-detail": "" },
    h4(
      "header",
      { "data-hcv-subagent-header": "" },
      h4("button", {
        ref: back,
        type: "button",
        "aria-label": copy6.back,
        title: copy6.back,
        "data-hcv-subagent-back": "",
        onClick: onBack
      }, h4(Glyph, { name: "back" })),
      h4(AgentAvatar, { agent, dark: dark2, avatarUrl: avatarUrl2 }),
      h4("h2", { "data-hcv-subagent-name": "", title: label, dir: "auto" }, label),
      model && h4("span", { "data-hcv-subagent-model": "", title: model }, model)
    ),
    h4(
      "div",
      { "data-hcv-subagent-feed": "" },
      h4(
        "div",
        { "data-hcv-subagent-column": "" },
        activity.length ? h4(
          "details",
          { "data-hcv-subagent-activity-log": "" },
          h4("summary", null, meta || copy6.activity, h4(Glyph, { name: "right" })),
          h4("ul", null, activity.map((text, index) => h4("li", { key: index, dir: "auto" }, text)))
        ) : meta && h4("p", { "data-hcv-subagent-meta": "" }, meta),
        h4(
          "div",
          { role: "group", "aria-label": copy6.result, "data-hcv-subagent-result": "", "data-source": source },
          result.length ? result.map((text, index) => h4(
            "div",
            { key: index, dir: "auto" },
            h4(Streamdown, { components: markdownComponents, controls: false, mode: "static", parseIncompleteMarkdown: false }, text)
          )) : h4("p", { role: "status", "data-hcv-subagent-empty": "" }, loading ? copy6.loading : !completed && statusLabel ? statusLabel : copy6.noResult)
        ),
        actions
      )
    )
  );
}
function AgentPane({ agents, scope: scope2, lang, dark: dark2, avatarUrl: avatarUrl2, nativeActions: nativeActions2, openNativeAgent: openNativeAgent2 }) {
  const copy6 = labels2[lang];
  const [selected, setSelected] = useState4(null);
  const pane = useRef3(null);
  const returning = useRef3(null);
  const [now, setNow] = useState4(Date.now);
  const agent = agents.find((item) => item.id === selected);
  const running = agents.some(({ status, startedAt }) => status === "running" && startedAt);
  const clock = running ? 1e3 : agents.some(({ finishedAt }) => finishedAt) ? 6e4 : 0;
  useEffect3(() => {
    if (!clock) return;
    const update = () => {
      if (document.visibilityState !== "hidden" && pane.current?.checkVisibility({ visibilityProperty: true })) setNow(Date.now());
    };
    update();
    const timer = window.setInterval(update, clock);
    return () => window.clearInterval(timer);
  }, [clock]);
  useLayoutEffect(() => {
    if (!agent && returning.current !== null) {
      const rows = Array.from(pane.current?.querySelectorAll("[data-hcv-subagent-row]") || []);
      const row2 = rows.find((item) => item.dataset.hcvSubagentRow === returning.current) ?? rows[0];
      returning.current = null;
      row2?.focus({ preventScroll: true });
    }
  }, [agent]);
  const ordered2 = [...agents].sort((first, second) => recency(second) - recency(first));
  const active2 = ordered2.filter((item) => !finished(item));
  const done = ordered2.filter(finished);
  const waiting = active2.filter(({ status }) => status === "queued").length;
  const group = { copy: copy6, now, lang, dark: dark2, avatarUrl: avatarUrl2, select: setSelected };
  return h4(
    "section",
    { ref: pane, "data-hcv-subagents-pane": "", "aria-label": copy6.title },
    h4(
      "div",
      { "data-hcv-subagent-list": "", hidden: Boolean(agent) },
      h4(
        "div",
        { "data-hcv-subagent-column": "" },
        h4(AgentGroup, {
          ...group,
          name: "active",
          title: copy6.active,
          agents: active2,
          limit: 4,
          empty: copy6.noActive,
          trailing: waiting ? copy6.waitingCount(waiting) : null
        }),
        h4(AgentGroup, { ...group, name: "done", title: copy6.done, agents: done, limit: 10 })
      )
    ),
    agent && h4(AgentDetail, {
      key: agent.id,
      agent,
      scope: scope2,
      now,
      copy: copy6,
      dark: dark2,
      avatarUrl: avatarUrl2,
      nativeActions: nativeActions2,
      openNativeAgent: openNativeAgent2,
      onBack: () => {
        returning.current = agent.id;
        setSelected(null);
      }
    })
  );
}
function agentPaneStyles(active2) {
  const pane = active2 + " [data-hcv-subagents-pane]";
  return `
${pane} {
  display: flex; flex-direction: column; block-size: 100%; min-block-size: 0; min-inline-size: 0;
  color: var(--hcv-text, var(--foreground)); background: var(--hcv-chat, var(--background));
  font-family: var(--hcv-ui-font, var(--font-sans));
  --hcv-agent-muted: var(--hcv-muted, var(--muted-foreground));
  --hcv-agent-divider: var(--hcv-hairline, var(--border));
}
${pane} [hidden] { display: none !important; }
${pane} :is([data-hcv-subagent-list], [data-hcv-subagent-feed]) { min-block-size: 0; flex: 1; overflow: auto; }
${pane} [data-hcv-subagent-list] { padding: 20px 12px; }
${pane} [data-hcv-subagent-column] { margin-inline: auto; max-inline-size: var(--thread-content-max-width, 48rem); }
${pane} [data-hcv-subagent-group="done"] { margin-block-start: 24px; }
${pane} [data-hcv-subagent-group] h2 {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 0 0 8px; padding-inline: 8px; color: var(--hcv-agent-muted);
  font-size: 13px; font-weight: 400; line-height: 20px;
}
${pane} [data-hcv-subagent-group] h2 small { flex: none; font-size: 12px; font-variant-numeric: tabular-nums; }
${pane} [data-hcv-subagent-group] ul { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
${pane} [data-hcv-subagent-row] {
  display: flex; align-items: flex-start; gap: 12px; min-block-size: 40px; inline-size: 100%;
  padding: 8px; border: 0; border-radius: 10px; background: transparent; text-align: start; cursor: pointer;
}
${pane} [data-hcv-subagent-avatar] { display: block; inline-size: 24px; block-size: 24px; flex: none; }
${pane} [data-hcv-subagent-row-body] { display: block; min-inline-size: 0; flex: 1; }
${pane} [data-hcv-subagent-row-title] { display: flex; align-items: center; gap: 8px; min-block-size: 24px; font-size: 13px; line-height: 20px; }
${pane} :is([data-hcv-subagent-name], [data-hcv-subagent-model], [data-hcv-subagent-preview]) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${pane} [data-hcv-subagent-name] { min-inline-size: 0; flex: 1; unicode-bidi: plaintext; }
${pane} [data-hcv-subagent-trailing] { flex: none; color: var(--hcv-agent-muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
${pane} [data-hcv-subagent-trailing]:empty { display: none; }
${pane} :is([data-hcv-subagent-empty], [data-hcv-subagent-preview]) { color: var(--hcv-agent-muted); font-size: 13px; line-height: 20px; }
${pane} [data-hcv-subagent-empty] { margin: 0; padding: 4px 8px; }
${pane} [data-hcv-subagent-preview] { display: block; unicode-bidi: plaintext; }
${pane} [data-hcv-subagent-more] {
  margin-block-start: 8px; margin-inline-start: 44px; min-block-size: 26px; padding-inline: 6px;
  border-radius: 8px; color: var(--hcv-agent-muted); font-size: 13px; cursor: pointer;
}
${pane} [data-hcv-subagent-detail] { display: flex; flex: 1; flex-direction: column; min-block-size: 0; }
${pane} [data-hcv-subagent-header] {
  display: flex; align-items: center; gap: 8px; min-inline-size: 0; min-block-size: 40px;
  padding: 0 16px; border-block-end: 1px solid var(--hcv-agent-divider); flex: none;
}
${pane} [data-hcv-subagent-header] h2 { margin: 0; font-size: 13px; font-weight: 500; line-height: 20px; }
${pane} [data-hcv-subagent-model] { flex: 0 1 auto; max-inline-size: 50%; color: var(--hcv-agent-muted); font-size: 12px; }
${pane} [data-hcv-subagent-back] {
  display: grid; place-items: center; inline-size: 24px; block-size: 24px; flex: none;
  border-radius: 8px; color: var(--hcv-agent-muted); cursor: pointer;
}
${pane} [data-hcv-subagent-glyph] { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; }
${pane} [data-hcv-subagent-back]:dir(rtl) > span { transform: scaleX(-1); }
${pane} [data-hcv-subagent-feed] { padding: 32px 16px 20px; }
${pane} :is([data-hcv-subagent-meta], [data-hcv-subagent-activity-log]) {
  margin: 0 0 16px; padding-block-end: 4px; border-block-end: 1px solid var(--hcv-agent-divider);
  color: var(--hcv-agent-muted); font-size: 14px; line-height: 22px;
}
${pane} [data-hcv-subagent-activity-log] summary { display: flex; align-items: center; gap: 4px; list-style: none; cursor: pointer; }
${pane} [data-hcv-subagent-activity-log] summary::-webkit-details-marker { display: none; }
${pane} [data-hcv-subagent-activity-log][open] summary > span { rotate: 90deg; }
${pane} [data-hcv-subagent-activity-log] ul { padding-inline-start: 24px; margin: 4px 0; overflow-wrap: anywhere; }
${pane} [data-hcv-subagent-result] { font-size: 14px; line-height: 23px; overflow-wrap: anywhere; }
${pane} [data-hcv-subagent-result] > div + div { margin-block-start: 16px; }
${pane} [data-hcv-subagent-result] p { margin-block: 0 16px; }
${pane} [data-hcv-subagent-result] p:last-child { margin-block-end: 0; }
${pane} [data-hcv-subagent-result] a { color: var(--hcv-link, var(--ui-blue)); }
${pane} [data-hcv-subagent-actions] { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-block-start: 10px; }
${pane} [data-hcv-subagent-actions] button {
  display: inline-grid; place-items: center; inline-size: 24px; block-size: 24px;
  padding: 0; border-radius: 8px; color: var(--hcv-agent-muted); cursor: pointer;
}
${pane} :is(button, summary):focus-visible { outline: 2px solid var(--hcv-focus, Highlight); outline-offset: -2px; }
${pane} :is(button, summary):is(:hover, :focus-visible) { background: var(--hcv-hover, var(--muted)); color: var(--hcv-text, var(--foreground)); }
@media (forced-colors: active) {
  ${pane} :is(button, summary):focus-visible { outline-color: Highlight; }
  ${pane} [data-hcv-subagent-glyph] { forced-color-adjust: none; color: ButtonText; }
}
`;
}

// source/subagents.js
var surface = "[data-chat-surface]:not([data-hud-shell] *)";
var primary = surface + '[data-composer-target="main"][data-session-anchor="workspace"]';
var delegate = "[data-delegate-card]";
var response = '[data-slot="aui_response-group"]';
var transcript2 = '[data-slot="aui_thread-content"]';
var pair = '[data-slot="aui_turn-pair"]';
var prompt = '[data-slot="aui_user-message-root"][data-message-id]';
var generated = "[data-hcv-agent-rows]";
var notice = '[data-slot="aui_system-message-root"] [data-slot="aui_background-result"]';
var final = (status) => ["completed", "failed", "interrupted"].includes(status);
var isActive = ({ status }) => status === "running" || status === "queued";
var tidy = (text) => typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";
var prose = (text) => typeof text === "string" ? text.trim() : "";
var duration = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
var timestamp = (value) => Number.isFinite(value) && value > 0 ? value * (value < 1e12 ? 1e3 : 1) : void 0;
var noActivity = Object.freeze([]);
var getPrompt = (turn) => turn?.querySelector(":scope > " + prompt)?.dataset.messageId;
var profile = (value) => tidy(value).toLowerCase() || "default";
var scopeKey = (session, connection, name) => session && JSON.stringify([connection || null, profile(name), session]);
var labels3 = {
  ru: {
    title: "\u0421\u0443\u0431\u0430\u0433\u0435\u043D\u0442\u044B",
    fallback: "\u0421\u0443\u0431\u0430\u0433\u0435\u043D\u0442",
    more: (n) => "\u0435\u0449\u0451 " + n,
    open: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A \u0441\u0443\u0431\u0430\u0433\u0435\u043D\u0442\u043E\u0432",
    started: "\u043D\u0430\u0447\u0430\u043B(-\u0438) \u0440\u0430\u0431\u043E\u0442\u0443",
    running: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435",
    queued: "\u043E\u0436\u0438\u0434\u0430\u0435\u0442(-\u044E\u0442) \u0437\u0430\u043F\u0443\u0441\u043A\u0430",
    dispatched: "\u043F\u0435\u0440\u0435\u0434\u0430\u043D(-\u044B) \u0432 \u0440\u0430\u0431\u043E\u0442\u0443",
    completed: "\u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B(-\u0438) \u0440\u0430\u0431\u043E\u0442\u0443",
    failed: "\u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B(-\u0438) \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439",
    interrupted: "\u043F\u0440\u0435\u0440\u0432\u0430\u043B(-\u0438) \u0440\u0430\u0431\u043E\u0442\u0443",
    status: {
      running: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435",
      queued: "\u0412 \u043E\u0447\u0435\u0440\u0435\u0434\u0438",
      dispatched: "\u041F\u0435\u0440\u0435\u0434\u0430\u043D\u043E",
      completed: "\u0413\u043E\u0442\u043E\u0432\u043E",
      failed: "\u041E\u0448\u0438\u0431\u043A\u0430",
      interrupted: "\u041F\u0440\u0435\u0440\u0432\u0430\u043D\u043E"
    }
  },
  en: {
    title: "Subagents",
    fallback: "Subagent",
    more: (n) => n + " more",
    open: "Open subagents list",
    started: "started working",
    running: "Working",
    queued: "waiting to start",
    dispatched: "dispatched",
    completed: "finished",
    failed: "finished with errors",
    interrupted: "interrupted",
    status: {
      running: "Working",
      queued: "Queued",
      dispatched: "Dispatched",
      completed: "Done",
      failed: "Failed",
      interrupted: "Interrupted"
    }
  }
};
var language = () => document.documentElement.lang.toLowerCase().startsWith("ru") ? "ru" : "en";
var assetUrls = /* @__PURE__ */ new Map();
function avatarUrl(seed, dark2) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (31 * hash + seed.charCodeAt(i)) % 2147483647;
  const index = hash % agentAvatars.length;
  const key = index * 2 + Number(!dark2);
  if (!assetUrls.has(key)) {
    const svg = agentAvatars[index][dark2 ? 0 : 1];
    assetUrls.set(key, "data:image/svg+xml," + encodeURIComponent(svg));
  }
  return assetUrls.get(key);
}
function shortName(goal, fallback) {
  const name = goal || fallback;
  const chars = Array.from(name);
  return chars.length > 48 ? chars.slice(0, 47).join("") + "\u2026" : name;
}
function resultObject(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function settledStatus(value) {
  const status = tidy(value);
  if (!status || ["ok", "success", "completed"].includes(status)) return "completed";
  return ["interrupted", "cancelled", "canceled"].includes(status) ? "interrupted" : "failed";
}
function readCard(card, cardIndex) {
  const call = committedFiber(card)?.return?.memoizedProps;
  const callId = tidy(call?.toolCallId);
  const args = resultObject(call?.args);
  const result = resultObject(call?.result)?.results;
  const turnId = getPrompt(card.closest(pair));
  return [...card.children].flatMap((entry, index) => {
    const scaffold = entry.querySelector(":scope > [data-conversation-scaffold]");
    const button2 = scaffold?.querySelector(":scope > button");
    const glyph3 = scaffold?.firstElementChild;
    if (!button2 || !glyph3) return [];
    const goal = tidy(args?.tasks?.[index]?.goal || index === 0 && args?.goal) || tidy(button2.textContent);
    const native = committedFiber(entry)?.return?.memoizedProps?.row;
    const stored = Array.isArray(result) ? resultObject(result[index]) : null;
    const status = stored ? settledStatus(stored.status) : native?.status || (glyph3.querySelector('[role="status"]') ? "running" : glyph3.querySelector("svg.text-destructive") ? "failed" : glyph3.querySelector("svg[aria-label]") ? "completed" : "dispatched");
    const nativeSession = tidy(native?.sessionId);
    const childSession = tidy(stored?.child_session_id || stored?.session_id) || (!stored ? nativeSession : "");
    const seed = JSON.stringify(callId ? [callId, index] : [turnId, cardIndex, index, goal]);
    return [{
      id: seed,
      seed,
      nativeId: tidy(native?.id),
      nativeSession,
      goal,
      status,
      childSession,
      model: tidy(stored ? stored.model : native?.model),
      durationSeconds: duration(stored ? stored.duration_seconds : native?.durationSeconds),
      effort: tidy(stored?.reasoning_effort),
      summary: prose(stored?.summary) || prose(stored?.error),
      activity: noActivity,
      started: status === "running" || status === "completed",
      button: button2,
      canOpen: !button2.disabled && (!stored || Boolean(childSession && nativeSession === childSession))
    }];
  });
}
function applyStoredReceipts(rowsByCard) {
  for (const [target, heading] of [...document.querySelectorAll(surface + " " + transcript2 + " " + notice)].map((node2) => [node2, tidy(node2.querySelector("[data-conversation-scaffold] span.truncate")?.textContent)])) {
    const match = /^Subagent (Task|Tasks) (Completed|Failed|Interrupted|Cancelled|Timed Out): (.+)$/.exec(heading);
    if (!match) continue;
    const [, kind, outcome, text] = match;
    const batch = kind === "Tasks" && /^(.*) \((\d+) tasks\)$/.exec(text);
    if (kind === "Tasks" && !batch) continue;
    const goals = batch ? batch[1] : text;
    const count = batch ? Number(batch[2]) : 1;
    const matches = [...rowsByCard].filter(([card, entries]) => card.closest(transcript2) === target.closest(transcript2) && Boolean(card.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) && entries.length === count && entries.every((row2) => row2.status === "dispatched") && entries.map((row2) => row2.goal).join("; ") === goals);
    if (matches.length !== 1) continue;
    const receipt = committedFiber(target)?.return?.memoizedProps;
    const receiptButton = target.querySelector("[data-conversation-scaffold] button");
    const dateTime = target.querySelector("time[datetime]")?.dateTime;
    for (const row2 of matches[0][1]) {
      row2.started = true;
      row2.status = outcome === "Completed" ? "completed" : outcome === "Cancelled" || outcome === "Interrupted" ? "interrupted" : "failed";
      row2.finishedAt = dateTime ? timestamp(Date.parse(dateTime)) : void 0;
      if (count === 1 && !row2.summary) row2.summary = prose(receipt?.report);
      row2.receiptButton = receiptButton;
    }
  }
}
function eventStatus(event, previous) {
  if (event.type === "subagent.spawn_requested") return "queued";
  if (event.type === "subagent.start") return "running";
  if (event.type !== "subagent.complete") return previous?.started ? previous.status : "running";
  const value = event.payload.status;
  if (["completed", "ok", "success"].includes(value)) return "completed";
  if (["interrupted", "cancelled", "canceled"].includes(value)) return "interrupted";
  return "failed";
}
function eventActivity(event, previous) {
  const activity = previous?.activity || noActivity;
  const { payload, type } = event;
  const additions = [];
  if (type === "subagent.tool" || type === "subagent.progress") {
    const tool = tidy(payload.tool_name);
    const text = tidy(payload.tool_preview || payload.text);
    if (tool || text) additions.push(tool && text && tool !== text ? tool + " \xB7 " + text : text || tool);
  }
  if (type === "subagent.complete" && Array.isArray(payload.output_tail)) {
    for (const item of payload.output_tail) {
      const text = tidy(item?.preview);
      const tool = tidy(item?.tool);
      if (tool || text) additions.push([tool, text].filter(Boolean).join(" \xB7 "));
    }
  }
  const next = [...activity];
  for (const text of additions) {
    const line = text.slice(0, 1e3);
    if (next.at(-1) !== line) next.push(line);
  }
  return next.length === activity.length ? activity : next.slice(-24);
}
function activityRows(agents) {
  return ["started", "queued", "dispatched", "completed", "failed", "interrupted"].map((kind) => [
    kind,
    agents.filter((agent) => kind === "started" ? agent.started : agent.status === kind)
  ]).filter(([, list]) => list.length);
}
function activitySignature(agents, lang, dark2) {
  return JSON.stringify([lang, dark2, agents.map(({ id: id2, seed, goal, status, started }) => [id2, seed, goal, status, started])]);
}
function renderActivity(state, agents, lang, dark2) {
  const signature = activitySignature(agents, lang, dark2);
  if (signature === state.signature) return;
  state.signature = signature;
  const copy6 = labels3[lang];
  const format = new Intl.ListFormat(lang);
  const rows = activityRows(agents).map(([kind, list]) => {
    const row2 = document.createElement("span");
    row2.setAttribute("data-hcv-agent-activity", kind);
    const icons2 = document.createElement("span");
    icons2.setAttribute("data-hcv-agent-icons", "");
    icons2.setAttribute("aria-hidden", "true");
    const shown = list.length <= 3 ? list : list.slice(0, 2);
    for (const agent of shown) {
      const image = document.createElement("img");
      image.src = avatarUrl(agent.seed, dark2);
      image.alt = "";
      image.draggable = false;
      icons2.append(image);
    }
    const names2 = shown.map(({ goal }) => shortName(goal, copy6.fallback));
    if (list.length > shown.length) names2.push(copy6.more(list.length - shown.length));
    const sentence = document.createElement("span");
    sentence.textContent = format.format(names2) + " " + copy6[kind];
    sentence.title = format.format(list.map(({ goal }) => goal || copy6.fallback)) + " " + copy6[kind];
    row2.append(icons2, sentence);
    return row2;
  });
  state.rows.replaceChildren(...rows);
}
function enhanceCard(card, id2, expanded, key) {
  const rows = document.createElement("button");
  rows.type = "button";
  rows.setAttribute("data-hcv-agent-rows", "");
  const assigned = !card.id;
  if (assigned) card.id = "hcv-delegate-" + id2;
  const assignedId = card.id;
  rows.setAttribute("aria-expanded", String(expanded.has(key)));
  rows.setAttribute("aria-controls", assignedId);
  rows.addEventListener("click", () => {
    const open = rows.getAttribute("aria-expanded") !== "true";
    rows.setAttribute("aria-expanded", String(open));
    if (open) expanded.add(key);
    else expanded.delete(key);
    if (expanded.size > 100) expanded.delete(expanded.values().next().value);
  });
  card.before(rows);
  return { rows, remove() {
    rows.remove();
    if (assigned && card.id === assignedId) card.removeAttribute("id");
  } };
}
function localWatchProfile(agent, scope2) {
  if (!agent.lifecycleChild || !agent.childSession || !scope2 || typeof window.hermesDesktop?.openSessionWindow !== "function") return null;
  const [connection, owner, parent] = JSON.parse(scope2);
  return connection === "local" && agent.childSession !== parent ? owner : null;
}
function nativeActions(agent, scope2) {
  return [
    (agent.canOpen || localWatchProfile(agent, scope2)) && "native",
    agent.receiptButton && "receipt"
  ].filter(Boolean);
}
function openNativeAgent(agent, scope2, action = "native") {
  if (!scope2 || scope2 !== scopeKey(host6.state.activeSessionId.get(), host6.state.connectionId.get(), host6.state.profile.get())) return;
  if (action === "native") {
    if (agent.canOpen && agent.button?.isConnected && !agent.button.disabled) {
      agent.button.click();
      return;
    }
    const owner = localWatchProfile(agent, scope2);
    if (owner) {
      const errorTitle = language() === "ru" ? "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u043E\u0441\u0442\u0438 \u0441\u0443\u0431\u0430\u0433\u0435\u043D\u0442\u0430" : "Could not open subagent details";
      void window.hermesDesktop.openSessionWindow(agent.childSession, { profile: owner, watch: true }).then((result) => {
        if (!result?.ok) throw new Error(result?.error || errorTitle);
      }).catch((error) => host6.notifyError(error, errorTitle));
      return;
    }
  }
  const receipt = agent.receiptButton;
  if (receipt?.isConnected) {
    if (receipt.getAttribute("aria-expanded") !== "true") receipt.click();
    receipt.scrollIntoView({ block: "nearest" });
  }
}
function useScopedRoster(roster) {
  const value = useValue(roster);
  const session = useValue(host6.state.activeSessionId);
  const connection = useValue(host6.state.connectionId);
  const name = useValue(host6.state.profile);
  const scope2 = scopeKey(session, connection, name);
  return value.scope === scope2 ? value : { ...value, scope: scope2, agents: [] };
}
function SubagentsPane({ roster }) {
  const value = useScopedRoster(roster);
  const gateway = useValue(host6.state.gateway);
  useEffect4(() => {
    if (value.scope && gateway === "open") void roster.refresh(value.scope);
  }, [roster, value.scope, gateway]);
  return h5(AgentPane, { ...value, key: value.scope ?? "draft", avatarUrl, nativeActions, openNativeAgent });
}
function SummarySubagents({ roster, onExpand }) {
  const value = useScopedRoster(roster);
  if (!value.agents.length) return null;
  const { agents, lang, dark: dark2 } = value;
  const copy6 = labels3[lang];
  const working = agents.filter(isActive);
  const done = agents.filter(({ status }) => status === "completed");
  const other = agents.filter(({ status }) => status === "dispatched");
  const issues = agents.filter(({ status }) => status === "failed" || status === "interrupted");
  const preview = (working.length ? working : done.length ? done : other.length ? other : issues).slice(0, 4);
  const counts = [
    [copy6.running, working],
    [copy6.status.completed, done],
    [copy6.status.dispatched, other],
    [lang === "ru" ? "\u041E\u0448\u0438\u0431\u043A\u0438 \u0438 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438" : "Errors and interruptions", issues]
  ].filter(([, list]) => list.length).map(([label, list]) => label + ": " + list.length);
  const image = (agent) => h5("img", { key: agent.id, src: avatarUrl(agent.seed, dark2), alt: "", draggable: false });
  const previewContent = [
    h5("span", { key: "avatars", "data-hcv-agent-icons": "", "aria-hidden": true }, preview.map(image)),
    h5("span", { key: "status", role: "status", "data-hcv-agent-counts": "" }, counts.join(" \xB7 "))
  ];
  return h5(
    "section",
    { "data-hcv-summary-agents": "", "aria-label": copy6.title },
    h5("div", { "data-hcv-agents-heading": "" }, copy6.title),
    onExpand ? h5("button", {
      type: "button",
      className: "hcv-context-row",
      title: copy6.open,
      "aria-label": copy6.open,
      "data-hcv-open-subagents": "",
      onClick: onExpand
    }, previewContent) : h5(
      "details",
      { key: value.scope },
      h5("summary", { className: "hcv-context-row" }, previewContent),
      h5("ul", null, agents.map((agent) => {
        const name = agent.goal || copy6.fallback;
        const info = h5(
          "span",
          { "data-hcv-agent-info": "" },
          h5("span", { title: name }, name),
          h5("small", null, copy6.status[agent.status])
        );
        return h5(
          "li",
          { key: agent.id },
          agent.canOpen ? h5("button", { type: "button", onClick: () => openNativeAgent(agent, value.scope) }, image(agent), info) : h5("div", null, image(agent), info)
        );
      }))
    )
  );
}
function css(active2) {
  const chat2 = active2 + " " + surface;
  const card = active2 + " [data-hcv-context-card] [data-hcv-summary-agents]";
  const rows = chat2 + " " + generated;
  return [
    "@media (forced-colors: none) {",
    rows + ":is(button) { display: grid; inline-size: 100%; gap: 4px; min-inline-size: 0; border-radius: 6px; text-align: start; cursor: pointer; }",
    rows + ":is(div) { display: grid; gap: 4px; }",
    rows + '[aria-expanded="false"] + ' + delegate + " { display: none; }",
    rows + " [data-hcv-agent-activity] { display: flex; align-items: baseline; gap: 6px; min-block-size: 24px; color: var(--hcv-muted); font-size: var(--conversation-text-font-size); line-height: var(--conversation-line-height); }",
    rows + " [data-hcv-agent-activity] > span:last-child { min-inline-size: 0; overflow-wrap: anywhere; }",
    rows + ":hover [data-hcv-agent-activity], " + rows + ":focus-visible [data-hcv-agent-activity] { color: var(--hcv-text); }",
    active2 + " [data-hcv-agent-icons] { display: inline-flex; flex: none; align-items: center; align-self: flex-start; gap: 4px; min-block-size: var(--conversation-line-height, 21px); }",
    active2 + " [data-hcv-agent-icons] img, " + card + " li img { inline-size: .875rem; block-size: .875rem; flex: none; }",
    card + " { border-block-start: 1px solid color-mix(in srgb, var(--hcv-muted) 14%, transparent); margin-block-start: 6px; padding-block-start: 7px; color: var(--hcv-muted); }",
    card + " [data-hcv-agents-heading] { min-block-size: 28px; display: flex; align-items: center; font-size: 12px; }",
    card + " summary { position: relative; color: var(--hcv-muted); list-style: none; cursor: pointer; gap: 6px; }",
    card + " summary::-webkit-details-marker { display: none; }",
    card + " [data-hcv-agent-icons] { align-self: center; }",
    card + " [data-hcv-agent-counts] { min-inline-size: 0; }",
    card + ' summary::after { content: ""; margin-inline-start: auto; flex: none; inline-size: 12px; block-size: 12px; background: currentColor; mask: ' + codexMask("down") + " center / contain no-repeat; opacity: 0; }",
    card + ' [data-hcv-open-subagents]::after { content: ""; margin-inline-start: auto; flex: none; inline-size: 16px; block-size: 16px; background: currentColor; mask: ' + codexMask("right") + " center / contain no-repeat; }",
    card + " summary:is(:hover, :focus-visible)::after, " + card + " details[open] > summary::after { opacity: 1; }",
    card + " details[open] > summary::after { rotate: 180deg; }",
    card + " ul { max-block-size: min(30vh, 220px); overflow-y: auto; overscroll-behavior: contain; margin: 4px 0 0; }",
    card + " li > :is(div, button) { display: flex; gap: 8px; align-items: center; inline-size: 100%; padding: 4px; border-radius: 6px; text-align: start; }",
    card + " :is(button, summary):hover { background: var(--hcv-hover); color: var(--hcv-text); }",
    card + " [data-hcv-agent-info] { display: grid; min-inline-size: 0; gap: 1px; }",
    card + " [data-hcv-agent-info] > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }",
    card + " small { font-size: 11px; }",
    rows + ":focus-visible, " + card + " :is(button, summary):focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }",
    "}"
  ].join("\n") + agentPaneStyles(active2);
}
function registerSubagents(ctx, active2) {
  const empty = { scope: null, agents: [], lang: "en", dark: false };
  const roster = Object.assign(atom(empty), { refresh });
  const root = document.documentElement;
  const contrast = matchMedia("(forced-colors: none)");
  const enabled = () => root.matches(active2);
  const getScope = () => scopeKey(host6.state.activeSessionId.get(), host6.state.connectionId.get(), host6.state.profile.get());
  const sheet = document.createElement("style");
  sheet.setAttribute("data-hcv-subagents-style", "");
  sheet.textContent = css(active2);
  document.head.append(sheet);
  const cards = /* @__PURE__ */ new Map();
  const expanded = /* @__PURE__ */ new Set();
  const runtimeAgents = /* @__PURE__ */ new Map();
  const extra = /* @__PURE__ */ new Map();
  let nextId = 0;
  let frame = 0;
  let rosterSignature = "";
  let snapshot = null;
  let reading = null;
  let disposed = false;
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(reconcile);
  };
  async function refresh(scope2) {
    if (disposed || scope2 !== getScope() || !enabled() || reading?.scope === scope2) return;
    const request = { scope: scope2 };
    reading = request;
    try {
      const result = await host6.request("subagent.list", { session_id: host6.state.activeSessionId.get() }, 5e3);
      if (disposed || reading !== request || scope2 !== getScope() || !Array.isArray(result?.subagents)) return;
      const agents = /* @__PURE__ */ new Map();
      for (const item of result.subagents) {
        const id2 = tidy(item?.subagent_id);
        if (!id2 || !["running", "queued"].includes(item.status)) continue;
        const tool = tidy(item.last_tool);
        agents.set(id2, {
          id: id2,
          seed: id2,
          goal: tidy(item.goal),
          status: item.status,
          started: item.status === "running",
          startedAt: timestamp(item.started_at),
          model: tidy(item.model),
          activity: tool ? [tool] : noActivity
        });
      }
      snapshot = { scope: scope2, agents };
      queue();
    } catch {
    } finally {
      if (reading === request) reading = null;
    }
  }
  for (const type of ["subagent.spawn_requested", "subagent.start", "subagent.tool", "subagent.progress", "subagent.complete"]) {
    ctx.onEvent(type, (event) => {
      if (!event.session_id || !event.payload || !enabled()) return;
      const scope2 = scopeKey(
        event.session_id,
        event.connectionId || host6.state.connectionId.get(),
        event.profile || host6.state.profile.get()
      );
      if (scope2 !== getScope() && !(event.connectionId && event.profile)) return;
      const payload = event.payload;
      const goal = tidy(payload.goal);
      const id2 = tidy(payload.subagent_id) || JSON.stringify([payload.delegation_id, payload.parent_id, payload.task_index, goal]);
      if (!tidy(payload.subagent_id) && !goal) return;
      const list = runtimeAgents.get(scope2) || /* @__PURE__ */ new Map();
      const previous = list.get(id2);
      if (previous && (final(previous.status) || event.seq != null && previous.seq >= event.seq)) return;
      const status = eventStatus(event, previous);
      if (previous?.started && status === "queued") return;
      const turn = previous?.turn || (scope2 === getScope() ? getPrompt([...document.querySelectorAll(primary + " " + transcript2 + " " + pair)].at(-1)) : null);
      const time = timestamp(event.timestamp) ?? (event.replayed ? void 0 : Date.now());
      const childSession = tidy(payload.child_session_id) || previous?.childSession;
      list.set(id2, {
        id: id2,
        goal: goal || previous?.goal || "",
        seed: id2,
        turn,
        status,
        cardId: previous?.cardId,
        seq: event.seq ?? previous?.seq,
        started: previous?.started || status === "running" || status === "completed",
        startedAt: previous?.startedAt ?? (status === "running" ? time : void 0),
        finishedAt: final(status) ? time : void 0,
        updatedAt: time ?? previous?.updatedAt,
        model: tidy(payload.model) || previous?.model,
        childSession,
        lifecycleChild: Boolean(childSession),
        effort: tidy(payload.reasoning_effort) || previous?.effort,
        durationSeconds: duration(payload.duration_seconds) ?? previous?.durationSeconds,
        summary: prose(payload.summary) || (final(status) ? prose(payload.text) : "") || previous?.summary,
        activity: eventActivity(event, previous)
      });
      if (list.size > 200) list.delete(list.keys().next().value);
      runtimeAgents.delete(scope2);
      runtimeAgents.set(scope2, list);
      if (runtimeAgents.size > 32) runtimeAgents.delete(runtimeAgents.keys().next().value);
      queue();
    });
  }
  function reconcile() {
    frame = 0;
    const on = enabled();
    const dark2 = root.dataset.hermesMode === "dark";
    const lang = language();
    const scope2 = on ? getScope() : null;
    if (snapshot?.scope !== scope2) snapshot = null;
    const observed = runtimeAgents.get(scope2);
    const live = snapshot ? new Map([...snapshot.agents, ...observed || []]) : observed;
    const claimed = /* @__PURE__ */ new Set();
    const activeCards = new Set(on ? document.querySelectorAll(surface + " " + transcript2 + " " + delegate) : []);
    const enhance = on && contrast.matches;
    for (const [card, state] of cards) {
      if (!activeCards.has(card)) {
        state.remove();
        cards.delete(card);
      }
    }
    const indexInTurn = /* @__PURE__ */ new Map();
    const rowsByCard = /* @__PURE__ */ new Map();
    for (const card of activeCards) {
      const turn = card.closest(pair);
      const index = indexInTurn.get(turn) ?? 0;
      indexInTurn.set(turn, index + 1);
      rowsByCard.set(card, readCard(card, index));
    }
    if (rowsByCard.size) applyStoredReceipts(rowsByCard);
    const agentsById = /* @__PURE__ */ new Map();
    for (const [card, entries] of rowsByCard) {
      const inPrimary = Boolean(card.closest(primary));
      const promptId = inPrimary && getPrompt(card.closest(pair));
      if (inPrimary && live) {
        for (const row2 of entries) {
          const available = (agent) => agent && !claimed.has(agent.id) && (agent.cardId === row2.id || !agent.cardId && (agent.turn ? agent.turn === promptId : !final(row2.status)));
          const sameId = live.get(row2.nativeId);
          const matched = available(sameId) ? sameId : [...live.values()].find((agent) => available(agent) && (agent.cardId === row2.id || promptId && agent.turn === promptId && agent.goal === row2.goal));
          if (!matched) continue;
          matched.cardId = row2.id;
          claimed.add(matched.id);
          row2.id = matched.id;
          row2.started ||= matched.started;
          if (final(matched.status) || !final(row2.status)) row2.status = matched.status;
          row2.startedAt = matched.startedAt;
          row2.finishedAt = matched.finishedAt ?? row2.finishedAt;
          row2.updatedAt = matched.updatedAt;
          row2.model ||= matched.model;
          row2.childSession = matched.childSession || row2.childSession;
          row2.lifecycleChild = matched.lifecycleChild;
          row2.canOpen = !row2.button.disabled && Boolean(row2.childSession && row2.nativeSession === row2.childSession);
          row2.effort ||= matched.effort;
          row2.durationSeconds ??= matched.durationSeconds;
          row2.summary ||= matched.summary;
          row2.activity = matched.activity;
        }
      }
      if (inPrimary) for (const row2 of entries) agentsById.set(row2.id, row2);
      if (!enhance || !entries.length) {
        cards.get(card)?.remove();
        cards.delete(card);
        continue;
      }
      if (!cards.has(card)) {
        const owner = inPrimary ? scope2 : card.closest(surface)?.dataset.composerSurfaceId;
        const key = JSON.stringify([owner, entries.map(({ seed }) => seed)]);
        cards.set(card, enhanceCard(card, ++nextId, expanded, key));
      }
      const state = cards.get(card);
      if (state.rows.nextElementSibling !== card) card.before(state.rows);
      renderActivity(state, entries, lang, dark2);
    }
    const withoutCard = live ? [...live.values()].filter((agent) => !claimed.has(agent.id)) : [];
    const agents = [...agentsById.values(), ...withoutCard];
    const groups2 = /* @__PURE__ */ new Map();
    if (enhance && withoutCard.length) {
      const turns = new Map([...document.querySelectorAll(primary + " " + transcript2 + " " + pair)].map((turn) => [getPrompt(turn), turn]));
      for (const agent of withoutCard) {
        const group = agent.turn && turns.get(agent.turn)?.querySelector(":scope > " + response);
        if (group) groups2.set(group, [...groups2.get(group) || [], agent]);
      }
    }
    for (const [group, state] of extra) {
      if (!groups2.has(group)) {
        state.rows.remove();
        extra.delete(group);
      }
    }
    for (const [group, entries] of groups2) {
      if (!extra.has(group)) {
        const rows = document.createElement("div");
        rows.setAttribute("data-hcv-agent-rows", "");
        group.append(rows);
        extra.set(group, { rows });
      }
      renderActivity(extra.get(group), entries, lang, dark2);
    }
    const signature = scope2 + activitySignature(agents, lang, dark2);
    const prior = roster.get().agents;
    if (signature !== rosterSignature || agents.some((agent, i) => {
      const old = prior[i];
      return !old || agent.button !== old.button || agent.canOpen !== old.canOpen || agent.model !== old.model || agent.childSession !== old.childSession || agent.lifecycleChild !== old.lifecycleChild || agent.effort !== old.effort || agent.summary !== old.summary || agent.startedAt !== old.startedAt || agent.finishedAt !== old.finishedAt || agent.updatedAt !== old.updatedAt || agent.durationSeconds !== old.durationSeconds || agent.activity !== old.activity || agent.receiptButton !== old.receiptButton;
    })) {
      rosterSignature = signature;
      roster.set({ scope: scope2, agents, lang, dark: dark2 });
    }
  }
  const observer = new MutationObserver((records) => {
    const relevant = [delegate, primary, pair, response, notice].join(", ");
    if (records.some(({ target, type, addedNodes, removedNodes }) => {
      if (target === root) return true;
      if (!enabled()) return false;
      const element4 = target instanceof Element ? target : target.parentElement;
      if (!element4 || element4.closest(generated)) return false;
      if (element4.closest(delegate)) return true;
      if (type !== "childList") return false;
      return [...addedNodes, ...removedNodes].some((node2) => node2 instanceof Element && !node2.matches(generated) && (node2.matches(relevant) || node2.querySelector(relevant)));
    })) queue();
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "disabled", "data-hermes-theme", "data-hermes-mode", "data-hermes-codex-visual", "lang"]
  });
  const unsubscribers = [host6.state.activeSessionId, host6.state.connectionId, host6.state.profile].map((state) => state.subscribe(queue));
  contrast.addEventListener("change", queue);
  ctx.onDispose(() => {
    disposed = true;
    observer.disconnect();
    for (const unsubscribe of unsubscribers) unsubscribe();
    contrast.removeEventListener("change", queue);
    cancelAnimationFrame(frame);
    for (const state of cards.values()) state.remove();
    for (const state of extra.values()) state.rows.remove();
    roster.set(empty);
    sheet.remove();
  });
  queue();
  return roster;
}

// source/summary-panes.js
import {
  atom as atom2,
  DropdownMenu as DropdownMenu3,
  DropdownMenuContent as DropdownMenuContent3,
  DropdownMenuItem as DropdownMenuItem3,
  DropdownMenuSeparator,
  DropdownMenuTrigger as DropdownMenuTrigger3,
  host as host7,
  useI18n as useI18n2,
  useValue as useValue2
} from "@hermes/plugin-sdk";
import { createElement as h6 } from "react";
var workspacePrefix = "hermes-codex-visual-summary-";
var panePrefix = "plugin-workspace:" + workspacePrefix;
var names = {
  ru: { agents: "\u0421\u0443\u0431\u0430\u0433\u0435\u043D\u0442\u044B", sources: "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438", changes: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F", files: "\u0424\u0430\u0439\u043B\u044B \u043F\u0440\u043E\u0435\u043A\u0442\u0430", add: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432\u043A\u043B\u0430\u0434\u043A\u0443" },
  en: { agents: "Subagents", sources: "Sources", changes: "Changes", files: "Project files", add: "Add tab" }
};
var glyphs2 = { agents: "bots", sources: "summarySources", changes: "changes", files: "folder" };
var copy = (locale) => names[locale?.split("-")[0]] || names.en;
var paneId = (kind) => panePrefix + kind;
var paneTab = (kind) => '[data-tree-tab="' + paneId(kind) + '"]';
function icon3(kind) {
  const glyph3 = glyphs2[kind];
  return h6("span", { "aria-hidden": true, "data-hcv-icon": glyph3, style: codexIconStyle(glyph3) });
}
function Picker({ state, open }) {
  const menu = useValue2(state);
  const { locale } = useI18n2();
  if (!menu) return null;
  const select = (kind) => () => open(kind);
  return h6(
    DropdownMenu3,
    { open: true, onOpenChange: (value) => {
      if (!value) state.set(null);
    } },
    h6(DropdownMenuTrigger3, { asChild: true }, h6("span", {
      "aria-hidden": true,
      tabIndex: -1,
      style: { position: "fixed", pointerEvents: "none", ...menu.rect }
    })),
    h6(
      DropdownMenuContent3,
      {
        align: "start",
        sideOffset: 4,
        "data-hcv-summary-picker": "",
        onCloseAutoFocus: (event) => {
          event.preventDefault();
          if (menu.trigger.isConnected) menu.trigger.focus({ preventScroll: true });
        }
      },
      ...["agents", "sources"].map((kind) => h6(
        DropdownMenuItem3,
        { key: kind, onSelect: select(kind) },
        icon3(kind),
        copy(locale)[kind]
      )),
      h6(DropdownMenuSeparator),
      ...["changes", "files"].map((kind) => h6(
        DropdownMenuItem3,
        { key: kind, onSelect: select(kind) },
        icon3(kind),
        copy(locale)[kind]
      ))
    )
  );
}
function registerSummaryPanes(ctx, active2, views) {
  const menu = atom2(null);
  const registrations = /* @__PURE__ */ new Map();
  const open = (kind) => {
    if (kind === "files") {
      host7.revealPane("files");
      return;
    }
    const render = views[kind];
    if (!render || !document.documentElement.matches(active2) || typeof host7.openWorkspace !== "function") return;
    const id2 = paneId(kind);
    if (registrations.has(kind)) {
      host7.revealPane(id2);
      return;
    }
    const sibling = [...registrations.keys()].find((key) => document.querySelector(paneTab(key) + '[aria-selected="true"]')) || [...registrations.keys()].find((key) => document.querySelector(paneTab(key)));
    const dock2 = sibling ? { pane: paneId(sibling), pos: "center" } : { pane: "workspace", pos: "right" };
    const dispose = host7.openWorkspace(workspacePrefix + kind, {
      dock: dock2,
      minWidth: "280px",
      title: copy(document.documentElement.lang)[kind],
      render: () => h6("div", { "data-hcv-summary-pane": kind }, render()),
      onClose: () => registrations.delete(kind)
    });
    registrations.set(kind, dispose);
    queue();
  };
  const plus = document.createElement("button");
  plus.type = "button";
  plus.dataset.hcvSummaryAddTab = "";
  plus.addEventListener("pointerdown", (event) => event.stopPropagation());
  plus.addEventListener("click", () => {
    const { x, y, width, height } = plus.getBoundingClientRect();
    menu.set({ trigger: plus, rect: { left: x, top: y, width, height } });
  });
  let frame = 0;
  function queue() {
    if (!frame) frame = requestAnimationFrame(syncStrip);
  }
  function syncStrip() {
    frame = 0;
    const selected = document.querySelector('[data-tree-tab^="' + panePrefix + '"][aria-selected="true"]');
    const list = selected?.closest("[data-zone-tabstrip]")?.querySelector('[role="tablist"]');
    if (!list || !document.documentElement.matches(active2)) {
      plus.remove();
      return;
    }
    plus.setAttribute("aria-label", copy(document.documentElement.lang).add);
    if (plus.parentNode !== list || plus !== list.lastElementChild) list.append(plus);
  }
  const close = () => {
    menu.set(null);
    for (const dispose of registrations.values()) dispose();
    registrations.clear();
    plus.remove();
  };
  const observer = new MutationObserver(() => {
    if (!document.documentElement.matches(active2)) close();
    else queue();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hermes-theme", "lang"] });
  const stripObserver = new MutationObserver(queue);
  stripObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  const tab = active2 + ' [data-tree-tab^="' + panePrefix + '"]';
  const style = document.createElement("style");
  style.dataset.hcvSummaryPanes = "";
  style.textContent = [
    "@media (forced-colors: none) {",
    active2 + " [data-hcv-summary-pane] { height: 100%; min-height: 0; min-width: 0; overflow: hidden; background: var(--hcv-chat); color: var(--hcv-text); font: 13px/20px var(--hcv-ui-font); }",
    tab + " { flex: 0 1 204px; min-inline-size: 72px; min-block-size: 28px; border-radius: 8px; font: 13px/20px var(--hcv-ui-font); }",
    tab + '[aria-selected="true"] { background: var(--hcv-selected); box-shadow: inset 0 0 0 .5px var(--hcv-hairline); }',
    ...Object.keys(views).map((kind) => active2 + " " + paneTab(kind) + ' .pane-tab-content::before { content: ""; display: inline-block; inline-size: 16px; block-size: 16px; flex: none; margin-inline-start: 8px; background: currentColor; mask: ' + codexIconStyle(glyphs2[kind]).mask + "; }"),
    active2 + " [data-hcv-summary-picker] [data-hcv-icon] { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; }",
    active2 + " [data-hcv-summary-add-tab] { -webkit-app-region: no-drag; align-self: center; flex: none; inline-size: 24px; block-size: 24px; margin-inline-start: 4px; border-radius: 8px; color: var(--hcv-muted); }",
    active2 + ' [data-hcv-summary-add-tab]::before { content: ""; display: inline-block; inline-size: 14px; block-size: 14px; vertical-align: middle; background: currentColor; mask: ' + codexIconStyle("plus").mask + "; }",
    active2 + " [data-hcv-summary-add-tab]:hover { background: var(--hcv-hover); color: var(--hcv-text); }",
    active2 + " [data-hcv-summary-picker] { min-inline-size: 170px; }",
    "}"
  ].join("\n");
  document.head.append(style);
  ctx.onDispose(() => {
    observer.disconnect();
    stripObserver.disconnect();
    if (frame) cancelAnimationFrame(frame);
    close();
    style.remove();
  });
  return {
    open,
    visibility: {
      agents: host7.paneVisibility(paneId("agents")),
      sources: host7.paneVisibility(paneId("sources")),
      changes: host7.paneVisibility(paneId("changes"))
    },
    renderPicker: () => h6(Picker, { state: menu, open })
  };
}

// source/summary-changes.js
import { useI18n as useI18n3 } from "@hermes/plugin-sdk";
import { createElement as h7, useEffect as useEffect5, useId as useId2, useState as useState5 } from "react";
var labels4 = {
  ru: {
    title: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0431\u0435\u0437 \u043A\u043E\u043C\u043C\u0438\u0442\u0430",
    refresh: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
    loading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026",
    noProject: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442",
    empty: "\u041D\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439",
    unavailable: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439",
    noDiff: "\u041D\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0439 \u0434\u043B\u044F \u043F\u043E\u043A\u0430\u0437\u0430",
    diffError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0444\u0430\u0439\u043B\u0430"
  },
  en: {
    title: "Uncommitted changes",
    refresh: "Refresh",
    loading: "Loading\u2026",
    noProject: "Select a project",
    empty: "No changes",
    unavailable: "Could not read changed files",
    noDiff: "No changes to display",
    diffError: "Could not open the file diff"
  }
};
async function readReview(route, cwd, connectionId, profile2, params) {
  const query = new URLSearchParams({ path: cwd, scope: "uncommitted", ...params });
  return window.hermesDesktop.api({
    connectionId,
    profile: profile2,
    method: "GET",
    path: "/api/git/review/" + route + "?" + query,
    timeoutMs: 15e3
  });
}
function icon4(glyph3) {
  return h7("span", { "aria-hidden": true, className: "hcv-changes-icon", style: codexIconStyle(glyph3) });
}
function DiffText({ text }) {
  if (text.length > 15e4) return h7("pre", { "data-hcv-change-diff": "", tabIndex: 0 }, text);
  return h7("pre", { "data-hcv-change-diff": "", tabIndex: 0 }, text.split("\n").map((line, index, lines) => {
    const type = line.startsWith("@@") ? "hunk" : line.startsWith("+") && !line.startsWith("+++ ") ? "added" : line.startsWith("-") && !line.startsWith("--- ") ? "removed" : void 0;
    return h7("span", { key: index, "data-hcv-diff-line": type }, index < lines.length - 1 ? line + "\n" : line);
  }));
}
function FileDiff({ id: id2, cwd, connectionId, profile: profile2, path, staged, copy: copy6 }) {
  const [result, setResult] = useState5(null);
  useEffect5(() => {
    let live = true;
    void readReview("diff", cwd, connectionId, profile2, { file: path, staged: String(staged) }).then(
      (value) => {
        if (live) setResult(typeof value?.diff === "string" ? { text: value.diff } : {});
      },
      () => {
        if (live) setResult({});
      }
    );
    return () => {
      live = false;
    };
  }, [cwd, connectionId, profile2, path, staged]);
  return h7("div", { id: id2, className: "hcv-change-detail" }, result?.text ? h7(DiffText, { text: result.text }) : h7("p", { role: "status" }, !result ? copy6.loading : result.text === "" ? copy6.noDiff : copy6.diffError));
}
function RepositoryChanges({ cwd, connectionId, profile: profile2, copy: copy6 }) {
  const diffId = useId2();
  const [revision, setRevision] = useState5(0);
  const [result, setResult] = useState5(null);
  const [selected, setSelected] = useState5(null);
  useEffect5(() => {
    let live = true;
    void readReview("list", cwd, connectionId, profile2).then((value) => {
      const files = Array.isArray(value?.files) ? value.files.filter((file) => typeof file?.path === "string" && file.path) : null;
      if (live) setResult({ revision, files });
    }, () => {
      if (live) setResult({ revision, files: null });
    });
    return () => {
      live = false;
    };
  }, [cwd, connectionId, profile2, revision]);
  const current = result?.revision === revision ? result : null;
  return h7(
    "div",
    { className: "hcv-changes-content" },
    h7(
      "header",
      { className: "hcv-changes-header" },
      h7("span", null, copy6.title),
      h7("button", {
        type: "button",
        className: "hcv-changes-refresh",
        "aria-label": copy6.refresh,
        title: copy6.refresh,
        onClick: () => {
          setSelected(null);
          setRevision((value) => value + 1);
        }
      }, icon4("refresh"))
    ),
    current?.files?.length ? h7("ul", { "aria-label": copy6.title }, current.files.map((file) => {
      const open = selected === file.path;
      return h7(
        "li",
        { key: file.path, "data-hcv-changed-file": "" },
        h7(
          "button",
          {
            type: "button",
            className: "hcv-changes-file",
            title: file.path,
            "aria-label": file.path,
            "aria-expanded": open,
            "aria-controls": open ? diffId : void 0,
            onClick: () => setSelected((previous) => previous === file.path ? null : file.path)
          },
          icon4(open ? "down" : "right"),
          icon4("artifacts"),
          h7("span", { className: "hcv-changes-path", dir: "auto" }, file.path),
          h7(
            "span",
            { className: "hcv-changes-counts" },
            h7("span", { "data-hcv-count": "added" }, "+" + (file.added || 0)),
            h7("span", { "data-hcv-count": "removed" }, "\u2212" + (file.removed || 0))
          )
        ),
        open && h7(FileDiff, { id: diffId, cwd, connectionId, profile: profile2, path: file.path, staged: file.staged === true, copy: copy6 })
      );
    })) : h7(
      "p",
      { className: "hcv-changes-status", role: "status" },
      !current ? copy6.loading : current.files ? copy6.empty : copy6.unavailable
    )
  );
}
function ChangesPane({ cwd, scope: scope2 }) {
  const { locale } = useI18n3();
  const copy6 = labels4[locale] || labels4.en;
  const connectionId = scope2?.connectionId;
  const profile2 = scope2?.profile;
  return h7("div", { "data-hcv-changes-pane": "" }, cwd && connectionId && profile2 ? h7(RepositoryChanges, { key: JSON.stringify([cwd, connectionId, profile2]), cwd, connectionId, profile: profile2, copy: copy6 }) : h7("p", { className: "hcv-changes-status", role: "status" }, copy6.noProject));
}
function registerSummaryChanges(ctx, active2) {
  const pane = `${active2} [data-hcv-changes-pane]`;
  const style = document.createElement("style");
  style.dataset.hcvSummaryChanges = "";
  style.textContent = `
    ${pane} { block-size: 100%; min-block-size: 0; overflow: auto; background: var(--hcv-chat); color: var(--hcv-text); font: 13px/20px var(--hcv-ui-font); }
    ${pane} .hcv-changes-content { padding: 12px 16px 16px; }
    ${pane} .hcv-changes-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-block-size: 28px; margin-block-end: 8px; color: var(--hcv-muted); }
    ${pane} ul { list-style: none; margin: 0; padding: 0; }
    ${pane} li + li { margin-block-start: 2px; }
    ${pane} button { border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
    ${pane} button:focus-visible, ${pane} pre:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
    ${pane} .hcv-changes-icon { display: inline-block; inline-size: 16px; block-size: 16px; flex: none; }
    ${pane} .hcv-changes-refresh { display: grid; place-items: center; inline-size: 24px; block-size: 24px; padding: 0; border-radius: 7px; }
    ${pane} .hcv-changes-file { display: flex; align-items: center; gap: 8px; inline-size: 100%; min-block-size: 28px; padding: 4px 8px; border-radius: 8px; text-align: start; }
    ${pane} button:hover, ${pane} .hcv-changes-file[aria-expanded="true"] { background: var(--hcv-hover); }
    ${pane} .hcv-changes-path { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    ${pane} .hcv-changes-counts { display: flex; gap: 6px; font-variant-numeric: tabular-nums; }
    ${pane} :is([data-hcv-count="added"], [data-hcv-diff-line="added"]) { color: light-dark(#008241, #40c977); }
    ${pane} :is([data-hcv-count="removed"], [data-hcv-diff-line="removed"]) { color: light-dark(#aa2626, #f28080); }
    ${pane} [data-hcv-diff-line="hunk"] { color: var(--hcv-muted); }
    ${pane} .hcv-change-detail { margin: 4px 0 8px; overflow: hidden; border: 1px solid var(--hcv-hairline); border-radius: 8px; }
    ${pane} .hcv-change-detail p { padding: 8px 12px; margin: 0; color: var(--hcv-muted); }
    ${pane} [data-hcv-change-diff] { max-block-size: min(55dvh, 480px); overflow: auto; margin: 0; padding: 8px 12px; font: 12px/18px var(--hcv-mono-font, ui-monospace, monospace); tab-size: 4; }
    ${pane} .hcv-changes-status { margin: 12px 16px; color: var(--hcv-muted); }
    ${pane} .hcv-changes-content .hcv-changes-status { margin-inline: 0; }
  `;
  document.head.append(style);
  ctx.onDispose(() => style.remove());
}

// source/workspace-actions.js
import {
  atom as atom3,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  host as host8,
  Input,
  TITLEBAR_AREAS as TITLEBAR_AREAS2,
  useValue as useValue3
} from "@hermes/plugin-sdk";
import { createElement as h8, useEffect as useEffect6, useRef as useRef4, useState as useState6 } from "react";
var labels5 = {
  ru: {
    terminalFailed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B \u0432 \u043F\u0430\u043F\u043A\u0435 \u0447\u0430\u0442\u0430.",
    toTree: "\u041F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0432 \u0440\u0430\u0431\u043E\u0447\u0435\u0435 \u0434\u0435\u0440\u0435\u0432\u043E",
    toMain: "\u041F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0432 \u043E\u0441\u043D\u043E\u0432\u043D\u0443\u044E \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043A\u043E\u043F\u0438\u044E",
    select: "\u041A\u0443\u0434\u0430 \u043F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0447\u0430\u0442",
    newTree: "\u041D\u043E\u0432\u043E\u0435 \u0440\u0430\u0431\u043E\u0447\u0435\u0435 \u0434\u0435\u0440\u0435\u0432\u043E",
    branch: "\u0418\u043C\u044F \u043D\u043E\u0432\u043E\u0439 \u0432\u0435\u0442\u043A\u0438",
    main: "\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433",
    cancel: "\u041E\u0442\u043C\u0435\u043D\u0430",
    move: "\u041F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C",
    loading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u0434\u0435\u0440\u0435\u0432\u044C\u0435\u0432\u2026",
    detail: "\u0427\u0430\u0442 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u0441\u044F \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0439 \u043F\u0430\u043F\u043A\u0435. \u041D\u0435\u0437\u0430\u043A\u043E\u043C\u043C\u0438\u0447\u0435\u043D\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u0432 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u043C \u0434\u0435\u0440\u0435\u0432\u0435.",
    busy: "\u0414\u043E\u0436\u0434\u0438\u0442\u0435\u0441\u044C \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u043E\u0442\u0432\u0435\u0442\u0430 \u0432 \u044D\u0442\u043E\u043C \u0447\u0430\u0442\u0435.",
    unavailable: "\u041F\u0430\u043F\u043A\u0430 \u0438\u043B\u0438 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u0447\u0430\u0442\u0430 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u044D\u0442\u043E \u043E\u043A\u043D\u043E \u0435\u0449\u0451 \u0440\u0430\u0437.",
    failed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0447\u0430\u0442.",
    listFailed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0440\u0430\u0431\u043E\u0447\u0438\u0435 \u0434\u0435\u0440\u0435\u0432\u044C\u044F.",
    setup: "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0441\u043A\u0440\u0438\u043F\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
    setupFailed: "\u0427\u0430\u0442 \u043F\u0435\u0440\u0435\u043C\u0435\u0449\u0451\u043D. \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0441\u043A\u0440\u0438\u043F\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438.",
    moved: "\u0427\u0430\u0442 \u043F\u0435\u0440\u0435\u043C\u0435\u0449\u0451\u043D"
  },
  en: {
    terminalFailed: "Could not open a terminal in this chat\u2019s folder.",
    toTree: "Move to worktree",
    toMain: "Move to main checkout",
    select: "Move this chat to",
    newTree: "New worktree",
    branch: "New branch name",
    main: "Main checkout",
    cancel: "Cancel",
    move: "Move",
    loading: "Loading worktrees\u2026",
    detail: "The chat will continue in the selected folder. Uncommitted files stay in the original checkout.",
    busy: "Wait for the current reply to finish.",
    unavailable: "The chat folder or profile changed. Reopen this dialog.",
    failed: "Could not move the chat.",
    listFailed: "Could not load worktrees.",
    setup: "Run setup script",
    setupFailed: "The chat moved. The setup script could not start.",
    moved: "Chat moved"
  }
};
var copy2 = () => document.documentElement.matches(":lang(ru)") ? labels5.ru : labels5.en;
var workspacePathKey = (value) => {
  const path = String(value || "").replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[a-z]:|^\/\//i.test(path) ? path.toLowerCase() : path;
};
var localOwner = (owner) => owner?.connectionId === "local" && Boolean(owner.profile);
function gitApi(scope2, cwd, route, body) {
  const base = { connectionId: scope2.connectionId, profile: scope2.profile, timeoutMs: body ? 3e4 : 8e3 };
  const path = "/api/git/" + route;
  return window.hermesDesktop.api(body ? { ...base, path, method: "POST", body: { path: cwd, ...body } } : { ...base, path: path + "?" + new URLSearchParams({ path: cwd }) });
}
async function readWorkspaceRepository(cwd, scope2) {
  if (!cwd) return null;
  const native = localOwner(scope2) ? window.hermesDesktop?.git : null;
  const repo = await native?.repoStatus?.(cwd).catch(() => null);
  if (repo) return { repo, native: true };
  const fallback = await gitApi(scope2, cwd, "status").catch(() => null);
  return fallback && { repo: fallback, native: false };
}
async function readWorkspaceTrees(cwd, scope2, native) {
  const result = native ? await window.hermesDesktop.git.worktreeList(cwd) : (await gitApi(scope2, cwd, "worktrees"))?.worktrees;
  return Array.isArray(result) ? result : [];
}
function workspaceTreeFor(trees, cwd) {
  const path = workspacePathKey(cwd);
  return trees.reduce((closest, tree) => {
    const root = workspacePathKey(tree.path);
    return root && (path === root || path.startsWith(root + "/")) && (!closest || root.length > workspacePathKey(closest.path).length) ? tree : closest;
  }, null);
}
function ownsChat(target) {
  const owner = host8.state.focusedSessionOwner.get();
  return localOwner(target.owner) && owner?.connectionId === target.owner.connectionId && owner.profile === target.owner.profile && host8.state.activeSessionId.get() === target.runtime && host8.state.focusedSessionId.get() === target.runtime && host8.state.focusedStoredSessionId.get() === target.session && workspacePathKey(host8.state.cwd.get()) === workspacePathKey(target.cwd);
}
var terminalSelector = '[data-pane-host="terminal"]';
var newTerminal = () => document.querySelector(terminalSelector + ' [role="tablist"] > li > button:has(> .codicon-add)');
function dispatchNewTerminal() {
  let custom;
  try {
    custom = JSON.parse(localStorage.getItem("hermes.desktop.keybinds") || "{}");
  } catch {
    return false;
  }
  const chord = "ctrl+shift+" + String.fromCharCode(96);
  const mapped = custom?.["view.newTerminal"];
  if (mapped && !mapped.includes(chord)) return false;
  if (Object.entries(custom || {}).some(([action, keys]) => action !== "view.newTerminal" && Array.isArray(keys) && (keys.includes(chord) || keys.includes(chord.replace("ctrl+", "mod+"))))) return false;
  const event = new KeyboardEvent("keydown", {
    key: "~",
    code: "Backquote",
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true
  });
  return !window.dispatchEvent(event);
}
function openWorkspaceTerminal(target) {
  window.setTimeout(() => {
    const draft = !target.session && !target.runtime && !host8.state.focusedStoredSessionId.get() && !host8.state.activeSessionId.get() && localOwner(target.owner) && host8.state.connectionId.get() === target.owner.connectionId && host8.state.profile.get() === target.owner.profile && workspacePathKey(host8.state.cwd.get()) === workspacePathKey(target.cwd);
    if (!draft && !ownsChat(target)) {
      host8.notify({ kind: "error", message: copy2().unavailable });
      return;
    }
    if (host8.paneVisibility("terminal").get() && newTerminal()) {
      newTerminal().click();
      return;
    }
    if (dispatchNewTerminal()) return;
    const nativeTab = document.querySelector('[data-tree-tab="terminal"]');
    if (nativeTab?.getClientRects().length) {
      nativeTab.click();
      return;
    }
    host8.notify({ kind: "error", message: copy2().terminalFailed });
  }, 0);
}
function openWorkspaceReview(getChat) {
  const review = getChat()?.querySelector(".coding-status-bar button:has(> .codicon-git-branch)");
  if (!review || review.disabled) return false;
  if (host8.paneVisibility("review").get()) host8.revealPane("review");
  else review.click();
  return true;
}
function MoveWorkspaceDialog({ target, close, refresh, localEnvironment }) {
  const words3 = copy2();
  const [trees, setTrees] = useState6(null);
  const [choice, setChoice] = useState6("");
  const [branch, setBranch] = useState6("");
  const [error, setError] = useState6("");
  const [pending, setPending] = useState6(false);
  const [setupAvailable, setSetupAvailable] = useState6(false);
  const [runSetup, setRunSetup] = useState6(true);
  const running = useRef4(false);
  const created = useRef4(null);
  const currentTree = workspaceTreeFor(trees || [], target.cwd);
  const isMain = currentTree?.isMain !== false;
  const busy = useValue3(host8.state.busy);
  useEffect6(() => {
    let live = true;
    void readWorkspaceTrees(target.cwd, target.owner, target.nativeGit).then((result) => {
      if (!live) return;
      const all = result.filter((tree) => typeof tree.path === "string" && tree.path);
      const active2 = workspaceTreeFor(all, target.cwd);
      const next = all.filter((tree) => tree !== active2);
      setTrees(all);
      setChoice(next.find((tree) => tree.isMain)?.path || next[0]?.path || "new");
    }, () => {
      if (live) setError(words3.listFailed);
    });
    void localEnvironment?.actions(target.cwd).then((result) => {
      if (live) setSetupAvailable(result.some((action) => action.id === "setup"));
    }, () => {
    });
    return () => {
      live = false;
    };
  }, [target, localEnvironment, words3.listFailed]);
  async function move(event) {
    event.preventDefault();
    if (running.current || !choice || choice === "new" && !branch.trim()) return;
    if (!ownsChat(target)) {
      setError(words3.unavailable);
      return;
    }
    if (host8.state.busy.get()) {
      setError(words3.busy);
      return;
    }
    running.current = true;
    setPending(true);
    setError("");
    try {
      let cwd = choice;
      if (choice === "new") {
        const name = branch.trim();
        if (created.current?.name !== name) {
          const options = { name, branch: name, ...target.branch && { base: target.branch } };
          const tree = target.nativeGit ? await window.hermesDesktop.git.worktreeAdd(target.cwd, options) : await gitApi(target.owner, target.cwd, "worktree/add", options);
          if (!tree?.path) throw new Error(words3.failed);
          created.current = { name, path: tree.path };
        }
        cwd = created.current.path;
      }
      if (!ownsChat(target) || host8.state.busy.get()) throw new Error(words3.unavailable);
      const result = await host8.requestProfile({ ...target.owner, targetProfile: target.owner.profile }, "session.cwd.set", {
        session_id: target.runtime,
        cwd
      }, 1e4);
      if (!result?.cwd) throw new Error(words3.failed);
      refresh();
      host8.notify({ kind: "success", title: words3.moved, message: result.cwd });
      close();
      if (choice === "new" && setupAvailable && runSetup) {
        void localEnvironment.run({ cwd: result.cwd, id: "setup" }).catch((error2) => host8.notifyError(error2, words3.setupFailed));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : words3.failed);
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return h8(
    Dialog,
    { open: true, onOpenChange: (value) => {
      if (!value && !running.current) close();
    } },
    h8(
      DialogContent,
      {
        "data-hcv-workspace-move": "",
        showCloseButton: !pending,
        blurBackdrop: false,
        onCloseAutoFocus: (event) => {
          if (!target.trigger?.isConnected) return;
          event.preventDefault();
          target.trigger.focus({ preventScroll: true });
        }
      },
      h8(
        "form",
        { onSubmit: move, className: "hcv-workspace-move-form" },
        h8(
          DialogHeader,
          null,
          h8(DialogTitle, null, isMain ? words3.toTree : words3.toMain),
          h8(DialogDescription, null, words3.detail)
        ),
        trees ? h8("label", null, words3.select, h8(
          "select",
          {
            value: choice,
            disabled: pending,
            onChange: (event) => setChoice(event.target.value)
          },
          ...trees.filter((tree) => tree !== currentTree).map((tree) => h8("option", { key: tree.path, value: tree.path }, tree.isMain ? words3.main : tree.branch || tree.path)),
          h8("option", { value: "new" }, words3.newTree)
        )) : h8("p", { role: "status" }, error ? "" : words3.loading),
        choice === "new" && h8("label", null, words3.branch, h8(Input, {
          value: branch,
          disabled: pending,
          placeholder: "worktree",
          onChange: (event) => setBranch(event.target.value)
        })),
        choice === "new" && setupAvailable && h8(
          "label",
          { className: "hcv-move-setup" },
          h8("input", {
            type: "checkbox",
            checked: runSetup,
            disabled: pending,
            onChange: (event) => setRunSetup(event.target.checked)
          }),
          words3.setup
        ),
        (error || busy) && h8("p", { role: "status" }, error || words3.busy),
        h8(
          DialogFooter,
          null,
          h8(Button, { type: "button", variant: "outline", onClick: close, disabled: pending }, words3.cancel),
          h8(Button, { type: "submit", disabled: !trees || pending || busy || choice === "new" && !branch.trim() }, words3.move)
        )
      )
    )
  );
}
function MoveSlot({ model, close, localEnvironment }) {
  const entry = useValue3(model);
  return entry && h8(MoveWorkspaceDialog, {
    key: entry.key,
    target: entry.target,
    close,
    refresh: entry.refresh,
    localEnvironment
  });
}
function registerWorkspaceActions(ctx, active2, localEnvironment) {
  const model = atom3(null);
  let key = 0;
  const close = () => model.set(null);
  const style = document.createElement("style");
  style.textContent = [
    "@media (forced-colors: none) {",
    active2 + " [data-hcv-workspace-move] { max-inline-size: 420px; border-radius: 16px; background: var(--hcv-menu); color: var(--hcv-text); font-family: var(--hcv-ui-font); }",
    active2 + " .hcv-workspace-move-form { display: grid; gap: 16px; }",
    active2 + " .hcv-workspace-move-form label { display: grid; gap: 6px; }",
    active2 + " .hcv-workspace-move-form .hcv-move-setup { display: flex; align-items: center; gap: 8px; }",
    active2 + " .hcv-workspace-move-form select { inline-size: 100%; min-block-size: 36px; padding: 4px 8px; border: 1px solid var(--hcv-hairline); border-radius: 8px; background: var(--hcv-panel); }",
    active2 + ' .hcv-workspace-move-form [role="status"] { overflow-wrap: anywhere; color: var(--hcv-muted); }',
    "}"
  ].join("\n");
  document.head.append(style);
  ctx.register({
    id: "move-workspace",
    area: TITLEBAR_AREAS2.center,
    render: () => h8(MoveSlot, { model, close, localEnvironment })
  });
  const observer = new MutationObserver(() => {
    if (!document.documentElement.matches(active2)) close();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hermes-theme"] });
  ctx.onDispose(() => {
    observer.disconnect();
    close();
    style.remove();
  });
  return {
    openMove(target, refresh) {
      if (target.runtime && target.session && ownsChat(target)) {
        model.set({ key: ++key, target, refresh });
      } else host8.notify({ kind: "error", message: copy2().unavailable });
    }
  };
}

// source/workspace-card.js
var primaryChat = '[data-chat-surface][data-composer-target="main"]';
var connectionsRoute = "/capabilities?tab=connectors";
var minimumWindowWidth = 1120;
var labels6 = {
  ru: {
    card: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0438 \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0438",
    changes: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
    project: "\u041F\u0440\u043E\u0435\u043A\u0442",
    show: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0441\u0432\u043E\u0434\u043A\u0443",
    hide: "\u0421\u043A\u0440\u044B\u0442\u044C \u0441\u0432\u043E\u0434\u043A\u0443",
    pin: "\u0417\u0430\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0441\u0432\u043E\u0434\u043A\u0443",
    unpin: "\u041E\u0442\u043A\u0440\u0435\u043F\u0438\u0442\u044C \u0441\u0432\u043E\u0434\u043A\u0443",
    actions: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441\u043E \u0441\u0432\u043E\u0434\u043A\u043E\u0439",
    setup: "\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0435 \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u0435",
    terminal: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B",
    toTree: "\u041F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0432 \u0440\u0430\u0431\u043E\u0447\u0435\u0435 \u0434\u0435\u0440\u0435\u0432\u043E",
    toMain: "\u041F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0432 \u043E\u0441\u043D\u043E\u0432\u043D\u0443\u044E \u0440\u0430\u0431\u043E\u0447\u0443\u044E \u043A\u043E\u043F\u0438\u044E",
    projectActions: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
    actionError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435"
  },
  en: {
    card: "Changes and sources",
    changes: "Changes",
    project: "Project",
    show: "Show summary",
    hide: "Hide summary",
    pin: "Pin summary",
    unpin: "Unpin summary",
    actions: "Summary actions",
    setup: "Set up local environment",
    terminal: "Open terminal",
    toTree: "Move to worktree",
    toMain: "Move to main checkout",
    projectActions: "Project actions",
    actionError: "Could not run the action"
  }
};
function icon5(name) {
  const glyph3 = name === "panel" ? "summaryToggle" : name === "all" ? "summarySources" : name;
  const style = codexIconStyle(glyph3);
  return h9("span", { "aria-hidden": true, "data-hcv-icon": glyph3, style });
}
function currentChat() {
  return [...document.querySelectorAll(primaryChat)].find(
    (node2) => !node2.closest("[hidden], [inert], [data-pane-hidden]") && node2.getClientRects().length > 0 && getComputedStyle(node2).visibility === "visible"
  );
}
function useRoomForCard(eligible) {
  const [room, setRoom] = useState7(false);
  useEffect7(() => {
    if (!eligible) {
      setRoom(false);
      return;
    }
    let chat2 = null;
    let frame = 0;
    const contrast = window.matchMedia("(forced-colors: active)");
    const resize = new ResizeObserver(queue);
    const mutations = new MutationObserver((records) => {
      if (records.some(
        (record) => [...record.addedNodes, ...record.removedNodes].some(
          (node2) => node2 instanceof Element && (node2.matches(primaryChat) || node2.querySelector(primaryChat))
        )
      ))
        queue();
    });
    function measure() {
      frame = 0;
      const visibleChat = currentChat();
      if (visibleChat !== chat2) {
        resize.disconnect();
        chat2 = visibleChat;
        if (chat2) resize.observe(chat2);
      }
      const bounds = chat2?.getBoundingClientRect();
      const offset = parseFloat(document.documentElement.style.getPropertyValue("--hcv-sidebar-right-offset")) || 0;
      setRoom(
        Boolean(
          bounds && !contrast.matches && window.innerWidth >= minimumWindowWidth && window.innerHeight >= 450 && bounds.width >= 750 && Math.abs(window.innerWidth - bounds.right - offset) < 36
        )
      );
    }
    function queue() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", queue);
    window.addEventListener(toolbarOffsetEvent, queue);
    window.addEventListener("hashchange", queue);
    window.navigation?.addEventListener("currententrychange", queue);
    contrast.addEventListener("change", queue);
    queue();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", queue);
      window.removeEventListener(toolbarOffsetEvent, queue);
      window.removeEventListener("hashchange", queue);
      window.navigation?.removeEventListener("currententrychange", queue);
      contrast.removeEventListener("change", queue);
    };
  }, [eligible]);
  return eligible && room;
}
function useWorkspaceData(draftCwd, enabled) {
  const owner = useValue4(host9.state.focusedSessionOwner);
  const session = useValue4(host9.state.focusedStoredSessionId);
  const activeProfile = useValue4(host9.state.profile);
  const activeConnection = useValue4(host9.state.connectionId);
  const gateway = useValue4(host9.state.gateway);
  const busy = useValue4(host9.state.busy);
  const connectionId = session ? owner?.connectionId : activeConnection;
  const profile2 = session ? owner?.profile : activeProfile;
  const sameScope = Boolean(
    profile2 && profile2 === activeProfile && connectionId && connectionId === activeConnection
  );
  const key = JSON.stringify([session, session ? null : draftCwd, connectionId, profile2, activeConnection, activeProfile, gateway]);
  const [snapshot, setSnapshot] = useState7(null);
  const [revision, setRevision] = useState7(0);
  useEffect7(() => {
    if (!enabled || !sameScope || gateway !== "open") return;
    let current = true;
    async function read() {
      if (host9.state.connectionId.get() !== connectionId || host9.state.profile.get() !== profile2) return;
      const routes = await host9.profileRoutes().catch(() => []);
      if (!current || host9.state.connectionId.get() !== connectionId || host9.state.profile.get() !== profile2) return;
      const route = routes.find((entry) => entry.connectionId === connectionId && entry.profile === profile2);
      const request = (method, params) => route ? host9.requestProfile(route, method, params, 8e3) : host9.request(method, params, 8e3);
      let cwd = draftCwd;
      let storedBranch = "";
      if (session) {
        const params = new URLSearchParams({ profile: route?.targetProfile ?? profile2 });
        const row2 = await window.hermesDesktop.api({ connectionId, path: `/api/sessions/${encodeURIComponent(session)}?${params}`, timeoutMs: 8e3 }).catch(() => null);
        cwd = typeof row2?.cwd === "string" ? row2.cwd.trim() : "";
        storedBranch = typeof row2?.git_branch === "string" ? row2.git_branch : "";
      }
      if (!current) return;
      const scope2 = { connectionId, profile: profile2 };
      const [project, sources, repository] = await Promise.allSettled([
        cwd ? request("projects.for_cwd", { cwd }) : Promise.resolve(null),
        request("mcp.servers.status", {}),
        readWorkspaceRepository(cwd, scope2)
      ]);
      if (!current) return;
      const status = repository.status === "fulfilled" ? repository.value : null;
      const repo = status?.repo;
      const worktrees = repo && connectionId === "local" ? await readWorkspaceTrees(cwd, scope2, status.native).catch(() => []) : [];
      if (!current) return;
      const sourceRows = sources.status === "fulfilled" && Array.isArray(sources.value?.servers) ? sources.value.servers.filter((row2) => typeof row2?.name === "string" && row2.name && !row2.disabled) : null;
      setSnapshot({
        key,
        cwd,
        project: project.status === "fulfilled" ? project.value?.project?.name : null,
        sources: sourceRows,
        repo,
        nativeGit: status?.native,
        branch: repo?.branch || storedBranch,
        isWorktree: workspaceTreeFor(worktrees, cwd)?.isMain === false
      });
    }
    void read().catch(() => {
      if (current) setSnapshot({ key, cwd: "", project: null, sources: null });
    });
    return () => {
      current = false;
    };
  }, [key, sameScope, gateway, connectionId, profile2, session, draftCwd, enabled, revision, busy]);
  return {
    scope: sameScope && gateway === "open" ? { connectionId, profile: profile2 } : null,
    snapshot: snapshot?.key === key ? snapshot : null,
    key,
    refresh: () => setRevision((value) => value + 1)
  };
}
function useSourcesView(data, enabled) {
  const rows = useChatSources(currentChat, data.key, enabled);
  return {
    rows,
    connectors: data.snapshot?.sources,
    loading: Boolean(data.scope && !data.snapshot),
    getChat: currentChat,
    onConnectors: (server) => host9.navigate(server ? connectionsRoute + "&server=" + encodeURIComponent(server) : connectionsRoute),
    onOpenSource: (row2) => {
      if (row2.action?.isConnected && currentChat()?.contains(row2.action)) row2.action.click();
    }
  };
}
function useExpandedWorkspace() {
  const cwd = useValue4(host9.state.cwd)?.trim() || "";
  const primary4 = useValue4(host9.state.activeSessionId);
  const focused = useValue4(host9.state.focusedSessionId);
  const enabled = primary4 === focused;
  const data = useWorkspaceData(cwd, enabled);
  return { data, enabled };
}
function ExpandedSources() {
  const { data, enabled } = useExpandedWorkspace();
  return h9(SourcesPane, useSourcesView(enabled ? data : { key: data.key }, enabled));
}
function ExpandedChanges() {
  const { data, enabled } = useExpandedWorkspace();
  return h9(ChangesPane, { cwd: enabled ? data.snapshot?.cwd : "", scope: enabled ? data.scope : null });
}
function DiffStats({ repo }) {
  if (!repo || !repo.added && !repo.removed && !repo.changed) return null;
  return h9(
    "span",
    { className: "hcv-context-diff" },
    repo.added || repo.removed ? h9(
      Fragment2,
      null,
      h9("span", { className: "hcv-context-added" }, "+" + repo.added),
      h9("span", { className: "hcv-context-removed" }, "\u2212" + repo.removed)
    ) : h9("span", null, repo.changed)
  );
}
function WorkspaceCard({ id: id2, close, copy: copy6, shown, pinned, onPin, roster, panes, actions, localEnvironment, data, projectActions }) {
  const { scope: scope2, snapshot, refresh } = data;
  const sources = useSourcesView(data, shown);
  const runtime = useValue4(host9.state.activeSessionId);
  const session = useValue4(host9.state.focusedStoredSessionId);
  const busy = useValue4(host9.state.busy);
  const cwd = snapshot?.cwd || "";
  const local = scope2?.connectionId === "local" && Boolean(cwd);
  const target = { cwd, owner: scope2, runtime, session, nativeGit: snapshot?.nativeGit, branch: snapshot?.branch };
  const title = snapshot?.project || cwd.split(/[/\\]/).filter(Boolean).at(-1) || copy6.project;
  const card = useRef5(null);
  const trigger = useRef5(null);
  const [menu, setMenu] = useState7(null);
  function toggleMenu(open) {
    if (!open) {
      setMenu(null);
      return;
    }
    const frame = card.current?.getBoundingClientRect();
    const anchor = trigger.current?.getBoundingClientRect();
    setMenu(frame && anchor ? { side: anchor.left - frame.left + 8, align: frame.top - anchor.top } : { side: 8, align: 0 });
  }
  function openChanges() {
    if (snapshot?.nativeGit && openWorkspaceReview(currentChat)) return;
    panes.open("changes");
  }
  const changeButton = h9(
    "button",
    {
      type: "button",
      className: "hcv-context-row hcv-context-changes",
      onClick: openChanges,
      disabled: !cwd || !scope2,
      "aria-label": copy6.changes,
      "data-hcv-branch": snapshot?.branch || void 0
    },
    icon5("changes"),
    h9("span", { className: "hcv-context-label" }, copy6.changes),
    h9(
      "span",
      { className: "hcv-context-change-meta" },
      h9(DiffStats, { repo: snapshot?.repo }),
      snapshot?.branch && h9("span", { className: "hcv-context-branch-icon" }, icon5("branch"))
    )
  );
  return h9(
    "aside",
    { ref: card, id: id2, "data-hcv-context-card": "", "data-pinned": pinned, "aria-label": copy6.card, "aria-hidden": !shown, inert: !shown },
    h9(
      "header",
      { className: "hcv-context-title" },
      h9("span", { title }, title),
      h9(
        DropdownMenu4,
        { open: Boolean(menu), onOpenChange: toggleMenu },
        h9(
          DropdownMenuTrigger4,
          { asChild: true },
          h9(
            "button",
            { ref: trigger, type: "button", className: "hcv-context-icon", "aria-label": copy6.actions },
            icon5("more")
          )
        ),
        h9(
          DropdownMenuContent4,
          {
            side: "left",
            align: "start",
            sideOffset: menu?.side ?? 8,
            alignOffset: menu?.align ?? 0,
            "data-hcv-summary-menu": ""
          },
          localEnvironment && h9(DropdownMenuItem4, { disabled: !local, onSelect: () => {
            void localEnvironment.open({ cwd, projectName: title, trigger: trigger.current });
          } }, icon5("plus"), copy6.setup),
          h9(
            DropdownMenuItem4,
            { disabled: !local, onSelect: () => openWorkspaceTerminal(target) },
            icon5("terminal"),
            copy6.terminal
          ),
          ...projectActions.map((entry) => h9(DropdownMenuItem4, {
            key: entry.id,
            onSelect: () => void localEnvironment.run({ cwd, id: entry.id }).catch((error) => host9.notifyError(error, copy6.actionError))
          }, icon5(entry.icon), entry.label)),
          snapshot?.repo && h9(
            Fragment2,
            null,
            h9(DropdownMenuSeparator2),
            h9(DropdownMenuItem4, {
              disabled: !local || !runtime || !session || busy,
              onSelect: () => actions.openMove({ ...target, trigger: trigger.current }, refresh)
            }, snapshot.isWorktree ? copy6.toMain : copy6.toTree)
          ),
          h9(DropdownMenuSeparator2),
          h9(DropdownMenuItem4, { onSelect: onPin }, icon5(pinned ? "unpin" : "pin"), pinned ? copy6.unpin : copy6.pin),
          h9(DropdownMenuItem4, { onSelect: close }, icon5("close"), copy6.hide)
        )
      )
    ),
    snapshot?.branch ? h9(Tip, { label: snapshot.branch }, changeButton) : changeButton,
    h9(SummarySubagents, { roster, onExpand: () => panes.open("agents") }),
    h9(CompactSources, { ...sources, onExpand: () => panes.open("sources") })
  );
}
function ProjectActions({ entries, cwd, localEnvironment, copy: copy6 }) {
  const named = entries.filter((entry) => entry.id !== "setup" && entry.id !== "cleanup");
  if (!named.length) return null;
  return h9(
    DropdownMenu4,
    null,
    h9(
      DropdownMenuTrigger4,
      { asChild: true },
      h9(
        "button",
        { type: "button", "data-hcv-project-actions": "", "aria-label": copy6.projectActions },
        icon5(named[0].icon),
        icon5("down")
      )
    ),
    h9(
      DropdownMenuContent4,
      { align: "end", "data-hcv-project-actions-menu": "" },
      ...named.map((entry) => h9(DropdownMenuItem4, {
        key: entry.id,
        onSelect: () => void localEnvironment.run({ cwd, id: entry.id }).catch((error) => host9.notifyError(error, copy6.actionError))
      }, icon5(entry.icon), entry.label))
    )
  );
}
function CardSlot({ storage, roster, panes, actions, localEnvironment }) {
  const { locale } = useI18n4();
  const copy6 = labels6[locale] || labels6.en;
  const workspace = useValue4(host9.paneVisibility("workspace"));
  const files = useValue4(host9.paneVisibility("files"));
  const review = useValue4(host9.paneVisibility("review"));
  const focused = useValue4(host9.state.focusedSessionId);
  const primary4 = useValue4(host9.state.activeSessionId);
  const draftCwd = useValue4(host9.state.cwd)?.trim() || "";
  const data = useWorkspaceData(draftCwd, workspace && focused === primary4);
  const cwd = workspace && focused === primary4 && data.scope?.connectionId === "local" ? data.snapshot?.cwd : "";
  const actionRevision = useValue4(localEnvironment.revision);
  const [savedActions, setSavedActions] = useState7(null);
  const projectActions = savedActions && savedActions.cwd === cwd ? savedActions.entries : [];
  const agents = useValue4(panes.visibility.agents);
  const sources = useValue4(panes.visibility.sources);
  const changes2 = useValue4(panes.visibility.changes);
  const roomy = useRoomForCard(workspace && !files && !review && !agents && !sources && !changes2 && focused === primary4);
  const [pinned, setPinned] = useState7(() => storage.get("summary-pinned", true) !== false);
  const [open, setOpen] = useState7(() => storage.get("summary-pinned", true) !== false);
  const toggleRef = useRef5(null);
  const cardId = useId3();
  useEffect7(() => {
    if (!cwd) return;
    let live = true;
    void localEnvironment.actions(cwd).then((entries) => {
      if (live) setSavedActions({ cwd, entries });
    }, () => {
    });
    return () => {
      live = false;
    };
  }, [cwd, localEnvironment, actionRevision]);
  useEffect7(() => {
    if (!roomy || !open || pinned) return;
    function onOutside(event) {
      if (event.target instanceof Element && !event.target.closest(
        '[data-hcv-context-card], [data-hcv-context-toggle], [data-hcv-summary-menu], [data-hcv-sources-add-menu], [data-hcv-project-actions], [data-hcv-project-actions-menu], [data-slot="dialog-overlay"]'
      )) setOpen(false);
    }
    function onEscape(event) {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector('[role="menu"][data-state="open"], [role="dialog"][data-state="open"], [popover]:popover-open')) {
        setOpen(false);
        toggleRef.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onEscape, true);
    };
  }, [roomy, open, pinned]);
  const projectToolbar = h9(ProjectActions, { entries: projectActions, cwd, localEnvironment, copy: copy6 });
  if (!roomy) return projectToolbar;
  function togglePin() {
    storage.set("summary-pinned", !pinned);
    setPinned(!pinned);
  }
  function closeFromMenu() {
    setOpen(false);
    requestAnimationFrame(() => toggleRef.current?.focus({ preventScroll: true }));
  }
  return h9(
    Fragment2,
    null,
    projectToolbar,
    h9(Tip, { label: open ? copy6.hide : copy6.show }, h9(
      "button",
      {
        ref: toggleRef,
        type: "button",
        "data-hcv-context-toggle": "",
        "aria-expanded": open,
        "aria-controls": cardId,
        "aria-label": open ? copy6.hide : copy6.show,
        onClick: () => setOpen((visible) => !visible)
      },
      icon5("panel")
    )),
    h9(WorkspaceCard, {
      id: cardId,
      copy: copy6,
      close: closeFromMenu,
      shown: open,
      pinned,
      onPin: togglePin,
      roster,
      panes,
      actions,
      localEnvironment,
      data,
      projectActions
    })
  );
}
function ThemeCardSlot({ themeName: themeName2, panes, ...props }) {
  const theme2 = useTheme2();
  return theme2.themeName === themeName2 ? h9(Fragment2, null, h9(CardSlot, { ...props, panes }), panes.renderPicker()) : null;
}
function registerWorkspaceCard(ctx, themeName2, roster, localEnvironment) {
  if (typeof host9.paneVisibility !== "function" || !host9.state.focusedSessionOwner) return;
  const scope2 = `:root[data-hermes-codex-visual][data-hermes-theme="${CSS.escape(themeName2)}"]`;
  const actions = registerWorkspaceActions(ctx, scope2, localEnvironment);
  const panes = registerSummaryPanes(ctx, scope2, {
    agents: () => h9(SubagentsPane, { roster }),
    sources: () => h9(ExpandedSources),
    changes: () => h9(ExpandedChanges)
  });
  registerSummarySources(ctx, scope2);
  registerSummaryChanges(ctx, scope2);
  const surfaces = `${scope2} [data-hcv-context-card]`;
  const chat2 = `${scope2} ${primaryChat}`;
  const dock2 = `${chat2} [data-slot="composer-dock"]:not([data-popped-out])`;
  const fallback = `${chat2} [data-slot="composer-root"]:has(> .composer-fallback-surface)`;
  const style = document.createElement("style");
  style.dataset.hcvWorkspaceCard = "";
  style.textContent = `
@property --hcv-summary-progress {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}
${scope2} {
  --hcv-summary-width: 300px;
  --hcv-summary-layout-inset: calc((var(--hcv-summary-width) + 12px) * var(--hcv-summary-progress));
}
${scope2}:has([data-hcv-context-card][aria-hidden="false"]) { --hcv-summary-progress: 1; }
@media (forced-colors: none) {
  ${chat2} {
    --hcv-summary-composer-width: min(var(--composer-width), 100% - var(--hcv-summary-layout-inset) - 2rem);
  }
  ${chat2} > [data-slot="composer-bounds"] { margin-right: var(--hcv-summary-layout-inset); }
  ${dock2}, ${fallback} { left: calc(50% - var(--hcv-summary-layout-inset) / 2); }
  ${dock2} { width: calc(var(--hcv-summary-composer-width) + 10px); }
  ${fallback} { width: var(--hcv-summary-composer-width); }
}
${scope2} [data-hcv-context-card] {
  position: fixed;
  inset-block-start: var(--hcv-context-card-top, 93px);
  right: calc(8px + var(--hcv-sidebar-right-offset, 0px));
  inline-size: var(--hcv-summary-width);
  max-block-size: calc(100dvh - var(--hcv-context-card-top, 93px) - 8px);
  overflow: auto;
  box-sizing: border-box;
  padding: 12px 12px 8px;
  border: 1px solid color-mix(in srgb, var(--hcv-text) 8%, transparent);
  border-radius: 16px;
  color: var(--hcv-text);
  background: var(--hcv-menu);
  text-align: start;
  font: 13px/20px var(--hcv-ui-font);
  font-weight: 400;
  opacity: var(--hcv-summary-progress);
  transform: translateX(calc(100% * (1 - var(--hcv-summary-progress))));
  pointer-events: auto;
  -webkit-app-region: no-drag;
}
${scope2} [data-hcv-context-card][aria-hidden="true"] {
  visibility: hidden;
  pointer-events: none;
}
/* The card sits in the titlebar layer. Its portaled menu must clear that
   layer and still sit below a modal backdrop. Radix copies the menu z-index. */
${scope2} [data-hcv-summary-menu] {
  z-index: calc(var(--z-modal-backdrop, 120) - 1);
  min-inline-size: min(260px, calc(100vw - 16px));
  padding: 4px;
  border-radius: 16px;
  background: var(--hcv-menu);
}
${scope2} [data-hcv-summary-menu] [role="menuitem"] { min-block-size: 28px; border-radius: 8px; }
${surfaces} button.hcv-context-row,
${scope2} [data-hcv-context-card] .hcv-context-icon,
${scope2} [data-hcv-context-toggle] {
  appearance: none;
  margin: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
${scope2} [data-hcv-context-card] button:disabled { opacity: .5; cursor: default; }
${surfaces} button:focus-visible,
${scope2} [data-hcv-context-toggle]:focus-visible { outline: 1px solid var(--hcv-focus); outline-offset: 1px; }
${scope2} [data-hcv-context-card] .hcv-context-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  color: var(--hcv-muted);
  min-block-size: 24px;
  margin-block-end: 4px;
  padding-inline: 8px 2px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
${scope2} [data-hcv-context-card] .hcv-context-title > span,
${surfaces} .hcv-context-label {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
${surfaces} .hcv-context-row {
  display: flex;
  align-items: center;
  inline-size: 100%;
  min-block-size: 28px;
  padding: 4px 8px;
  gap: 12px;
  text-align: start;
}
${scope2} :is([data-hcv-context-card], [data-hcv-context-toggle], [data-hcv-summary-menu], [data-hcv-project-actions], [data-hcv-project-actions-menu]) [data-hcv-icon] {
  display: inline-block;
  inline-size: 16px;
  block-size: 16px;
  flex: 0 0 auto;
}
${surfaces} :is([data-hcv-summary-agents], [data-hcv-sources-compact]) { margin-inline: 8px; }
${surfaces} .hcv-context-change-meta { display: grid; align-items: center; margin-inline-start: auto; color: var(--hcv-muted); }
${surfaces} .hcv-context-change-meta > * { grid-area: 1/1; justify-self: end; }
${surfaces} .hcv-context-diff { display: flex; gap: 4px; font-variant-numeric: tabular-nums; }
${surfaces} .hcv-context-added { color: light-dark(#008241, #40c977); }
${surfaces} .hcv-context-removed { color: light-dark(#aa2626, #f28080); }
${surfaces} .hcv-context-branch-icon { display: flex; }
${surfaces} .hcv-context-diff + .hcv-context-branch-icon { opacity: 0; }
${surfaces} .hcv-context-changes:is(:hover, :focus-visible) .hcv-context-diff:has(+ .hcv-context-branch-icon) { opacity: 0; }
${surfaces} .hcv-context-changes:is(:hover, :focus-visible) .hcv-context-branch-icon { opacity: 1; }
${scope2} [data-hcv-context-card] .hcv-context-icon,
${scope2} [data-hcv-context-toggle] {
  display: inline-grid;
  place-items: center;
  inline-size: 24px;
  block-size: 24px;
  padding: 0;
  color: var(--hcv-muted);
  flex: 0 0 auto;
}
${scope2} [data-hcv-context-toggle][aria-expanded="true"] {
  color: var(--hcv-text);
  background: var(--hcv-selected);
}
${scope2} [data-hcv-project-actions] {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding-inline: 6px;
  border-radius: 8px;
  color: var(--hcv-muted);
}
${scope2} [data-hcv-project-actions] [data-hcv-icon="down"] { inline-size: 10px; block-size: 10px; }
${scope2} [data-hcv-project-actions]:is(:hover, [data-state="open"]) {
  color: var(--hcv-text);
  background: var(--hcv-hover);
}
${scope2} [data-hcv-project-actions-menu] { z-index: calc(var(--z-modal-backdrop, 120) - 1); }
@media (hover: hover) and (pointer: fine) {
  ${surfaces} button:is(.hcv-context-row, .hcv-context-icon):hover:not(:disabled),
  ${scope2} [data-hcv-context-toggle]:hover { background: var(--hcv-hover); color: var(--hcv-text); }
}
@media (prefers-reduced-motion: no-preference) {
  /* The Codex panel travel and the chat inset share one interpolated value. */
  ${scope2} { transition: --hcv-summary-progress ${codexReference.summaryTime} var(--hcv-enter); }
  ${scope2} [data-hcv-context-card] { transition: visibility 0s; }
  ${scope2} [data-hcv-context-card][aria-hidden="true"] { transition-delay: ${codexReference.summaryTime}; }
}
`;
  document.head.append(style);
  ctx.onDispose(() => style.remove());
  ctx.register({
    id: "workspace-card",
    area: TITLEBAR_AREAS3.right,
    render: () => h9(ThemeCardSlot, { themeName: themeName2, storage: ctx.storage, roster, panes, actions, localEnvironment })
  });
}

// source/local-environment.js
import { createElement as h10, useRef as useRef6, useState as useState8 } from "react";
import {
  atom as atom4,
  Button as Button2,
  Dialog as Dialog2,
  DialogContent as DialogContent2,
  DialogDescription as DialogDescription2,
  DialogFooter as DialogFooter2,
  DialogHeader as DialogHeader2,
  DialogTitle as DialogTitle2,
  host as host10,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TITLEBAR_AREAS as TITLEBAR_AREAS4,
  useValue as useValue5
} from "@hermes/plugin-sdk";

// source/local-environment-run.js
var sourceTreeVariable = "CODEX_SOURCE_TREE_PATH";
var worktreeVariable = "CODEX_WORKTREE_PATH";
function desktopPlatform() {
  const value = navigator.userAgentData?.platform || navigator.platform;
  if (/^win/i.test(value)) return "win32";
  if (/^mac/i.test(value)) return "darwin";
  if (/^linux/i.test(value)) return "linux";
  return null;
}
function localPathKey(value, platform) {
  if (typeof value !== "string" || /[\x00-\x1f]/.test(value)) return "";
  const path = value.trim();
  if (platform === "win32") {
    const normalized2 = path.replaceAll("\\", "/").toLowerCase();
    if (!/^(?:[a-z]:\/|\/\/[^/.?][^/]*\/[^/]+(?:\/|$))/.test(normalized2)) return "";
    return normalized2.replace(/\/+$/, "");
  }
  return path.startsWith("/") ? path.replace(/\/+$/, "") || "/" : "";
}
async function checkedLocalPath(desktop, value, platform) {
  const key = localPathKey(value, platform);
  if (!key || !desktop?.sanitizeWorkspaceCwd) return null;
  const checked = await desktop.sanitizeWorkspaceCwd(value);
  return !checked?.sanitized && localPathKey(checked?.cwd, platform) === key ? checked.cwd : null;
}
var psLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
var shLiteral = (value) => `'${value.replaceAll("'", "'\\''")}'`;
function powershellPayload(value) {
  let bytes = "";
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    bytes += String.fromCharCode(unit & 255, unit >> 8);
  }
  return btoa(bytes);
}
function terminalCommand({ shell, platform, cwd, source, script, marker: marker2 }) {
  if (platform === "win32" && /^(?:pwsh|powershell|cmd)(?:\.exe)?$/i.test(shell)) {
    const payload = powershellPayload([
      "$ErrorActionPreference = 'Stop'",
      `Set-Location -LiteralPath ${psLiteral(cwd)}`,
      `$env:${sourceTreeVariable} = ${psLiteral(source)}`,
      `$env:${worktreeVariable} = ${psLiteral(cwd)}`,
      `[Console]::WriteLine(${psLiteral(marker2)})`,
      "$global:LASTEXITCODE = 0",
      script,
      "if (-not $?) { exit 1 }",
      "exit $LASTEXITCODE"
    ].join("\n"));
    const args = `-NoLogo -NoProfile -NonInteractive -EncodedCommand ${payload}`;
    if (/^cmd/i.test(shell)) return `"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" ${args} && exit /b 0 || exit /b 1\r`;
    const executable = /^pwsh/i.test(shell) ? "pwsh.exe" : "powershell.exe";
    return `& (Join-Path $PSHOME '${executable}') ${args}; exit $LASTEXITCODE\r`;
  }
  if (platform === "darwin" || platform === "linux") {
    if (!/^(?:bash|zsh|sh|dash|ksh|fish)$/i.test(shell)) return null;
    const program = [
      `cd ${shLiteral(cwd)} || exit 1`,
      `export ${sourceTreeVariable}=${shLiteral(source)} ${worktreeVariable}=${shLiteral(cwd)}`,
      `printf '%s\\n' ${shLiteral(marker2)}`,
      script
    ].join("\n");
    const bytes = new TextEncoder().encode(program);
    const escaped = Array.from(bytes, (byte) => `\\0${byte.toString(8).padStart(3, "0")}`).join("");
    const exit = /^fish$/i.test(shell) ? "exit $status" : "exit $?";
    return `printf '%b' '${escaped}' | /bin/sh; ${exit}\r`;
  }
  return null;
}
var cleanOutput = (value) => value.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, "").replace(/\r\n?/g, "\n");
function runLocalScript({ desktop, platform, cwd, source, script, stillLocal, update }) {
  const marker2 = `HCV_PROJECT_${crypto.randomUUID().replaceAll("-", "")}`;
  const terminal = desktop?.terminal;
  let id2, offData, offExit;
  let stopped = false;
  let begun = false;
  let pending = "";
  let output = "";
  const release = () => {
    offData?.();
    offExit?.();
    if (id2) void terminal.dispose(id2).catch(() => {
    });
    id2 = null;
  };
  const finish = (state, error) => {
    if (stopped) return;
    stopped = true;
    release();
    update({ state, error, output });
  };
  const start = async () => {
    try {
      if (!terminal || !stillLocal()) return finish("failed", "path");
      const checked = await checkedLocalPath(desktop, cwd, platform);
      if (stopped) return;
      if (!checked || !stillLocal()) return finish("failed", "path");
      const session = await terminal.start({ cwd: checked });
      id2 = session.id;
      if (stopped) return release();
      if (!stillLocal() || localPathKey(session.cwd, platform) !== localPathKey(checked, platform)) {
        return finish("failed", "path");
      }
      const command = terminalCommand({ shell: session.shell, platform, cwd: checked, source, script, marker: marker2 });
      if (!command) return finish("failed", "shell");
      if (command.length > (/^cmd/i.test(session.shell) ? 7500 : 24e3)) return finish("failed", "tooLong");
      offData = terminal.onData(id2, (value) => {
        if (stopped || typeof value !== "string") return;
        if (!begun) {
          pending += value;
          const at = pending.indexOf(marker2);
          if (at === -1) {
            pending = pending.slice(-marker2.length);
            return;
          }
          begun = true;
          value = pending.slice(at + marker2.length).replace(/^\r?\n/, "");
          pending = "";
        }
        output = (output + cleanOutput(value)).slice(-18e3);
        update({ state: "running", output });
      });
      offExit = terminal.onExit(id2, (result) => {
        if (!begun) return finish("failed", "start");
        finish(result?.code === 0 ? "done" : "failed", result?.code === 0 ? void 0 : "exit");
      });
      if (!await terminal.attach(id2) || stopped || !stillLocal()) return finish("failed", "start");
      if (!await terminal.write(id2, command)) finish("failed", "start");
    } catch {
      finish("failed", "start");
    }
  };
  void start();
  return () => finish("stopped");
}

// source/local-environment.js
var platforms = ["default", "darwin", "linux", "win32"];
var platformNames = { darwin: "macOS", linux: "Linux", win32: "Windows" };
var icons = { tool: "tools", run: "play", debug: "terminal", test: "check" };
var buttonTypes = Object.keys(icons);
var copy3 = {
  ru: {
    title: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 \u044D\u0442\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
    subtitle: "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u0441\u043A\u0440\u0438\u043F\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u0435\u0439\u0447\u0430\u0441 \u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0435\u0433\u043E \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E \u0434\u043B\u044F \u0431\u0443\u0434\u0443\u0449\u0438\u0445 \u0440\u0430\u0431\u043E\u0447\u0438\u0445 \u0434\u0435\u0440\u0435\u0432\u044C\u0435\u0432",
    advanced: "\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u043D\u044B\u0435 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B",
    setup: "\u0421\u043A\u0440\u0438\u043F\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
    cleanup: "\u0421\u043A\u0440\u0438\u043F\u0442 \u043E\u0447\u0438\u0441\u0442\u043A\u0438",
    setupHint: "\u0417\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F \u0432 \u043A\u043E\u0440\u043D\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043F\u0440\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0435 \u0440\u0430\u0431\u043E\u0447\u0435\u0433\u043E \u0434\u0435\u0440\u0435\u0432\u0430.",
    cleanupHint: "\u041C\u043E\u0436\u043D\u043E \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0432 \u043A\u043E\u0440\u043D\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043F\u0435\u0440\u0435\u0434 \u043E\u0447\u0438\u0441\u0442\u043A\u043E\u0439 \u0440\u0430\u0431\u043E\u0447\u0435\u0433\u043E \u0434\u0435\u0440\u0435\u0432\u0430.",
    name: "\u0418\u043C\u044F",
    default: "\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
    platform: "\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430",
    allPlatforms: "\u0412\u0441\u0435 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B",
    variables: "\u041F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0435",
    variablesTitle: "\u041F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0435 \u0441\u0440\u0435\u0434\u044B \u0441\u043A\u0440\u0438\u043F\u0442\u0430 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438",
    sourcePath: "\u041F\u0443\u0442\u044C \u043A \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u0440\u0430\u0431\u043E\u0447\u0435\u0439 \u043E\u0431\u043B\u0430\u0441\u0442\u0438",
    worktreePath: "\u041F\u0443\u0442\u044C \u043A \u043D\u043E\u0432\u043E\u043C\u0443 \u0440\u0430\u0431\u043E\u0447\u0435\u043C\u0443 \u0434\u0435\u0440\u0435\u0432\u0443",
    copied: "\u041F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0430",
    actions: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F",
    add: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435",
    remove: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435",
    command: "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0439 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0439",
    icon: "\u0417\u043D\u0430\u0447\u043E\u043A",
    actionHint: "\u042D\u0442\u0438 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u043C\u043E\u0433\u0443\u0442 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C \u043B\u044E\u0431\u044B\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u0438 \u0431\u0443\u0434\u0443\u0442 \u043E\u0442\u043E\u0431\u0440\u0430\u0436\u0430\u0442\u044C\u0441\u044F \u0432 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043A\u0435",
    empty: "\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u0441 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u0430\u043D\u0435\u043B\u0438 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u043E\u0432",
    tool: "\u0418\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442",
    run: "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C",
    debug: "\u041E\u0442\u043B\u0430\u0434\u0438\u0442\u044C",
    test: "\u0422\u0435\u0441\u0442",
    setupProject: "\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442",
    save: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C",
    saved: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B",
    compactPlaceholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: npm install",
    discardTitle: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0440\u0435\u0434\u044B?",
    discardHint: "\u0412\u0430\u0448\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0432 \u044D\u0442\u043E\u0439 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0439 \u0441\u0440\u0435\u0434\u0435 \u0431\u0443\u0434\u0443\u0442 \u043F\u043E\u0442\u0435\u0440\u044F\u043D\u044B",
    discard: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C",
    keep: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435",
    conflict: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u0438\u0441\u044C \u0432 \u0434\u0440\u0443\u0433\u043E\u043C \u043E\u043A\u043D\u0435. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0444\u043E\u0440\u043C\u0443 \u0437\u0430\u043D\u043E\u0432\u043E.",
    saveError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
    actionError: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
    runSetup: "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0441\u043A\u0440\u0438\u043F\u0442 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
    runCleanup: "\u0417\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0441\u043A\u0440\u0438\u043F\u0442 \u043E\u0447\u0438\u0441\u0442\u043A\u0438",
    starting: "\u0417\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F\u2026",
    running: "\u0412\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F\u2026",
    done: "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E",
    failed: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0443\u0441\u043A\u0430",
    stopped: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E",
    stop: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C",
    close: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C",
    noOutput: "\u0412\u044B\u0432\u043E\u0434 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0437\u0434\u0435\u0441\u044C",
    path: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0443\u044E \u043F\u0430\u043F\u043A\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
    shell: "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442 \u043E\u0431\u043E\u043B\u043E\u0447\u043A\u0443, \u043A\u043E\u0442\u043E\u0440\u0430\u044F \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u0434\u043B\u044F \u044D\u0442\u043E\u0433\u043E \u0441\u043A\u0440\u0438\u043F\u0442\u0430",
    start: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0441\u043A\u0440\u0438\u043F\u0442 \u0432 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u0435 Hermes",
    exit: "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B\u0430\u0441\u044C \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439",
    tooLong: "\u0421\u043A\u0440\u0438\u043F\u0442 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0434\u043B\u0438\u043D\u043D\u044B\u0439 \u0434\u043B\u044F \u0437\u0430\u043F\u0443\u0441\u043A\u0430 \u0432 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u0435"
  },
  en: {
    title: "Set up this project",
    subtitle: "Run a setup script now and reuse it for future worktrees",
    advanced: "Advanced options",
    setup: "Setup script",
    cleanup: "Cleanup script",
    setupHint: "Runs at the project root when setting up a worktree.",
    cleanupHint: "Can run at the project root before worktree cleanup.",
    name: "Name",
    default: "Default",
    platform: "Platform",
    allPlatforms: "All platforms",
    variables: "Variables",
    variablesTitle: "Setup script environment variables",
    sourcePath: "Source workspace path",
    worktreePath: "Worktree path",
    copied: "Variable copied",
    actions: "Actions",
    add: "Add action",
    remove: "Remove action",
    command: "Action script",
    icon: "Icon",
    actionHint: "These actions can run any command and will be displayed in the header",
    empty: "Add an action to run commands from the local toolbar",
    tool: "Tool",
    run: "Run",
    debug: "Debug",
    test: "Test",
    setupProject: "Set up project",
    save: "Save",
    saved: "Project settings saved",
    compactPlaceholder: "For example: npm install",
    discardTitle: "Discard local environment draft?",
    discardHint: "Your changes to this local environment will be lost",
    discard: "Discard",
    keep: "Keep editing",
    conflict: "Settings changed in another window. Reopen the form.",
    saveError: "Could not save the project settings",
    actionError: "This action is unavailable for the project",
    runSetup: "Run setup script",
    runCleanup: "Run cleanup script",
    starting: "Starting\u2026",
    running: "Running\u2026",
    done: "Completed",
    failed: "Could not run",
    stopped: "Stopped",
    stop: "Stop",
    close: "Close",
    noOutput: "Output will appear here",
    path: "Could not verify the local project directory",
    shell: "The terminal shell is unsupported for this script",
    start: "Could not launch the script in the Hermes terminal",
    exit: "The command exited with an error",
    tooLong: "The script is too long for the terminal"
  }
};
var words = () => document.documentElement.matches(":lang(ru)") ? copy3.ru : copy3.en;
var scriptFor = (scripts, platform) => scripts?.[platform]?.trim() ? scripts[platform] : scripts?.default ?? "";
var folderName = (value) => value.split(/[\\/]/).filter(Boolean).at(-1) || value;
var emptyEnvironment = (name) => ({ name, setup: {}, cleanup: {}, actions: [] });
var scriptPlaceholder = {
  setup: 'cd "$CODEX_WORKTREE_PATH"\npip install -r requirements.txt\nnpm install\n./run/setup.sh',
  cleanup: "docker compose down --remove-orphans\nrm -rf .cache/tmp"
};
var windowsPlaceholder = {
  setup: "python -m pip install -r requirements.txt\npnpm install",
  cleanup: "docker compose down --remove-orphans"
};
function icon6(name, className) {
  return h10("span", { "aria-hidden": true, className, "data-hcv-env-icon": "", style: codexIconStyle(name) });
}
function Variables({ t, copyVariable }) {
  return h10(
    Popover,
    null,
    h10(PopoverTrigger, { asChild: true }, h10("button", { type: "button", className: "hcv-env-secondary" }, t.variables)),
    h10(
      PopoverContent,
      { align: "end", sideOffset: 4, "data-hcv-env-vars": "" },
      h10("strong", null, t.variablesTitle),
      [[sourceTreeVariable, t.sourcePath], [worktreeVariable, t.worktreePath]].map(([name, text]) => h10(
        "div",
        { key: name },
        h10("button", {
          type: "button",
          title: name,
          onClick: () => void copyVariable(name)
        }, h10("code", null, name), icon6("copy")),
        h10("span", null, text)
      ))
    )
  );
}
function ScriptEditor({ type, scripts, setScripts, compact, t, copyVariable }) {
  const [platform, setPlatform] = useState8("default");
  const id2 = `hcv-env-${type}`;
  const label = t[type];
  const selectWithKeys = (event) => {
    const previous = platforms.indexOf(platform);
    const next = { ArrowLeft: previous + platforms.length - 1, ArrowRight: previous + 1, Home: 0, End: platforms.length - 1 }[event.key];
    if (next === void 0) return;
    event.preventDefault();
    const index = next % platforms.length;
    setPlatform(platforms[index]);
    event.currentTarget.children[index]?.focus();
  };
  const value = scripts[platform] || "";
  const placeholder = compact ? t.compactPlaceholder : (platform === "win32" ? windowsPlaceholder : scriptPlaceholder)[type];
  const field = h10("textarea", {
    id: id2,
    value,
    placeholder,
    spellCheck: false,
    rows: 6,
    maxLength: 6e3,
    onChange: (event) => setScripts({ ...scripts, [platform]: event.target.value })
  });
  return h10(
    "section",
    { className: "hcv-env-script" },
    h10(
      "div",
      { className: "hcv-env-section-title" },
      h10(
        "div",
        null,
        h10("label", { htmlFor: id2 }, label),
        !compact && h10("p", null, type === "setup" ? t.setupHint : t.cleanupHint)
      ),
      !compact && type === "setup" && h10(Variables, { t, copyVariable })
    ),
    compact ? field : h10(
      "div",
      null,
      h10(
        "div",
        { role: "tablist", "aria-label": `${label} \xB7 ${t.platform}`, onKeyDown: selectWithKeys, className: "hcv-env-platforms" },
        platforms.map((value2) => h10("button", {
          key: value2,
          id: `${id2}-tab-${value2}`,
          type: "button",
          role: "tab",
          "aria-selected": value2 === platform,
          "aria-controls": `${id2}-platform`,
          tabIndex: value2 === platform ? 0 : -1,
          onClick: () => setPlatform(value2)
        }, platformNames[value2] || t.default))
      ),
      h10("div", { role: "tabpanel", id: `${id2}-platform`, "aria-labelledby": `${id2}-tab-${platform}` }, field)
    )
  );
}
function Actions({ actions, onChange, t }) {
  const update = (id2, patch) => onChange(actions.map((action) => action.id === id2 ? { ...action, ...patch } : action));
  return h10(
    "section",
    { className: "hcv-env-actions" },
    h10(
      "div",
      { className: "hcv-env-section-title" },
      h10("h3", null, t.actions),
      h10("button", {
        type: "button",
        className: "hcv-env-secondary",
        onClick: () => onChange([...actions, { id: crypto.randomUUID(), name: "", command: "", platform: "default", icon: "tool" }])
      }, t.add)
    ),
    h10("p", null, t.actionHint),
    actions.length === 0 ? h10("div", { className: "hcv-env-empty" }, t.empty) : actions.map((action) => h10(
      "div",
      { key: action.id, className: "hcv-env-card hcv-env-action", "data-hcv-env-action": "" },
      h10(
        "div",
        { className: "hcv-env-action-heading" },
        h10(
          "label",
          { className: "hcv-env-field hcv-env-action-icon" },
          t.icon,
          h10(
            "div",
            null,
            icon6(icons[action.icon] || "tools"),
            h10(
              "select",
              { value: action.icon, onChange: (event) => update(action.id, { icon: event.target.value }) },
              buttonTypes.map((type) => h10("option", { value: type, key: type }, t[type]))
            )
          )
        ),
        h10(
          "label",
          { className: "hcv-env-field" },
          t.name,
          h10("input", { value: action.name, maxLength: 100, onChange: (event) => update(action.id, { name: event.target.value }) })
        ),
        h10("button", {
          type: "button",
          "aria-label": t.remove,
          title: t.remove,
          onClick: () => onChange(actions.filter((item) => item.id !== action.id))
        }, icon6("trash"))
      ),
      h10(
        "label",
        { className: "hcv-env-field" },
        t.platform,
        h10(
          "select",
          { value: action.platform, onChange: (event) => update(action.id, { platform: event.target.value }) },
          platforms.map((value) => h10("option", { value, key: value }, platformNames[value] || t.allPlatforms))
        )
      ),
      h10(
        "label",
        { className: "hcv-env-field" },
        t.command,
        h10("textarea", {
          rows: 3,
          maxLength: 6e3,
          spellCheck: false,
          value: action.command,
          placeholder: "npm run dev",
          onChange: (event) => update(action.id, { command: event.target.value })
        })
      )
    ))
  );
}
function EnvironmentDialog({ target, close, save }) {
  const { t, original, platform, trigger, revision, copyVariable } = target;
  const [draft, setDraft] = useState8(original);
  const [advanced, setAdvanced] = useState8(false);
  const [discard, setDiscard] = useState8(false);
  const [saving, setSaving] = useState8(false);
  const [error, setError] = useState8("");
  const heading = useRef6(null);
  const savingRef = useRef6(false);
  const edit3 = (patch) => setDraft((previous) => ({ ...previous, ...patch }));
  const dirty = JSON.stringify(original) !== JSON.stringify(draft);
  const setup = scriptFor(draft.setup, platform);
  const runSetup = Boolean(setup.trim()) && (!revision || scriptFor(original.setup, platform) !== setup);
  const content = [draft.setup, draft.cleanup].some((scripts) => Object.values(scripts).some((value) => value.trim())) || draft.actions.some((action) => action.name.trim() && action.command.trim());
  const complete = draft.actions.every((action) => Boolean(action.name.trim()) === Boolean(action.command.trim()));
  const disabled = saving || !dirty || !draft.name.trim() || !complete || !content && !revision;
  const requestClose = () => {
    if (savingRef.current) return;
    if (dirty) setDiscard(true);
    else close();
  };
  const submit = async (event) => {
    event.preventDefault();
    if (disabled || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const config = { ...draft, name: draft.name.trim(), actions: draft.actions.filter((action) => action.name.trim()) };
    try {
      await save(target, config, runSetup ? setup : "");
    } catch (error2) {
      setError(error2?.message === "conflict" ? t.conflict : error2?.message === "path" ? t.path : t.saveError);
      savingRef.current = false;
      setSaving(false);
    }
  };
  const setupEditor = h10(ScriptEditor, { type: "setup", scripts: draft.setup, setScripts: (setup2) => edit3({ setup: setup2 }), compact: !advanced, t, copyVariable });
  return h10(
    Dialog2,
    { open: true, onOpenChange: (open) => {
      if (!open) requestClose();
    } },
    h10(
      DialogContent2,
      {
        "data-hcv-local-environment": "",
        "data-hcv-env-advanced": String(advanced),
        bodyClassName: "hcv-env-body",
        overlayClassName: "hcv-env-overlay",
        blurBackdrop: false,
        showCloseButton: !saving,
        onEscapeKeyDown: (event) => {
          if (savingRef.current || discard) event.preventDefault();
        },
        onOpenAutoFocus: (event) => {
          event.preventDefault();
          heading.current?.focus();
        },
        onCloseAutoFocus: (event) => {
          if (trigger?.isConnected) {
            event.preventDefault();
            trigger.focus({ preventScroll: true });
          }
        }
      },
      h10(DialogHeader2, null, h10(DialogTitle2, { ref: heading, tabIndex: -1 }, t.title), h10(DialogDescription2, null, t.subtitle)),
      h10(
        "form",
        { onSubmit: submit, className: "hcv-env-form" },
        h10(
          "fieldset",
          { disabled: saving },
          !advanced && setupEditor,
          h10("button", {
            type: "button",
            className: "hcv-env-disclosure",
            "aria-expanded": advanced,
            "aria-controls": "hcv-env-options",
            onClick: () => setAdvanced((previous) => !previous)
          }, t.advanced, icon6("right")),
          advanced && h10(
            "div",
            { className: "hcv-env-options", id: "hcv-env-options" },
            h10(
              "label",
              { className: "hcv-env-card hcv-env-field" },
              t.name,
              h10("input", { value: draft.name, maxLength: 120, onChange: (event) => edit3({ name: event.target.value }) })
            ),
            setupEditor,
            h10(ScriptEditor, { type: "cleanup", scripts: draft.cleanup, setScripts: (cleanup) => edit3({ cleanup }), t }),
            h10(Actions, { actions: draft.actions, onChange: (actions) => edit3({ actions }), t })
          ),
          error && h10("p", { role: "alert", className: "hcv-env-error" }, error),
          h10(DialogFooter2, null, h10(Button2, { type: "submit", disabled }, runSetup || !revision && !content ? t.setupProject : t.save))
        )
      ),
      h10(
        Dialog2,
        { open: discard, onOpenChange: setDiscard },
        h10(
          DialogContent2,
          { "data-hcv-env-confirm": "", showCloseButton: false, blurBackdrop: false },
          h10(DialogHeader2, null, h10(DialogTitle2, null, t.discardTitle), h10(DialogDescription2, null, t.discardHint)),
          h10(
            DialogFooter2,
            null,
            h10(Button2, { type: "button", variant: "outline", onClick: () => setDiscard(false) }, t.keep),
            h10(Button2, { type: "button", variant: "destructive", onClick: close }, t.discard)
          )
        )
      )
    )
  );
}
function TerminalResult({ result, stop, close }) {
  const { state, title, cwd, output, error, t } = result;
  const running = state === "running" || state === "starting";
  const status = error ? t[error] : t[state];
  return h10(
    Dialog2,
    { open: true, onOpenChange: (open) => {
      if (!open && !running) close();
    } },
    h10(
      DialogContent2,
      { "data-hcv-env-terminal": "", showCloseButton: !running, blurBackdrop: false },
      h10(DialogHeader2, null, h10(DialogTitle2, null, title), h10(DialogDescription2, null, cwd)),
      h10("div", { role: "status", "data-hcv-env-run-state": state }, status),
      h10("pre", { tabIndex: 0 }, output || t.noOutput),
      h10(DialogFooter2, null, h10(Button2, { type: "button", onClick: running ? stop : close }, running ? t.stop : t.close))
    )
  );
}
function EnvironmentSlot({ model, result, close, save, stop, closeResult }) {
  const target = useValue5(model);
  const run = useValue5(result);
  if (target) return h10(EnvironmentDialog, { key: target.key, target, close, save });
  return run ? h10(TerminalResult, { result: run, stop, close: closeResult }) : null;
}
function registerLocalEnvironment(ctx, active2) {
  const root = document.documentElement;
  const model = atom4(null);
  const result = atom4(null);
  const revisionSignal = atom4(0);
  const platform = desktopPlatform();
  const close = () => model.set(null);
  const closeResult = () => result.set(null);
  const storageKey3 = (scope2) => `local-environment-v1:${localPathKey(scope2.source, platform)}`;
  const read = (scope2) => ctx.storage.get(storageKey3(scope2), null);
  const sheet = document.createElement("style");
  sheet.dataset.hcvLocalEnvironmentStyles = "";
  sheet.textContent = styles(active2);
  document.head.append(sheet);
  let cancelRun, disposed = false;
  let request = 0;
  const local = () => !disposed && host10.state.connectionId.get() === "local";
  const enabled = () => local() && root.matches(active2);
  const notify = (message, kind = "error") => host10.notify({ kind, message });
  const idle = () => !model.get() && !result.get();
  async function scopeFor(cwd) {
    if (!enabled() || !platform) return null;
    const desktop = window.hermesDesktop;
    const directory = await checkedLocalPath(desktop, cwd, platform).catch(() => null);
    if (!directory || !enabled()) return null;
    const owner = { connectionId: "local", profile: host10.state.profile.get() };
    let entries = await readWorkspaceTrees(directory, owner, true).catch(() => []);
    if (!entries.length) entries = await readWorkspaceTrees(directory, owner, false).catch(() => []);
    const current = localPathKey(directory, platform);
    const checkout = entries.reduce((closest, entry) => {
      const key = localPathKey(entry.path, platform);
      return key && (key === current || current.startsWith(`${key}/`)) && key.length > closest.key.length ? { path: entry.path, key } : closest;
    }, { path: directory, key: "" }).path;
    const source = entries.find((entry) => entry.isMain)?.path || checkout;
    const paths = await Promise.all([checkout, source].map((path) => checkedLocalPath(desktop, path, platform).catch(() => null)));
    return enabled() && paths.every(Boolean) ? { cwd: paths[0], source: paths[1] } : null;
  }
  const startRun = ({ cwd, source, script, title, t }) => {
    result.set({ cwd, title, t, output: "", state: "starting" });
    cancelRun = runLocalScript({
      desktop: window.hermesDesktop,
      platform,
      cwd,
      source,
      script,
      stillLocal: local,
      update: (patch) => {
        if (!disposed && result.get()) result.set({ ...result.get(), ...patch });
      }
    });
  };
  async function save(target, config, setup) {
    const scope2 = await scopeFor(target.cwd);
    if (!scope2 || target !== model.get() || storageKey3(scope2) !== storageKey3(target)) throw new Error("path");
    if ((read(scope2)?.revision || "") !== target.revision) throw new Error("conflict");
    const revision = crypto.randomUUID();
    ctx.storage.set(storageKey3(scope2), { revision, config });
    if (read(scope2)?.revision !== revision) throw new Error("save");
    revisionSignal.set(revisionSignal.get() + 1);
    close();
    if (setup) startRun({ ...scope2, script: setup, title: target.t.setup, t: target.t });
    else notify(target.t.saved, "success");
  }
  function commands(config, t) {
    if (!config) return [];
    return [
      { id: "setup", label: t.runSetup, icon: "tools", script: scriptFor(config.setup, platform) },
      { id: "cleanup", label: t.runCleanup, icon: "trash", script: scriptFor(config.cleanup, platform) },
      ...config.actions.filter((action) => action.platform === "default" || action.platform === platform).map((action) => ({ id: action.id, label: action.name, icon: icons[action.icon] || "tools", script: action.command }))
    ].filter((command) => command.script.trim());
  }
  ctx.register({
    id: "local-environment-dialog",
    area: TITLEBAR_AREAS4.center,
    render: () => h10(EnvironmentSlot, { model, result, close, save, stop: () => cancelRun?.(), closeResult })
  });
  ctx.onDispose(() => {
    disposed = true;
    cancelRun?.();
    close();
    closeResult();
    sheet.remove();
  });
  return {
    revision: revisionSignal,
    async open({ cwd, projectName, trigger }) {
      if (!idle()) return false;
      const key = ++request;
      const t = words();
      const scope2 = await scopeFor(cwd);
      if (key !== request || !idle() || disposed) return false;
      if (!scope2) {
        notify(t.path);
        return false;
      }
      const saved = read(scope2);
      model.set({
        ...scope2,
        key,
        t,
        trigger,
        platform,
        revision: saved?.revision || "",
        original: saved?.config || emptyEnvironment(projectName?.trim() || folderName(scope2.source)),
        copyVariable: async (name) => {
          if (await ctx.os.writeClipboard(name)) notify(t.copied, "success");
        }
      });
      return true;
    },
    async name(cwd) {
      const scope2 = await scopeFor(cwd);
      return scope2 ? read(scope2)?.config.name || "" : "";
    },
    async actions(cwd) {
      const scope2 = await scopeFor(cwd);
      return scope2 ? commands(read(scope2)?.config, words()).map(({ id: id2, label, icon: icon8 }) => ({ id: id2, label, icon: icon8 })) : [];
    },
    async run({ cwd, id: id2 }) {
      if (!idle()) return false;
      const key = ++request;
      const t = words();
      const scope2 = await scopeFor(cwd);
      if (key !== request || !idle() || disposed) return false;
      const command = scope2 && commands(read(scope2)?.config, t).find((command2) => command2.id === id2);
      if (!command) {
        notify(t.actionError);
        return false;
      }
      startRun({ ...scope2, script: command.script, title: command.label, t });
      return true;
    }
  };
}
function styles(active2) {
  const form = `${active2} [data-hcv-local-environment]`;
  const vars = `${active2} [data-hcv-env-vars]`;
  const terminal = `${active2} [data-hcv-env-terminal]`;
  return `
  ${form}, ${terminal}, ${active2} [data-hcv-env-confirm] {
    inline-size: min(420px, calc(100vw - 32px)); max-inline-size: none;
    max-block-size: calc(100dvh - 40px); border: 0; border-radius: 20px;
    background: var(--hcv-menu); color: var(--hcv-text); font-family: var(--hcv-ui-font);
  }
  ${form} {
    background: light-dark(var(--hcv-menu), #2a2a2a);
    --hcv-env-field-fill: light-dark(var(--hcv-form-surface), #2d2d2d);
    --hcv-env-card-fill: light-dark(var(--hcv-panel), #232323);
    --hcv-env-control-fill: light-dark(var(--hcv-hover-menu), #333);
  }
  ${active2} .hcv-env-overlay { background: rgb(0 0 0 / 25%); backdrop-filter: none; }
  ${form} .hcv-env-body { display: flex; flex-direction: column; overflow: hidden; gap: 0; padding: 20px; }
  ${form} [data-slot="dialog-header"], ${terminal} [data-slot="dialog-header"] { gap: 4px; text-align: start; padding-inline-end: 20px; }
  ${form} [data-slot="dialog-title"], ${terminal} [data-slot="dialog-title"] { font-size: 20px; font-weight: 600; line-height: 26px; }
  ${form} [data-slot="dialog-title"]:focus { outline: none; }
  ${form} [data-slot="dialog-description"], ${terminal} [data-slot="dialog-description"] { font-size: 14px; line-height: 20px; color: var(--hcv-muted); overflow-wrap: anywhere; }
  ${form} [data-slot="dialog-close-button"] { inset-block-start: 16px; inset-inline-end: 16px; inline-size: 24px; block-size: 24px; border-radius: 8px; }
  ${codexIconRules(`${form} [data-slot="dialog-close-button"] > svg`, "close")}
  ${form} .hcv-env-form { min-block-size: 0; overflow: auto; overscroll-behavior: contain; padding: 44px 13px 0; }
  ${form}[data-hcv-env-advanced="true"] .hcv-env-form { padding-block-start: 28px; }
  ${form} fieldset { display: flex; min-inline-size: 0; flex-direction: column; gap: 16px; }
  ${form} .hcv-env-options { display: flex; flex-direction: column; gap: 10px; }
  ${form} .hcv-env-section-title { display: flex; align-items: start; justify-content: space-between; gap: 8px; }
  ${form} :is(.hcv-env-section-title label, h3, .hcv-env-disclosure) { font-size: 16px; font-weight: 600; line-height: 24px; }
  ${form} p { margin: 0; color: var(--hcv-muted); font-size: 13px; line-height: 18px; }
  ${form} .hcv-env-script { display: flex; flex-direction: column; gap: 12px; }
  ${form}[data-hcv-env-advanced="false"] .hcv-env-script { gap: 14px; }
  ${form}[data-hcv-env-advanced="false"] .hcv-env-script label { font-size: 14px; }
  ${form} :is(input, textarea, select) {
    inline-size: 100%; min-inline-size: 0; padding: 8px 10px;
    border: 1px solid var(--hcv-hairline); border-radius: 8px;
    background: var(--hcv-env-field-fill); color: var(--hcv-text); font: 13px/18px var(--hcv-ui-font);
  }
  ${form} textarea { display: block; min-block-size: 80px; resize: vertical; font: 12px/18px ui-monospace, Consolas, monospace; }
  ${form} .hcv-env-script textarea { block-size: 128px; }
  ${form} textarea::placeholder { color: var(--hcv-muted); opacity: .8; }
  ${form} .hcv-env-disclosure { display: flex; align-items: center; gap: 8px; min-block-size: 40px; text-align: start; border-block-end: 1px solid var(--hcv-hairline); }
  ${form} .hcv-env-disclosure [data-hcv-env-icon] { inline-size: 12px; block-size: 12px; }
  ${form} .hcv-env-disclosure[aria-expanded="true"] [data-hcv-env-icon] { transform: rotate(90deg); }
  ${form} .hcv-env-platforms { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin-block-end: 6px; }
  ${form} .hcv-env-platforms button { min-block-size: 24px; padding: 0 8px; border-radius: 999px; color: var(--hcv-muted); font-size: 13px; }
  ${form} .hcv-env-platforms button[aria-selected="true"] { background: var(--hcv-env-control-fill); color: var(--hcv-text); }
  ${form} :is(.hcv-env-secondary, .hcv-env-action-heading button) {
    min-block-size: 28px; padding: 3px 8px; border-radius: 10px; background: var(--hcv-env-control-fill);
    color: var(--hcv-text); font-size: 13px; white-space: nowrap;
  }
  ${form} :is(button, select):not(:disabled) { cursor: pointer; }
  ${form} :is(button, input, textarea, select):focus-visible, ${vars} button:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${form} .hcv-env-card, ${form} .hcv-env-empty { background: var(--hcv-env-card-fill); border-radius: 16px; padding: 14px 16px; }
  ${form} .hcv-env-field { display: flex; flex-direction: column; gap: 4px; min-inline-size: 0; font-size: 13px; font-weight: 600; }
  ${form} .hcv-env-actions { display: flex; flex-direction: column; gap: 8px; }
  ${form} .hcv-env-empty { padding: 14px 18px; text-align: center; color: var(--hcv-muted); font-size: 13px; line-height: 18px; }
  ${form} .hcv-env-action { display: grid; gap: 10px; }
  ${form} .hcv-env-action-heading { display: grid; grid-template-columns: minmax(0, 112px) minmax(0, 1fr) auto; gap: 6px; align-items: end; }
  ${form} .hcv-env-action-icon > div { position: relative; }
  ${form} .hcv-env-action-icon [data-hcv-env-icon] { position: absolute; inset-block-start: 10px; inset-inline-start: 7px; pointer-events: none; }
  ${form} .hcv-env-action-icon select { padding-inline-start: 25px; }
  ${form} .hcv-env-action-heading button { block-size: 36px; }
  ${form} [data-slot="dialog-footer"] { justify-content: flex-end; margin-block-start: 20px; }
  ${form}[data-hcv-env-advanced="true"] [data-slot="dialog-footer"] { margin-block-start: 4px; }
  ${form} [type="submit"] { min-block-size: 28px; block-size: 28px; padding-inline: 9px; border-radius: 9px; background: var(--hcv-action); color: var(--hcv-ink); font: 13px/18px var(--hcv-ui-font); }
  ${form} [type="submit"]:disabled { opacity: .46; }
  ${form} .hcv-env-error { color: var(--dt-destructive); }
  ${form} [data-hcv-env-icon], ${vars} [data-hcv-env-icon] { display: inline-block; flex: none; inline-size: 16px; block-size: 16px; }
  ${vars} { inline-size: min(320px, var(--radix-popover-content-available-width)); padding: 8px; border-radius: 16px; background: var(--hcv-menu); color: var(--hcv-text); font: 13px/18px var(--hcv-ui-font); }
  ${vars} > div { display: grid; gap: 3px; margin-block-start: 4px; }
  ${vars} > div span:not([data-hcv-env-icon]) { color: var(--hcv-muted); }
  ${vars} button { display: flex; justify-content: space-between; gap: 6px; padding: 5px 8px; border-radius: 7px; background: var(--hcv-hover-menu); text-align: start; overflow-wrap: anywhere; }
  ${terminal} { inline-size: min(560px, calc(100vw - 32px)); }
  ${terminal} pre { max-block-size: min(50dvh, 380px); overflow: auto; overscroll-behavior: contain; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; border-radius: 10px; background: var(--hcv-panel); font: 12px/18px ui-monospace, Consolas, monospace; }
  ${terminal} [data-hcv-env-run-state="failed"] { color: var(--dt-destructive); }
  @media (prefers-reduced-motion: no-preference) { ${form} .hcv-env-disclosure [data-hcv-env-icon] { transition: transform 140ms ease-out; } }
`;
}

// source/turns.js
import { host as host11 } from "@hermes/plugin-sdk";
var response2 = '[data-slot="aui_response-group"]';
var assistant = '[data-slot="aui_assistant-message-root"]';
var answer = '[data-slot="aui_assistant-message-content"]';
var duration2 = '[data-slot="aui_turn-duration"]';
var changes = '[data-slot="aui_changed-files"]';
var transcript3 = '[data-slot="aui_thread-content"]';
var promptRoot = '[data-slot="aui_turn-pair"] > [data-slot="aui_user-message-root"][data-message-id]';
var primary2 = '[data-chat-surface][data-composer-target="main"]';
var nativeActivity = ':is([data-slot="aui_response-loading"], [data-slot="aui_turn-activity"][data-state="active"])';
var activeIndicators = `[data-chat-surface] :is(${nativeActivity}, [data-hcv-live-turn])`;
var streaming = '[data-message-streaming="true"]';
var step = ':is([data-conversation-scaffold]:not([role="status"]), [data-slot="tool-block"], [data-slot="aui_reasoning-text"])';
var actionable = ':is([role="alert"], [data-approval-activity-only], [data-approval-stack], [data-clarify-choices], [data-clarify-late-choices], [data-clarify-batch-preview], [data-clarify-batch-question]:not([data-locked]))';
var protectedStep = `:is(${actionable}, [data-slot="aui_artifact-card"], [data-slot="aui_generated-image"], [data-delegate-card], [data-hcv-agent-rows], svg.text-destructive[aria-label])`;
var isRussian = () => document.documentElement.lang.toLowerCase().startsWith("ru");
function make(tag, marker2, text) {
  const node2 = document.createElement(tag);
  node2.setAttribute(`data-hcv-${marker2}`, "");
  node2.setAttribute("data-hcv-generated", "");
  if (text) node2.textContent = text;
  return node2;
}
function updateText(node2, text) {
  if (node2.textContent !== text) node2.textContent = text;
}
function durationSeconds(value) {
  const match = value?.match(/(\d+)(?:\:(\d{2})|s)\s*$/);
  if (!match) return null;
  return match[2] === void 0 ? Number(match[1]) : Number(match[1]) * 60 + Number(match[2]);
}
function formatDuration2(seconds) {
  if (seconds === null) return "";
  const units = isRussian() ? ["\u0447", "\u043C\u0438\u043D", "\u0441"] : ["h", "min", "s"];
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].flatMap((value, index) => value || index === 2 && seconds === 0 ? [`${value} ${units[index]}`] : []).join(" ");
}
function findSteps(group, roots, final2) {
  const canFold = (node2) => !node2.matches(protectedStep) && !node2.querySelector(protectedStep);
  const earlier = roots.slice(0, roots.indexOf(final2)).filter(canFold);
  const body = final2.querySelector(answer);
  const detail = [...body?.querySelectorAll(step) || []].filter((node2) => !node2.parentElement.closest(step) && canFold(node2));
  const prose2 = [...body?.querySelectorAll(".aui-md") || []].filter((node2) => !node2.parentElement.closest(step));
  const lastStep = detail.at(-1);
  const commentary = lastStep ? prose2.slice(0, -1).filter(
    (node2) => canFold(node2) && Boolean(node2.compareDocumentPosition(lastStep) & Node.DOCUMENT_POSITION_FOLLOWING)
  ) : [];
  return [...earlier, ...detail, ...commentary].filter((node2) => node2.closest(response2) === group);
}
function clearSteps(group, state) {
  for (const node2 of state.steps) node2.removeAttribute("data-hcv-turn-step");
  state.steps.clear();
  state.bar?.remove();
  state.bar = null;
  group.removeAttribute("data-hcv-turn-folded");
  group.removeAttribute("data-hcv-turn-summary");
}
function showSummary(group, state, steps, elapsed) {
  const hasSteps = steps.length > 0;
  if (!state.bar || state.bar.tagName === "BUTTON" !== hasSteps) {
    clearSteps(group, state);
    const bar = make(hasSteps ? "button" : "div", "turn-line");
    if (hasSteps) {
      bar.type = "button";
      bar.setAttribute("aria-expanded", "false");
      group.setAttribute("data-hcv-turn-folded", "");
      bar.addEventListener("click", () => {
        const open = group.toggleAttribute("data-hcv-turn-folded") === false;
        bar.setAttribute("aria-expanded", String(open));
      });
    }
    state.bar = bar;
  }
  if (group.firstElementChild !== state.bar) group.prepend(state.bar);
  updateText(state.bar, elapsed ? isRussian() ? `\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E \u0437\u0430 ${elapsed}` : `Worked for ${elapsed}` : isRussian() ? "\u0428\u0430\u0433\u0438 \u0440\u0430\u0431\u043E\u0442\u044B" : "Activity");
  group.toggleAttribute("data-hcv-turn-summary", Boolean(elapsed));
  const next = new Set(steps);
  for (const node2 of state.steps) if (!next.has(node2)) node2.removeAttribute("data-hcv-turn-step");
  for (const node2 of next) if (!state.steps.has(node2)) node2.setAttribute("data-hcv-turn-step", "");
  state.steps = next;
}
function clearLive(state) {
  state.live?.row.remove();
  state.live = null;
}
function showLive(root, state, now) {
  if (!state.live) {
    const row3 = make("div", "live-turn");
    const time2 = make("time", "live-time");
    row3.setAttribute("role", "status");
    time2.setAttribute("aria-hidden", "true");
    row3.append(time2);
    state.live = { row: row3, time: time2 };
  }
  const { row: row2, time } = state.live;
  const body = root.querySelector(answer);
  if (body && body.nextElementSibling !== row2) body.after(row2);
  const seconds = Math.max(0, Math.floor((now - state.startedAt) / 1e3));
  updateText(time, seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
}
function syncThinkingLabels(labels10, enabled) {
  const visible = /* @__PURE__ */ new Set();
  const text = isRussian() ? "\u0414\u0443\u043C\u0430\u044E" : "Thinking";
  for (const row2 of enabled ? document.querySelectorAll(activeIndicators) : []) {
    if (row2.querySelector(':scope > :not(.dither, [aria-hidden="true"], [data-hcv-thinking])')) continue;
    visible.add(row2);
    let label = labels10.get(row2);
    if (!label) {
      label = make("span", "thinking");
      const sweep = make("span", "thinking-sweep");
      sweep.setAttribute("aria-hidden", "true");
      label.append(document.createTextNode(""), sweep);
      labels10.set(row2, label);
    }
    if (label.firstChild.data !== text) {
      label.firstChild.data = text;
      label.lastElementChild.dataset.hcvThinkingSweep = text;
    }
    if (label.parentElement !== row2) row2.prepend(label);
  }
  for (const [row2, label] of labels10) {
    if (visible.has(row2)) continue;
    label.remove();
    labels10.delete(row2);
  }
}
function fileNoun(count) {
  if (!isRussian()) return count === 1 ? "file" : "files";
  return { one: "\u0444\u0430\u0439\u043B", few: "\u0444\u0430\u0439\u043B\u0430", many: "\u0444\u0430\u0439\u043B\u043E\u0432" }[new Intl.PluralRules("ru").select(count)] || "\u0444\u0430\u0439\u043B\u043E\u0432";
}
function sumLines(rows, className) {
  return rows.reduce((sum, row2) => {
    const digits = row2.querySelector(`[class~="${className}"]`)?.textContent.replace(/[^0-9]/g, "");
    return sum + (Number(digits) || 0);
  }, 0);
}
function clearFiles(state) {
  const files = state.files;
  if (!files) return;
  files.heading.remove();
  files.more.remove();
  files.checkpoint.remove();
  files.nativeTitle.removeAttribute("data-hcv-file-native-title");
  if (files.review.getAttribute("aria-label") === files.review.getAttribute("data-hcv-file-review")) {
    if (files.originalReviewLabel === null) files.review.removeAttribute("aria-label");
    else files.review.setAttribute("aria-label", files.originalReviewLabel);
  }
  files.review.removeAttribute("data-hcv-file-review");
  files.card.removeAttribute("data-hcv-file-card");
  files.card.removeAttribute("data-hcv-files-open");
  files.card.removeAttribute("data-hcv-files-foldable");
  state.files = null;
}
function showFiles(state, card) {
  const header = card?.children[0];
  const list = card?.children[1];
  const nativeTitle = header?.querySelector(":scope > span");
  const review = header?.querySelector(":scope > button:not([data-hcv-generated])");
  if (!nativeTitle || !review || !list) return clearFiles(state);
  if (state.files?.card !== card || state.files.nativeTitle !== nativeTitle || state.files.review !== review) {
    clearFiles(state);
    const heading2 = make("div", "files-heading");
    const name2 = make("span", "files-title");
    const totals = make("span", "files-totals");
    const added2 = make("span", "files-added");
    const removed2 = make("span", "files-removed");
    totals.append(added2, removed2);
    heading2.append(name2, totals);
    const more2 = make("button", "files-more");
    more2.type = "button";
    more2.setAttribute("aria-expanded", "false");
    more2.addEventListener("click", () => {
      more2.setAttribute("aria-expanded", String(card.toggleAttribute("data-hcv-files-open")));
      updateMoreLabel(state.files);
    });
    const checkpoint2 = make("button", "files-checkpoint");
    checkpoint2.type = "button";
    checkpoint2.addEventListener("click", () => nativeCheckpoint(card)?.click());
    state.files = { card, nativeTitle, review, originalReviewLabel: review.getAttribute("aria-label"), heading: heading2, name: name2, added: added2, removed: removed2, more: more2, checkpoint: checkpoint2, remaining: 0 };
  }
  const { heading, name, added, removed, more, checkpoint } = state.files;
  if (heading.parentElement !== header) nativeTitle.after(heading);
  const rows = [...list.querySelectorAll(":scope > button")];
  if (!rows.length) return clearFiles(state);
  card.setAttribute("data-hcv-file-card", "");
  nativeTitle.setAttribute("data-hcv-file-native-title", "");
  const reviewLabel = isRussian() ? "\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F" : "View changes";
  review.setAttribute("data-hcv-file-review", reviewLabel);
  review.setAttribute("aria-label", reviewLabel);
  const restore = nativeCheckpoint(card);
  if (restore) {
    updateText(checkpoint, isRussian() ? "\u0427\u0435\u043A\u043F\u043E\u0438\u043D\u0442" : "Checkpoint");
    checkpoint.title = restore.getAttribute("aria-label");
    if (checkpoint.parentElement !== header) review.before(checkpoint);
  } else {
    checkpoint.remove();
  }
  const count = rows.length;
  updateText(name, isRussian() ? `\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u043E ${count} ${fileNoun(count)}` : `${count} ${fileNoun(count)} changed`);
  const plus = sumLines(rows, "text-(--ui-green)");
  const minus = sumLines(rows, "text-(--ui-red)");
  updateText(added, plus ? `+${plus}` : "");
  updateText(removed, minus ? `\u2212${minus}` : "");
  if (card.toggleAttribute("data-hcv-files-foldable", count > 3)) {
    if (more.parentElement !== card) card.append(more);
    state.files.remaining = count - 3;
    updateMoreLabel(state.files);
  } else {
    more.remove();
  }
}
function nativeCheckpoint(card) {
  const label = isRussian() ? "\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0447\u0435\u043A\u043F\u043E\u0438\u043D\u0442" : "Restore checkpoint";
  const turn = card.closest('[data-slot="aui_turn-pair"]');
  const prompt2 = turn?.querySelector('[data-slot="aui_user-message-root"]');
  return prompt2?.querySelector(`button[aria-label="${label}"]:not(:disabled)`);
}
function updateMoreLabel({ card, more, remaining }) {
  const expanded = card.hasAttribute("data-hcv-files-open");
  updateText(more, expanded ? isRussian() ? "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A" : "Show fewer files" : isRussian() ? `\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0435\u0449\u0451 ${remaining} ${fileNoun(remaining)}` : `Show ${remaining} more ${fileNoun(remaining)}`);
}
function synchronize(group, state, now, tail, completedSeconds, startedAt) {
  const roots = [...group.querySelectorAll(`:scope > ${assistant}`)];
  const last = roots.at(-1);
  if (!last) {
    clearSteps(group, state);
    clearLive(state);
    clearFiles(state);
    return;
  }
  const working = Boolean(group.querySelector(`${streaming}, ${nativeActivity}`));
  const blocked = roots.some((root) => root.matches(actionable) || root.querySelector(actionable));
  const final2 = roots.findLast((root) => root.querySelector('[data-slot="aui_msg-actions"]'));
  if (working && tail) {
    state.startedAt ??= startedAt ?? now;
  } else if (!working) {
    state.startedAt = null;
  }
  if (working && tail && !blocked && last.querySelector(streaming) && !last.querySelector(nativeActivity)) {
    showLive(last, state, now);
  } else {
    clearLive(state);
  }
  const elapsed = formatDuration2(durationSeconds(final2?.querySelector(duration2)?.textContent) ?? completedSeconds);
  if (!working && !blocked && final2) {
    const steps = findSteps(group, roots, final2);
    if (elapsed || steps.length) showSummary(group, state, steps, elapsed);
    else clearSteps(group, state);
  } else {
    clearSteps(group, state);
  }
  showFiles(state, group.querySelector(changes));
}
function registerTurnExperience(ctx, active2) {
  const states = /* @__PURE__ */ new Map();
  const thinkingLabels = /* @__PURE__ */ new Map();
  const started = /* @__PURE__ */ new Map();
  const durations = /* @__PURE__ */ new Map();
  const lastBySession = /* @__PURE__ */ new Map();
  const contrast = window.matchMedia("(forced-colors: none)");
  let frame = 0;
  let timer = 0;
  const sessionKey = (id2) => JSON.stringify([host11.state.connectionId.get(), host11.state.profile.get(), id2]);
  const keyFor = (event) => event.session_id && !event.replayed && document.documentElement.matches(active2) && (!event.connectionId || event.connectionId === host11.state.connectionId.get()) && (!event.profile || event.profile === host11.state.profile.get()) ? sessionKey(event.session_id) : null;
  const primaryPrompt = (event) => event.session_id === host11.state.activeSessionId.get() ? [...document.querySelectorAll(`${primary2} ${promptRoot}`)].at(-1) : null;
  const storedKey = (runtime) => sessionKey(host11.state.focusedSessionId.get() === runtime ? host11.state.focusedStoredSessionId.get() || runtime : runtime);
  const promptText = (prompt2) => prompt2?.querySelector(".composer-human-message")?.textContent.trim();
  ctx.onEvent("message.start", (event) => {
    const key = keyFor(event);
    if (key && !started.has(key)) {
      const prompt2 = primaryPrompt(event);
      const session = storedKey(event.session_id);
      lastBySession.delete(session);
      started.set(key, { at: Date.now(), promptId: prompt2?.dataset.messageId, text: promptText(prompt2), session });
    }
    if (started.size > 64) started.delete(started.keys().next().value);
  });
  ctx.onEvent("message.complete", (event) => {
    const key = keyFor(event);
    const start = key && started.get(key);
    if (!start) return;
    started.delete(key);
    if (event.payload?.error || event.payload?.status && event.payload.status !== "complete") return;
    const prompt2 = primaryPrompt(event);
    const promptId = prompt2?.dataset.messageId || start.promptId;
    if (!promptId) return;
    const seconds = Math.max(1, Math.round((Date.now() - start.at) / 1e3));
    durations.set(JSON.stringify([key, promptId]), seconds);
    const text = promptText(prompt2) || start.text;
    if (text) lastBySession.set(prompt2 ? storedKey(event.session_id) : start.session, { text, seconds });
    if (durations.size > 200) durations.delete(durations.keys().next().value);
    if (lastBySession.size > 64) lastBySession.delete(lastBySession.keys().next().value);
    queue();
  });
  function remove(group, state) {
    clearSteps(group, state);
    clearLive(state);
    clearFiles(state);
    states.delete(group);
  }
  function render() {
    frame = 0;
    const enabled = contrast.matches && document.documentElement.matches(active2);
    for (const [group, state] of states) if (!enabled || !group.isConnected) remove(group, state);
    if (enabled) {
      const now = Date.now();
      const groups2 = [...document.querySelectorAll(`[data-chat-surface] ${response2}`)];
      const tailByTranscript = new Map(groups2.map((group) => [group.closest(transcript3), group]));
      const latestPrompt = new Map([...tailByTranscript.keys()].map((container) => [
        container,
        [...container?.querySelectorAll('[data-slot="aui_user-message-root"]') || []].at(-1)
      ]));
      for (const group of groups2) {
        let state = states.get(group);
        if (!state) {
          state = { steps: /* @__PURE__ */ new Set(), bar: null, live: null, files: null, startedAt: null };
          states.set(group, state);
        }
        const container = group.closest(transcript3);
        const prompt2 = latestPrompt.get(container);
        const tail = tailByTranscript.get(container) === group && (!prompt2 || !(group.compareDocumentPosition(prompt2) & Node.DOCUMENT_POSITION_FOLLOWING));
        const ownPrompt = group.closest('[data-slot="aui_turn-pair"]')?.querySelector('[data-slot="aui_user-message-root"][data-message-id]');
        const runtime = group.closest(primary2) && host11.state.activeSessionId.get();
        const key = runtime && sessionKey(runtime);
        const timeKey = key && ownPrompt && JSON.stringify([key, ownPrompt.dataset.messageId]);
        const last = tail && runtime && lastBySession.get(storedKey(runtime));
        const recorded = timeKey && durations.get(timeKey) || last && last.text === promptText(ownPrompt) && last.seconds;
        const liveStart = key && started.get(key);
        synchronize(group, state, now, tail, recorded || null, liveStart?.at);
      }
    }
    syncThinkingLabels(thinkingLabels, enabled);
    if ([...states.values()].some((state) => state.live)) {
      if (!timer) timer = window.setInterval(queue, 1e3);
    } else if (timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  }
  function queue() {
    if (!frame) frame = requestAnimationFrame(render);
  }
  const observer = new MutationObserver((records) => {
    if (records.some(({ target, type, addedNodes, removedNodes }) => {
      if (target === document.documentElement) return true;
      if (!document.documentElement.matches(active2)) return false;
      const element4 = target instanceof Element ? target : target.parentElement;
      if (!element4 || element4.closest("[data-hcv-generated]")) return false;
      if (type === "characterData") return Boolean(element4.closest(`${changes}, ${duration2}`));
      if (type === "attributes") return Boolean(target.closest(response2));
      const nodes = [...addedNodes, ...removedNodes];
      if (nodes.some((node2) => node2.nodeType === Node.TEXT_NODE) && element4.closest(`${changes}, ${duration2}`)) return true;
      return nodes.some((node2) => node2 instanceof Element && !node2.hasAttribute("data-hcv-generated") && (target.closest(response2) || node2.matches(`${response2}, [data-slot="aui_user-message-root"]`) || node2.querySelector(response2)));
    })) queue();
  });
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state", "data-message-streaming", "data-hermes-theme", "data-hermes-codex-visual", "lang"]
  });
  contrast.addEventListener("change", queue);
  queue();
  ctx.onDispose(() => {
    observer.disconnect();
    contrast.removeEventListener("change", queue);
    if (frame) cancelAnimationFrame(frame);
    if (timer) window.clearInterval(timer);
    for (const [group, state] of states) remove(group, state);
    syncThinkingLabels(thinkingLabels, false);
  });
}

// source/message-actions.js
import { host as host12 } from "@hermes/plugin-sdk";
var actionBar = '[data-slot="aui_user-bubble-actions"]';
var bubbleSelector = "button.composer-human-message";
var restoreButton = "button:has(> .codicon-discard)";
var rowSelector = "[data-hcv-message-actions]";
var menuSelector = "[data-hcv-message-menu]";
var nativeTimestamp = '[data-slot="timeline-timestamp"]';
var labels7 = {
  ru: { copyMessage: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435", messageCopied: "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E", copyMessageError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435" },
  en: { copyMessage: "Copy message", messageCopied: "Copied", copyMessageError: "Could not copy the message" }
};
function userMessage(bubble, id2) {
  for (let node2 = committedFiber(bubble); node2; node2 = node2.return) {
    const client = node2.memoizedProps?.value;
    if (client?.message?.source !== "thread" || typeof client.subscribe !== "function") continue;
    try {
      const message = client.message();
      const state = message.getState();
      if (state.id === id2 && state.role === "user") return { message, state };
    } catch {
      return null;
    }
  }
  return null;
}
function dateLabel(date) {
  const locale = document.documentElement.lang || void 0;
  const options = { hour: "numeric", minute: "2-digit" };
  const localDay = (day) => Date.UTC(day.getFullYear(), day.getMonth(), day.getDate());
  const age = (localDay(/* @__PURE__ */ new Date()) - localDay(date)) / 864e5;
  if (age > 0 && age < 7) options.weekday = "long";
  else if (age !== 0) Object.assign(options, { day: "numeric", month: "short" });
  return new Intl.DateTimeFormat(locale, options).format(date);
}
function styles2(active2, transcript4) {
  const enhanced = `${active2} ${transcript4} ${actionBar}:has(${rowSelector})`;
  const row2 = `${enhanced} ${rowSelector}`;
  const menu = `${active2} ${menuSelector}`;
  return `
@media (forced-colors: none) {
  /* Codex vHM0 and .bubble-vBnidZ (006493501c2d.css). */
  ${enhanced} { min-inline-size: 0; }
  ${enhanced} ${bubbleSelector} {
    inline-size: fit-content;
    margin-inline-start: auto;
    padding: 10px 16px;
    border: 0;
    border-radius: 22px;
  }
  ${enhanced} ${restoreButton},
  ${enhanced} .human-message-with-todos-wrapper:has(> ${rowSelector} > time:not([hidden])) > ${nativeTimestamp} { display: none; }

  /* Codex y5H2 keeps the action row in flow at opacity zero. */
  ${row2} {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    margin: 4px 4px 0;
    min-block-size: 26px;
    color: var(--hcv-muted);
    opacity: 0;
    pointer-events: none;
  }
  ${active2}[data-hermes-mode="dark"] ${rowSelector} { color: #8f8f8f; }
  ${enhanced}:is(:hover, :focus-within) ${rowSelector} { opacity: 1; pointer-events: auto; }
  ${row2} time {
    margin-inline-end: 6px;
    min-inline-size: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: .75rem;
    line-height: 1rem;
  }
  ${row2} button {
    display: grid;
    place-items: center;
    flex: 0 0 26px;
    block-size: 26px;
    border-radius: 8px;
    color: inherit;
    cursor: pointer;
  }
  ${row2} [hidden] { display: none; }
  ${row2} button:focus-visible { outline: 2px solid var(--hcv-focus); }
  ${row2} button::before {
    content: "";
    inline-size: 16px;
    block-size: 16px;
    background: currentColor;
    mask: var(--hcv-message-icon) center / contain no-repeat;
  }
  ${row2} [data-hcv-copy-message] { --hcv-message-icon: ${codexMask("messageCopy")}; }
  ${row2} [data-hcv-copy-message][data-copied] { --hcv-message-icon: ${codexMask("messageCopied")}; }
  ${row2} [data-hcv-edit-message] { --hcv-message-icon: ${codexMask("messageEdit")}; }
  ${menu} {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: 6px;
    max-inline-size: calc(100vw - 16px);
    border: 1px solid var(--hcv-hairline);
    border-radius: var(--hcv-menu-radius);
    background: var(--hcv-menu);
    color: var(--hcv-text);
    box-shadow: var(--hcv-menu-shadow);
    font: 13px/20px var(--hcv-ui-font);
  }
  ${menu} button {
    min-block-size: 28px;
    padding-inline: 8px;
    border-radius: var(--hcv-popup-button-radius);
    cursor: pointer;
  }
  @media (hover: hover) {
    ${row2} button:hover { background: var(--hcv-hover-menu); }
  }
  @media (hover: none) {
    ${row2} { opacity: 1; pointer-events: auto; }
    ${row2} time { opacity: 0; }
    ${enhanced}:focus-within ${rowSelector} time { opacity: 1; }
  }
}
`;
}
function registerMessageActions(ctx, active2, transcript4, promptSelector2) {
  ctx.i18n.register(labels7);
  const sheet = document.createElement("style");
  sheet.dataset.hcvMessageActionStyle = "";
  sheet.textContent = styles2(active2, transcript4);
  document.head.append(sheet);
  const rows = /* @__PURE__ */ new Map();
  const menu = document.createElement("div");
  menu.popover = "auto";
  menu.dataset.hcvMessageMenu = "";
  const restoreItem = document.createElement("button");
  restoreItem.type = "button";
  menu.append(restoreItem);
  document.body.append(menu);
  let restoreTarget;
  let restoreFocus;
  restoreItem.addEventListener("click", () => {
    menu.hidePopover();
    if (restoreTarget?.isConnected) restoreTarget.click();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    menu.hidePopover();
    restoreFocus?.focus({ preventScroll: true });
  });
  menu.addEventListener("toggle", (event) => {
    if (event.newState === "closed") restoreTarget = restoreFocus = void 0;
  });
  function addRow(bar, bubble, prompt2, messageId) {
    const holder = bubble.closest("[data-context-menu-skip]");
    const row2 = document.createElement("div");
    row2.dataset.hcvMessageActions = "";
    row2.setAttribute("data-context-menu-skip", "");
    const stamp = document.createElement("time");
    const copy6 = document.createElement("button");
    copy6.type = "button";
    copy6.dataset.hcvCopyMessage = "";
    const edit3 = document.createElement("button");
    edit3.type = "button";
    edit3.dataset.hcvEditMessage = "";
    row2.append(stamp, copy6);
    if (bubble.hasAttribute("aria-label")) row2.append(edit3);
    const updateCopy = () => {
      copy6.title = ctx.i18n.t(copy6.hasAttribute("data-copied") ? "messageCopied" : "copyMessage");
      copy6.setAttribute("aria-label", copy6.title);
    };
    const update = () => {
      const data = userMessage(bubble, messageId);
      const seconds = data?.state.metadata?.custom?.timelineTimestamp;
      const nativeDate = bar.querySelector(`${nativeTimestamp} time`)?.dateTime;
      const date = typeof seconds === "number" && seconds > 0 ? new Date(seconds * 1e3) : new Date(nativeDate);
      stamp.hidden = !Number.isFinite(date.getTime());
      if (!stamp.hidden) {
        const label = dateLabel(date);
        if (stamp.textContent !== label) stamp.textContent = label;
        stamp.dateTime = date.toISOString();
        stamp.title = date.toLocaleString(document.documentElement.lang || void 0);
      }
      copy6.hidden = !data?.state.content.some((part) => part.type === "text" && part.text.trim());
      if (edit3.isConnected) {
        edit3.title = bubble.getAttribute("aria-label");
        edit3.setAttribute("aria-label", edit3.title);
        edit3.disabled = bubble.disabled;
      }
      updateCopy();
    };
    let copying = false;
    let clearCopied;
    copy6.addEventListener("click", async () => {
      if (copying || copy6.hasAttribute("data-copied")) return;
      const text = userMessage(bubble, messageId)?.message.getCopyText();
      if (!text?.trim()) return;
      copying = true;
      try {
        const success = await ctx.os.writeClipboard(text);
        if (!row2.isConnected) return;
        if (!success) {
          host12.notify({ kind: "error", message: ctx.i18n.t("copyMessageError") });
          return;
        }
        copy6.setAttribute("data-copied", "");
        updateCopy();
        clearCopied = ctx.setTimeout(() => {
          copy6.removeAttribute("data-copied");
          updateCopy();
        }, 1500);
      } finally {
        copying = false;
      }
    });
    edit3.addEventListener("click", () => {
      if (bubble.isConnected && prompt2.dataset.messageId === messageId) {
        window.getSelection()?.removeAllRanges();
        bubble.click();
      }
    });
    const listeners = new AbortController();
    const options = { signal: listeners.signal };
    bar.addEventListener("pointerenter", update, options);
    bar.addEventListener("focusin", update, options);
    bar.addEventListener("contextmenu", (event) => {
      const native = holder.querySelector(restoreButton);
      const inActions = row2.contains(event.target);
      const inBubble = bubble.contains(event.target) && !committedFiber(holder)?.memoizedProps?.onContextMenu;
      if (!native || event.defaultPrevented || !inActions && !inBubble || window.getSelection()?.isCollapsed === false) return;
      event.preventDefault();
      event.stopPropagation();
      restoreTarget = native;
      restoreFocus = event.target.closest("button") || bubble;
      restoreItem.textContent = native.getAttribute("aria-label");
      menu.showPopover();
      const anchor = restoreFocus.getBoundingClientRect();
      const x = event.clientX || anchor.left;
      const y = event.clientY || anchor.bottom;
      menu.style.left = Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8)) + "px";
      menu.style.top = Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8)) + "px";
      restoreItem.focus({ preventScroll: true });
    }, options);
    holder.after(row2);
    update();
    return { row: row2, prompt: prompt2, messageId, bubble, update, remove() {
      clearCopied?.();
      listeners.abort();
      if (bar.contains(restoreFocus ?? null) || bar.contains(restoreTarget ?? null)) menu.hidePopover();
      row2.remove();
    } };
  }
  ctx.i18n.onLocaleChange(() => rows.forEach((state) => state.update()));
  ctx.onDispose(() => {
    rows.forEach((state) => state.remove());
    rows.clear();
    menu.remove();
    sheet.remove();
  });
  return function reconcile(enabled) {
    const current = new Set(enabled ? document.querySelectorAll(`${transcript4} ${promptSelector2} ${actionBar}`) : []);
    for (const [bar, state] of rows) {
      if (!current.has(bar) || !bar.contains(state.row) || !bar.contains(state.bubble) || state.prompt.dataset.messageId !== state.messageId) {
        state.remove();
        rows.delete(bar);
      }
    }
    for (const bar of current) {
      if (rows.has(bar)) continue;
      const bubble = bar.querySelector(bubbleSelector);
      const prompt2 = bar.closest(promptSelector2);
      const messageId = prompt2.dataset.messageId;
      if (bubble?.closest("[data-context-menu-skip]") && userMessage(bubble, messageId)) {
        rows.set(bar, addRow(bar, bubble, prompt2, messageId));
      }
    }
  };
}

// source/chat-display.js
var viewportSelector = '[data-slot="aui_thread-viewport"]';
var promptSelector = '[data-slot="aui_user-message-root"][data-message-id]';
var bubbleSelector2 = "button.composer-human-message[aria-label]";
var clampSelector = ".sticky-human-clamp";
var previewSelector = "[data-hcv-message-preview]";
var toggleSelector = "[data-hcv-message-toggle]";
var focusable = 'a[href], button, input, select, textarea, summary, pre, [role="button"], [tabindex], [contenteditable]';
var editSelector = '[data-slot="aui_edit-composer-root"]';
var editFrame = ".ui-prompt-input__container.composer-human-message";
var editInput = '[contenteditable="true"][role="textbox"]';
var lineCount = 20;
var relaxed = 1.625;
var transitionMs = 200;
var fadeDistance = "1rem";
var labels8 = {
  en: { messageShowMore: "Show more", messageShowLess: "Show less", cancelEdit: "Cancel", sendEdit: "Send" },
  ru: { messageShowMore: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0435\u0449\u0451", messageShowLess: "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C", cancelEdit: "\u041E\u0442\u043C\u0435\u043D\u0430", sendEdit: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C" }
};
function displayStyles(active2, chat2) {
  const viewport = `${active2} ${chat2} ${viewportSelector}`;
  const bubble = `${viewport} ${promptSelector} ${bubbleSelector2}:has(> ${clampSelector})`;
  const body = `${bubble} > ${clampSelector}`;
  const toggle2 = `${viewport} ${toggleSelector}`;
  const ellipsis = `${bubble} > [data-hcv-message-ellipsis]`;
  const frame = `${viewport} ${editSelector} [data-hcv-edit-controls]`;
  const docked2 = `${active2} ${chat2}:has([data-slot="composer-dock"]:not([data-popped-out]))`;
  const replyError = `${active2} ${chat2} [data-slot="aui_assistant-message-content"] > [role="alert"]:has(> div > .aui-error-action)`;
  const errorHeader = `${replyError} > div:first-child`;
  const errorHeadline = `${errorHeader} > div:first-child`;
  const errorClose = `${errorHeader} > button`;
  const errorDetails = `${errorHeadline} > details`;
  const errorSummary = `${errorDetails} > summary`;
  const errorActions = `${replyError} > div:last-child`;
  const errorButton = `${errorActions} > .aui-error-action`;
  const errorControls = `:is(${errorClose}, ${errorSummary}, ${errorButton})`;
  return `
@media (forced-colors: none) {
  ${replyError} {
    gap: 10px;
    margin-block-start: 8px;
    padding: 12px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 16px;
    background: var(--hcv-panel);
    color: var(--hcv-text);
    font: 13px/18px var(--hcv-ui-font);
  }
  ${errorHeader} { gap: 8px; }
  ${errorHeader}::before {
    content: "";
    flex: 0 0 16px;
    block-size: 16px;
    margin-block-start: 1px;
    background-color: var(--dt-destructive);
    mask: ${codexMask("warning")} center / contain no-repeat;
  }
  ${errorHeadline} > div:first-child { font-weight: 600; }
  ${errorHeadline} > div + div { margin-block-start: 2px; color: var(--hcv-muted); }
  ${errorDetails} { margin-block-start: 4px; opacity: 1; }
  ${errorSummary} {
    display: flex;
    align-items: center;
    gap: 4px;
    inline-size: fit-content;
    margin-inline-start: -5px;
    padding: 3px 5px;
    border-radius: 8px;
    color: var(--hcv-muted);
    font-size: 12px;
    line-height: 16px;
    list-style: none;
  }
  ${errorSummary}::-webkit-details-marker { display: none; }
  ${errorSummary}::before {
    content: "";
    flex: 0 0 12px;
    block-size: 12px;
    background-color: currentColor;
    mask: ${codexMask("right")} center / contain no-repeat;
  }
  ${errorDetails}[open] > summary::before { rotate: 90deg; }
  ${errorDetails} > div {
    max-block-size: min(12rem, 35vh);
    margin-block-start: 4px;
    overflow: auto;
    padding: 8px;
    border-radius: 8px;
    background: var(--hcv-chat);
    color: var(--hcv-muted);
    font-size: 12px;
    line-height: 17px;
  }
  ${errorActions} { gap: 4px; padding-inline-start: 24px; }
  ${errorButton} {
    min-block-size: 26px;
    max-inline-size: 100%;
    padding: 4px 8px;
    border: 0;
    border-radius: 8px;
    color: var(--hcv-muted);
    font-size: 12px;
    line-height: 16px;
    text-align: start;
    white-space: normal;
  }
  ${errorButton} > svg { flex: none; }
  ${errorButton}:has(> svg.tabler-icon-refresh) { background: var(--hcv-selected); color: var(--hcv-text); }
  ${errorClose} {
    inline-size: 24px;
    block-size: 24px;
    margin-block: -2px 0;
    margin-inline: 0 -2px;
    border-radius: 8px;
    color: var(--hcv-muted);
    opacity: 1;
  }
  ${errorControls}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${codexIconRules(`${errorButton} > svg.tabler-icon-refresh`, "refresh")}
  ${codexIconRules(`${errorButton} > svg.tabler-icon-upload`, "upload")}
  ${codexIconRules(`${errorButton} > svg.tabler-icon-copy`, "copy")}
  ${codexIconRules(`${errorClose} > svg.tabler-icon-x`, "close")}
  @media (hover: hover) {
    ${errorControls}:hover:not(:disabled) { background: var(--hcv-hover-menu); color: var(--hcv-text); }
  }

  ${viewport} {
    mask-image: linear-gradient(to bottom, transparent 0, black ${fadeDistance}, black 100%);
  }
  /* Codex scrolls the user turn with the transcript. Hermes's clip observer
     can still see the old overlap for a frame on theme changes. */
  ${viewport} [data-slot="aui_user-message-root"] {
    position: relative;
    top: auto;
  }
  ${viewport} [data-sticky-prompt-clip] {
    clip-path: none;
  }
  /* The viewport already excludes the height above the docked editor (queue,
     status stack). Reserve the editor overlap once, plus 12px to its shell.
     Keep the native clearance element and its scroll anchor. */
  ${docked2} [data-slot="aui_thread-content"] {
    --thread-last-message-clearance: calc(var(--composer-surface-measured-height) + 4px);
  }
  ${docked2} [data-slot="aui_thread-content"] > [data-slot="aui_message-group"]:not(:has(~ [data-slot="aui_message-group"])) {
    padding-block-end: 0;
  }
  ${bubble} {
    --human-msg-line-height: ${relaxed};
    line-height: ${relaxed};
    overflow: clip;
  }
  ${body}, ${body}[data-clamped="true"] {
    max-height: calc(${lineCount}lh + 1px);
    overflow: clip;
    mask-image: none;
  }
  ${body}${previewSelector} { max-height: var(--hcv-message-height); }
  ${bubble}:has(> ${previewSelector}) {
    row-gap: 0;
    padding-block-end: calc(10px + 10px + ${relaxed}em);
  }
  ${ellipsis} {
    block-size: 0;
    opacity: 0;
    overflow: hidden;
    user-select: none;
  }
  ${ellipsis}::before { content: '\u2026'; }
  ${body}[data-hcv-message-preview="collapsed"] + [data-hcv-message-ellipsis] {
    block-size: 1lh;
    opacity: 1;
  }
  ${toggle2} {
    position: absolute;
    z-index: 11;
    inset-inline-start: 16px;
    inset-block-end: 10px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    min-block-size: ${relaxed}em;
    border-radius: 4px;
    background: transparent;
    color: var(--hcv-text);
    font: inherit;
    font-size: var(--conversation-text-font-size);
    line-height: ${relaxed};
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  ${toggle2}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: 3px; }
  ${toggle2}::after {
    content: '';
    inline-size: 14px;
    block-size: 14px;
    background: currentColor;
    mask: ${codexMask("down")} center / contain no-repeat;
  }
  ${toggle2}[aria-expanded="true"]::after { rotate: 180deg; }
  /* Codex Desktop y5H2: rounded editor, padded text, right-aligned actions.
     The editor and send action are still Hermes's own controls. */
  ${viewport} ${editSelector} .composer-human-message-container {
    border-radius: 24px;
    background: transparent;
  }
  ${frame} {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px 6px;
    min-block-size: 0;
    padding: 12px;
    overflow: visible;
    border: 0;
    border-radius: 24px;
    background: var(--hcv-bubble);
  }
  ${frame} > ${editInput} {
    grid-column: 1 / -1;
    grid-row: 1;
    min-block-size: 1lh;
    max-block-size: min(40vh, 24rem);
    padding: 0;
    color: var(--hcv-text);
    line-height: var(--conversation-line-height);
    overscroll-behavior: contain;
  }
  ${frame}:has(> ${editInput}:focus-visible) {
    outline: 2px solid var(--hcv-focus);
    outline-offset: 1px;
  }
  ${frame} > :is([data-hcv-edit-cancel], [data-hcv-edit-send]) {
    display: inline-flex;
    position: relative;
    inset: auto;
    grid-row: 2;
    align-items: center;
    justify-content: center;
    min-block-size: 28px;
    block-size: auto;
    inline-size: auto;
    padding: 2px 12px;
    border: 1px solid var(--hcv-stroke);
    border-radius: 999px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  ${frame} > [data-hcv-edit-cancel] { grid-column: 2; color: var(--hcv-text); }
  ${frame} > [data-hcv-edit-cancel]:hover { background: var(--hcv-hover); }
  ${frame} > [data-hcv-edit-send] {
    grid-column: 3;
    border-color: transparent;
    background: var(--hcv-action);
    color: var(--hcv-ink);
  }
  ${frame} > [data-hcv-edit-send]:disabled { opacity: .5; cursor: default; }
  ${frame} > [data-hcv-edit-send]:not(:disabled):hover { filter: brightness(.88); }
  ${frame} > [data-hcv-edit-send] > .codicon-arrow-up { display: none; }
  ${frame} > [data-hcv-edit-send]::after { content: attr(data-hcv-edit-send); }
  ${frame} > :is([data-hcv-edit-cancel], [data-hcv-edit-send]):focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: 2px;
  }
  @media (hover: hover) and (pointer: fine) {
    ${toggle2}:hover { color: var(--hcv-muted); }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${body}${previewSelector} { transition: max-height ${transitionMs}ms cubic-bezier(.23, 1, .32, 1); }
    ${ellipsis} {
      transition: block-size ${transitionMs}ms cubic-bezier(.23, 1, .32, 1), opacity 120ms var(--hcv-ease);
    }
    ${toggle2}::after { transition: rotate 150ms var(--hcv-ease); }
  }
}
`;
}
function previewHeight(body, lineHeight) {
  let limit = Math.ceil(lineHeight * (lineCount - 1));
  const fences = body.querySelectorAll('[data-slot="aui_user-fence"]');
  if (!fences.length) return limit;
  const bounds = body.getBoundingClientRect();
  const scale = bounds.height / body.offsetHeight || 1;
  for (const fence of fences) {
    const rect = fence.getBoundingClientRect();
    const top = (rect.top - bounds.top) / scale;
    const bottom = (rect.bottom - bounds.top) / scale;
    if (top < limit && bottom > limit) limit = Math.ceil(bottom);
  }
  return limit;
}
function syncPreviewFocus(state) {
  for (const node2 of state.inert) node2.removeAttribute("inert");
  state.inert.clear();
  if (state.expanded) return;
  const controls = state.body.querySelectorAll(focusable);
  if (!controls.length) return;
  const bounds = state.body.getBoundingClientRect();
  const scale = bounds.height / state.body.offsetHeight || 1;
  const bottom = bounds.top + state.previewHeight * scale;
  for (const node2 of controls) {
    if (node2.closest("[inert]")) continue;
    const rect = node2.getBoundingClientRect();
    if (node2.matches("a[href]") ? rect.top >= bottom : rect.bottom > bottom) {
      node2.setAttribute("inert", "");
      state.inert.add(node2);
    }
  }
}
function keepToggleVisible(state) {
  if (document.activeElement !== state.toggle) return;
  const toggle2 = state.toggle.getBoundingClientRect();
  const view = state.viewport.getBoundingClientRect();
  const top = view.top + 16;
  if (toggle2.top < top) state.viewport.scrollTop += toggle2.top - top;
  else if (toggle2.bottom > view.bottom) state.viewport.scrollTop += toggle2.bottom - view.bottom;
}
function registerChatDisplay(ctx, active2) {
  const chat2 = "[data-chat-surface]:not([data-hud-shell] *)";
  const messageActions = registerMessageActions(ctx, active2, `${chat2} ${viewportSelector}`, promptSelector);
  const innerSelector = `${chat2} ${viewportSelector} ${promptSelector} ${bubbleSelector2} > ${clampSelector} > div`;
  const editorSelector2 = `${chat2} ${viewportSelector} ${editSelector} ${editFrame}`;
  const root = document.documentElement;
  const forcedColors = matchMedia("(forced-colors: active)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const states = /* @__PURE__ */ new Map();
  const editors = /* @__PURE__ */ new Map();
  let nextId = 0;
  let frame = 0;
  const stylesheet = document.createElement("style");
  stylesheet.setAttribute("data-hcv-chat-display", "");
  stylesheet.textContent = displayStyles(active2, chat2);
  document.head.append(stylesheet);
  ctx.i18n.register(labels8);
  function label(state) {
    if (!state.toggle) return;
    const text = ctx.i18n.t(state.expanded ? "messageShowLess" : "messageShowMore");
    if (state.toggle.textContent !== text) state.toggle.textContent = text;
  }
  function show(state) {
    const value = state.expanded ? "expanded" : "collapsed";
    state.clamp.setAttribute("data-hcv-message-preview", value);
    state.clamp.style.setProperty(
      "--hcv-message-height",
      `${state.expanded ? state.fullHeight : state.previewHeight}px`
    );
    state.toggle.setAttribute("aria-expanded", String(state.expanded));
    label(state);
    syncPreviewFocus(state);
  }
  function removeDisclosure(state) {
    clearTimeout(state.closeTimer);
    state.toggle?.remove();
    state.toggle = null;
    state.ellipsis?.remove();
    if (state.clamp.id === state.assignedId) state.clamp.removeAttribute("id");
    state.clamp.removeAttribute("data-hcv-message-preview");
    state.clamp.style.removeProperty("--hcv-message-height");
    for (const node2 of state.inert) node2.removeAttribute("inert");
    state.inert.clear();
    state.expanded = false;
  }
  function addDisclosure(state) {
    const toggle2 = document.createElement("button");
    toggle2.type = "button";
    toggle2.setAttribute("data-hcv-message-toggle", "");
    if (!state.clamp.id) {
      state.assignedId = `hcv-message-preview-${++nextId}`;
      state.clamp.id = state.assignedId;
    }
    toggle2.setAttribute("aria-controls", state.clamp.id);
    const ellipsis = document.createElement("span");
    ellipsis.setAttribute("data-hcv-message-ellipsis", "");
    ellipsis.setAttribute("aria-hidden", "true");
    state.toggle = toggle2;
    state.ellipsis = ellipsis;
    state.clamp.after(ellipsis);
    state.clamp.parentElement.after(toggle2);
    toggle2.addEventListener("click", () => {
      clearTimeout(state.closeTimer);
      state.expanded = !state.expanded;
      show(state);
      if (!state.expanded) {
        if (reducedMotion.matches) keepToggleVisible(state);
        else state.closeTimer = setTimeout(() => keepToggleVisible(state), transitionMs);
      }
    });
  }
  function measure(state) {
    if (!state.body.getClientRects().length || !state.viewport.clientHeight) return;
    const lineHeight = Number.parseFloat(getComputedStyle(state.clamp).lineHeight);
    if (!Number.isFinite(lineHeight)) return;
    const fullHeight = state.body.scrollHeight;
    if (!fullHeight) return;
    if (fullHeight <= Math.ceil(lineHeight * lineCount) + 1) {
      if (state.toggle) removeDisclosure(state);
      return;
    }
    state.fullHeight = fullHeight;
    state.previewHeight = previewHeight(state.body, lineHeight);
    if (!state.toggle) addDisclosure(state);
    show(state);
  }
  const sizes = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const state = states.get(target);
      if (state) measure(state);
    }
  });
  function detach(state) {
    sizes.unobserve(state.body);
    removeDisclosure(state);
    states.delete(state.body);
  }
  function updateEditLabels({ cancel, send: send2 }) {
    cancel.textContent = ctx.i18n.t("cancelEdit");
    send2.setAttribute("data-hcv-edit-send", ctx.i18n.t("sendEdit"));
  }
  function enhanceEdit(container, input, send2) {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.setAttribute("data-hcv-edit-cancel", "");
    const group = container.closest('[data-slot="aui_message-group"]');
    const thread = group?.parentElement;
    const groupIndex = thread ? [...thread.children].indexOf(group) : -1;
    let pending = 0;
    cancel.addEventListener("click", () => {
      if (pending) return;
      const escape = () => {
        const handler = committedFiber(input)?.memoizedProps?.onKeyDown;
        if (typeof handler !== "function" || !input.isConnected) return;
        const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
        handler({ key: "Escape", currentTarget: input, nativeEvent: event, preventDefault: () => event.preventDefault() });
      };
      const suggestionOpen = Boolean(container.parentElement.querySelector('[role="listbox"]'));
      escape();
      pending = requestAnimationFrame(() => {
        if (suggestionOpen && input.isConnected) escape();
        pending = requestAnimationFrame(restoreFocus);
      });
      function restoreFocus() {
        pending = 0;
        if (input.isConnected || !thread?.isConnected) return;
        const replacement = group.isConnected ? group : thread.children.item(groupIndex);
        replacement?.querySelector(bubbleSelector2)?.focus({ preventScroll: true });
      }
    });
    const state = { cancel, input, send: send2, dispose() {
      if (container.isConnected) cancelAnimationFrame(pending);
      cancel.remove();
      send2.removeAttribute("data-hcv-edit-send");
      container.removeAttribute("data-hcv-edit-controls");
    } };
    updateEditLabels(state);
    container.setAttribute("data-hcv-edit-controls", "");
    send2.before(cancel);
    return state;
  }
  function reconcile() {
    frame = 0;
    const enabled = root.matches(active2) && !forcedColors.matches;
    messageActions(enabled);
    const current = new Set(enabled ? document.querySelectorAll(innerSelector) : []);
    const currentEditors = new Set(enabled ? document.querySelectorAll(editorSelector2) : []);
    for (const [container, state] of editors) {
      if (!currentEditors.has(container) || !container.contains(state.input) || !container.contains(state.send)) {
        state.dispose();
        editors.delete(container);
      }
    }
    for (const container of currentEditors) {
      if (editors.has(container)) continue;
      const input = container.querySelector(`:scope > ${editInput}`);
      const send2 = container.querySelector(":scope > button[aria-label]:has(> .codicon-arrow-up)");
      if (input && send2) editors.set(container, enhanceEdit(container, input, send2));
    }
    for (const state of states.values()) {
      if (!current.has(state.body) || state.messageId !== state.prompt.dataset.messageId) detach(state);
    }
    for (const body of current) {
      if (states.has(body)) continue;
      const viewport = body.closest(viewportSelector);
      const prompt2 = body.closest(promptSelector);
      const state = {
        body,
        viewport,
        prompt: prompt2,
        messageId: prompt2.dataset.messageId,
        clamp: body.parentElement,
        expanded: false,
        inert: /* @__PURE__ */ new Set()
      };
      states.set(body, state);
      sizes.observe(body);
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(reconcile);
  };
  const observer = new MutationObserver((records) => {
    if (records.some((record) => {
      if (record.type === "attributes") return record.target === root || record.target.matches(promptSelector);
      if (!root.matches(active2)) return false;
      if (record.target.closest?.(editSelector)) {
        return record.target.matches(editFrame) || record.target.matches(editSelector);
      }
      if (record.target.closest?.(promptSelector) && !record.target.closest(toggleSelector)) return true;
      return [...record.addedNodes, ...record.removedNodes].some(
        (node2) => node2.nodeType === Node.ELEMENT_NODE && (node2.matches(`${promptSelector}, ${viewportSelector}, ${editSelector}`) || node2.querySelector(`${promptSelector}, ${viewportSelector}, ${editSelector}`))
      );
    })) schedule();
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-hermes-theme", "data-hermes-codex-visual", "data-message-id"]
  });
  forcedColors.addEventListener("change", schedule);
  ctx.i18n.onLocaleChange(() => {
    for (const state of states.values()) label(state);
    for (const state of editors.values()) updateEditLabels(state);
  });
  ctx.onDispose(() => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    forcedColors.removeEventListener("change", schedule);
    for (const state of states.values()) detach(state);
    for (const state of editors.values()) state.dispose();
    editors.clear();
    sizes.disconnect();
    stylesheet.remove();
  });
  schedule();
}

// source/draft-setup.js
import { host as host13 } from "@hermes/plugin-sdk";
var primary3 = '[data-chat-surface][data-composer-target="main"]:not([data-hud-shell] *, [inert] *)';
var formSelector = 'form[data-slot="composer-root"]:not([data-popped-out])';
var sidebarSelector = '[data-slot="sidebar"][data-tour="sessions-sidebar"]';
var nativeDevice = '[data-slot="statusbar"] [data-slot="connection-switcher"] button[aria-haspopup="menu"]';
var toolbar = "[data-hcv-draft-bar]";
var settingsRoute = "/settings?tab=connections";
var menuWidths = { projects: 260, device: 280, git: 260 };
var toolbarInset = 13 + 5;
var copy4 = {
  ru: {
    bar: "\u041F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B \u043D\u043E\u0432\u043E\u0433\u043E \u0447\u0430\u0442\u0430",
    projects: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442",
    search: "\u041F\u043E\u0438\u0441\u043A \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432",
    create: "\u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442",
    none: "\u0420\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0431\u0435\u0437 \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
    noProject: "\u0411\u0435\u0437 \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
    loading: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026",
    empty: "\u041F\u0440\u043E\u0435\u043A\u0442\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B",
    projectError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442\u044B",
    actionsError: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043F\u043E\u043A\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0430\u043D\u0435\u043B\u044C \u0441\u0435\u0430\u043D\u0441\u043E\u0432.",
    device: "\u042D\u0442\u043E\u0442 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440",
    location: "\u0420\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u0432",
    manage: "\u0423\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C \u0448\u043B\u044E\u0437\u0430\u043C\u0438\u2026",
    configure: "\u041D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0443\u044E \u0441\u0440\u0435\u0434\u0443",
    worktree: "\u041D\u043E\u0432\u043E\u0435 \u0440\u0430\u0431\u043E\u0447\u0435\u0435 \u0434\u0435\u0440\u0435\u0432\u043E",
    nativeWorktree: "\u041D\u043E\u0432\u044B\u0439 worktree",
    branchError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0432\u0435\u0442\u043A\u0438",
    switchError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0432\u0435\u0442\u043A\u0443",
    branch: "\u0412\u0435\u0442\u043A\u0430",
    noBranch: "\u041D\u0435\u0442 \u0432\u0435\u0442\u043A\u0438",
    environment: "\u0421\u0440\u0435\u0434\u0430",
    noEnvironment: "\u041D\u0435\u0442 \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F"
  },
  en: {
    bar: "New chat setup",
    projects: "Choose a project",
    search: "Search projects",
    create: "New project",
    none: "Work without a project",
    noProject: "No project",
    loading: "Loading\u2026",
    empty: "No matching projects",
    projectError: "Could not load projects",
    actionsError: "This action is unavailable. Open the sessions sidebar.",
    device: "This computer",
    location: "Work in",
    manage: "Manage gateways\u2026",
    configure: "Configure local environment",
    worktree: "New worktree",
    nativeWorktree: "New worktree",
    branchError: "Could not load branches",
    switchError: "Could not switch branches",
    branch: "Branch",
    noBranch: "No branch",
    environment: "Environment",
    noEnvironment: "No environment"
  }
};
var labels9 = () => copy4[document.documentElement.lang.toLowerCase().startsWith("ru") ? "ru" : "en"];
function node(tag, attrs = {}, text = "") {
  const element4 = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) element4.setAttribute(name, value);
  if (text) element4.textContent = text;
  return element4;
}
function icon7(glyph3) {
  const element4 = node("span", { "data-hcv-draft-icon": glyph3, "aria-hidden": "true" });
  Object.assign(element4.style, codexIconStyle(glyph3));
  return element4;
}
function button(glyph3, name, action) {
  const element4 = node("button", { type: "button", "data-hcv-draft-button": "" });
  const label = node("span", { "data-hcv-draft-label": "" }, name);
  element4.append(icon7(glyph3), label);
  if (action) element4.addEventListener("click", action);
  return { element: element4, label, glyph: (name2) => element4.firstElementChild.replaceWith(icon7(name2)) };
}
function panel(kind) {
  return node("div", { popover: "auto", "data-hcv-draft-menu": kind });
}
function position(popup, anchor, end = false) {
  const target = popup.closest("[data-radix-popper-content-wrapper]") || popup;
  const rect = anchor.getBoundingClientRect();
  const kind = popup.dataset.hcvDraftMenu || popup.dataset.hcvDraftNativeMenu;
  const width = Math.min(menuWidths[kind], window.innerWidth - 16);
  const top = rect.top - (kind === "git" ? 5 : 4);
  const left = Math.max(8, Math.min(end ? rect.right - width : rect.left, window.innerWidth - width - 8));
  target.style.setProperty("--hcv-draft-left", left + "px");
  target.style.setProperty("--hcv-draft-bottom", window.innerHeight - top + "px");
  target.style.setProperty("--hcv-draft-max-height", Math.max(80, top - 8) + "px");
}
function startNativeMenu(source, anchor, decorate) {
  if (!source || source.disabled) return null;
  const cleanup = () => {
    if (!menu) return;
    const wrapper = menu.closest("[data-radix-popper-content-wrapper]");
    menu.removeAttribute("data-hcv-draft-native-menu");
    title?.remove();
    for (const item of menu.querySelectorAll("[data-hcv-device-label]")) item.removeAttribute("data-hcv-device-label");
    for (const property of ["--hcv-draft-left", "--hcv-draft-bottom", "--hcv-draft-max-height"]) {
      wrapper?.style.removeProperty(property);
    }
  };
  let menu;
  let title;
  let frames = 0;
  let frame = 0;
  let stopped = false;
  const observer = new MutationObserver(queue);
  const dispose = (close = false) => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    window.removeEventListener("resize", queue);
    cancelAnimationFrame(frame);
    cleanup();
    anchor.removeAttribute("data-hcv-native-open");
    anchor.setAttribute("aria-expanded", "false");
    if (close && menu?.dataset.state === "open") {
      menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    }
  };
  function update() {
    frame = 0;
    if (!anchor.isConnected || !source.isConnected) return dispose(true);
    if (menu && (!menu.isConnected || menu.dataset.state !== "open")) {
      if (document.activeElement === source) anchor.focus({ preventScroll: true });
      return dispose();
    }
    if (!menu) {
      const id2 = source.getAttribute("aria-controls");
      menu = id2 && document.getElementById(id2);
      if (!menu) {
        if (frames++ < 8) queue();
        else dispose();
        return;
      }
      menu.setAttribute("data-hcv-draft-native-menu", "device");
      title = node("div", { "data-hcv-draft-menu-heading": "" }, labels9().location);
      menu.prepend(title);
      decorate?.(menu);
    }
    position(menu, anchor);
  }
  function queue() {
    if (!frame && !stopped) frame = requestAnimationFrame(update);
  }
  anchor.setAttribute("data-hcv-native-open", "");
  anchor.setAttribute("aria-expanded", "true");
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
  window.addEventListener("resize", queue);
  source.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  queue();
  return dispose;
}
function normalized(path) {
  const clean = (path || "").replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[A-Z]:/i.test(clean) ? clean.toLowerCase() : clean;
}
function newDraftBar(form, current, localEnvironment) {
  const strip = node("div", { "data-hcv-draft-bar": "", role: "group", "aria-label": labels9().bar });
  const projectMenu = panel("projects");
  const localMenu = panel("device");
  const gearMenu = panel("git");
  let connection;
  let dataScope;
  let worktree = { label: "", branch: "" };
  let version2 = 0;
  let bridge;
  let disposed = false;
  const scope2 = () => JSON.stringify([host13.state.connectionId.get(), host13.state.profile.get()]);
  const activeHere = (key) => !disposed && current() && key === scope2();
  const canRequest = () => host13.state.gateway.get() === "open";
  const request = (method, params) => host13.request(method, { ...params, profile: host13.state.profile.get() }, 5e3);
  const error = () => host13.notify({ kind: "error", message: labels9().actionsError });
  const projects2 = button("folder", labels9().noProject);
  const device = button("laptop", labels9().device);
  const gear = button("settings", "");
  const search = node("input", { type: "search", autofocus: "", "data-hcv-draft-search": "" });
  const results = node("div", { "data-hcv-draft-projects": "" });
  const create = button("plus", labels9().create, () => void createProject());
  const noProject = button("close", labels9().none, () => void selectProject(null));
  const projectFooter = node("div", { "data-hcv-draft-menu-footer": "" });
  projectFooter.append(create.element, noProject.element);
  const searchRow = node("label", { "data-hcv-draft-search-row": "" });
  searchRow.append(icon7("search"), search);
  projectMenu.append(searchRow, results, projectFooter);
  function bind(opener, popup, end = false) {
    opener.popoverTargetElement = popup;
    opener.setAttribute("aria-haspopup", "dialog");
    popup.setAttribute("role", "dialog");
    popup.addEventListener("beforetoggle", (event) => {
      if (event.newState === "open") position(popup, opener, end);
    });
    popup.addEventListener("toggle", (event) => {
      opener.setAttribute("aria-expanded", String(event.newState === "open"));
      if (event.newState === "open") position(popup, opener, end);
    });
    popup.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      popup.hidePopover();
      opener.focus({ preventScroll: true });
    });
    opener.setAttribute("aria-expanded", "false");
  }
  bind(projects2.element, projectMenu);
  bind(gear.element, gearMenu, true);
  bind(device.element, localMenu);
  device.element.addEventListener("click", (event) => {
    const source = document.querySelector(nativeDevice);
    if (!source) {
      device.element.setAttribute("aria-haspopup", "dialog");
      return;
    }
    event.preventDefault();
    bridge?.(true);
    device.element.setAttribute("aria-haspopup", "menu");
    bridge = startNativeMenu(source, device.element, (menu) => {
      for (const glyph3 of menu.querySelectorAll('[data-slot="connection-glyph"][data-connection-kind="local"]')) {
        const title = glyph3.nextElementSibling;
        title?.setAttribute("data-hcv-device-label", labels9().device);
      }
    });
  });
  const manage = button("settings", labels9().manage, () => {
    localMenu.hidePopover();
    host13.navigate(settingsRoute);
  });
  const localHeading = node("div", { "data-hcv-draft-menu-heading": "" });
  const selectedLocal = button("laptop", labels9().device, () => localMenu.hidePopover());
  selectedLocal.element.append(icon7("check"));
  localMenu.append(localHeading, selectedLocal.element, manage.element);
  const gitHeading = node("div", { "data-hcv-draft-menu-heading": "" });
  const localGit = () => host13.state.connectionId.get() === "local" && worktree.branch && window.hermesDesktop?.git;
  const worktreeTrigger = () => {
    const label = CSS.escape(labels9().nativeWorktree);
    const cwd = normalized(host13.state.cwd.get());
    return [...document.querySelectorAll(sidebarSelector + ' button[aria-label="' + label + '"]:has(> .codicon-git-branch)')].find((button2) => normalized(nativeWorktreePath(button2)) === cwd);
  };
  const newWorktree = button("worktree", labels9().worktree, async () => {
    if (!localGit()) return;
    const key = scope2();
    const cwd = host13.state.cwd.get();
    const ready = () => activeHere(key) && cwd === host13.state.cwd.get();
    gearMenu.hidePopover();
    const trigger = worktreeTrigger();
    if (trigger) return trigger.click();
    if (!worktree.projectId) return error();
    const sidebar2 = await sidebarFor(sidebarSelector, key);
    if (!sidebar2 || !ready()) return;
    sidebar2.querySelector("[data-hcv-show-projects]")?.click();
    sidebar2.querySelector('[data-sessions-mode="project"] button[class~="group/back"]')?.click();
    const projectRow2 = sidebarSelector + ' [data-sessions-project="' + CSS.escape(worktree.projectId) + '"] [data-hcv-native-project-action][data-slot="row-button"]';
    const projectButton = await sidebarFor(projectRow2, key);
    if (!ready()) return;
    if (!projectButton) return error();
    const opened = await new Promise((resolve) => {
      const done = (result) => {
        observer.disconnect();
        clearTimeout(timeout);
        resolve(result);
      };
      const open = () => {
        if (!ready()) return done(false);
        const action = worktreeTrigger();
        if (!action) return;
        done(true);
        action.click();
      };
      const observer = new MutationObserver(open);
      const timeout = setTimeout(() => done(false), 1e3);
      observer.observe(sidebar2, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-sessions-mode"] });
      projectButton.click();
      open();
    });
    if (!opened && ready()) error();
  });
  newWorktree.element.append(node("span", { "data-hcv-draft-detail": "" }), icon7("right"));
  const branch = button("branch", labels9().branch, () => void chooseBranch());
  const branchValue = node("span", { "data-hcv-draft-detail": "" });
  branch.element.append(branchValue, icon7("right"));
  const environment = button("settings", labels9().environment, () => {
    const cwd = host13.state.cwd.get();
    gearMenu.hidePopover();
    void localEnvironment?.open({ cwd, projectName: worktree.label, trigger: gear.element });
  });
  environment.element.disabled = true;
  const envValue = node("span", { "data-hcv-draft-detail": "" });
  environment.element.append(envValue, icon7("right"));
  const gitOptions = node("div", { "data-hcv-draft-branches": "" });
  const gitSetup = node("div", { "data-hcv-draft-git-setup": "" });
  gitSetup.append(newWorktree.element, branch.element, environment.element);
  gearMenu.append(gitHeading, gitSetup, gitOptions);
  gearMenu.addEventListener("beforetoggle", (event) => {
    if (event.newState !== "open") return;
    newWorktree.element.disabled = !localGit() || !(worktreeTrigger() || worktree.projectId);
    branch.element.disabled = !localGit();
    const cwd = host13.state.cwd.get();
    const key = scope2();
    environment.element.disabled = !localEnvironment || host13.state.connectionId.get() !== "local" || !cwd;
    envValue.textContent = labels9().noEnvironment;
    if (!environment.element.disabled) void localEnvironment.name(cwd).then((name) => {
      if (activeHere(key) && cwd === host13.state.cwd.get() && gearMenu.matches(":popover-open")) {
        envValue.textContent = name || labels9().noEnvironment;
      }
    });
    branchValue.textContent = worktree.branch || labels9().noBranch;
    gitHeading.textContent = labels9().configure;
    gitSetup.hidden = false;
    gitOptions.replaceChildren();
  });
  async function chooseBranch() {
    const git = localGit();
    const cwd = host13.state.cwd.get();
    const key = scope2();
    if (!git || !cwd) return;
    gitSetup.hidden = true;
    gitHeading.textContent = labels9().branch;
    gitOptions.replaceChildren(node("p", { role: "status" }, labels9().loading));
    const ready = () => activeHere(key) && cwd === host13.state.cwd.get() && gearMenu.matches(":popover-open");
    const branches = await git.branchList(cwd).catch(() => null);
    if (!ready()) return;
    const localBranches = branches?.filter((row2) => !row2.isRemote && row2.name) || [];
    if (!localBranches.length) {
      gitOptions.replaceChildren(node("p", { role: "status" }, labels9().branchError));
      return;
    }
    gitOptions.replaceChildren(...localBranches.map(({ name }) => {
      const row2 = button("branch", name, async () => {
        if (!ready()) return;
        gearMenu.hidePopover();
        if (name === worktree.branch) return;
        try {
          const result = await git.branchSwitch(cwd, name);
          if (activeHere(key) && cwd === host13.state.cwd.get()) {
            worktree.branch = result.branch;
            localize();
            void refresh();
          }
        } catch {
          host13.notify({ kind: "error", message: labels9().switchError });
        }
      }).element;
      if (name === worktree.branch) {
        row2.setAttribute("aria-current", "true");
        row2.append(icon7("check"));
      }
      return row2;
    }));
    gitOptions.querySelector('[aria-current="true"], button')?.focus();
  }
  let catalog;
  function renderProjects() {
    const text = search.value.trim().toLowerCase();
    const cwd = normalized(host13.state.cwd.get());
    const list = catalog?.filter(({ label, path }) => (label + " " + path).toLowerCase().includes(text)) || [];
    if (!list.length) {
      const message = catalog === null ? labels9().projectError : catalog ? labels9().empty : labels9().loading;
      results.replaceChildren(node("p", { role: "status" }, message));
      return;
    }
    results.replaceChildren(...list.map(({ label, path }) => {
      const row2 = button("folder", label, () => void selectProject(path)).element;
      row2.title = path;
      if (cwd && (cwd === normalized(path) || cwd.startsWith(normalized(path) + "/"))) {
        row2.setAttribute("aria-current", "true");
        row2.append(icon7("check"));
      }
      return row2;
    }));
  }
  projectMenu.addEventListener("toggle", async (event) => {
    if (event.newState !== "open") return;
    const key = scope2();
    const requestId = ++version2;
    catalog = void 0;
    search.value = "";
    search.focus();
    renderProjects();
    try {
      if (!canRequest()) throw new Error("Gateway unavailable");
      const reply = await request("projects.tree", { preview_limit: 1 });
      if (!activeHere(key) || requestId !== version2 || !projectMenu.matches(":popover-open")) return;
      catalog = (reply.projects || []).filter((row2) => !row2.isNoProject && row2.label).map((row2) => ({ label: row2.label, path: row2.path || row2.repos?.find((repo) => repo.path)?.path })).filter((row2) => typeof row2.path === "string" && row2.path.trim());
    } catch {
      if (!activeHere(key) || requestId !== version2) return;
      catalog = null;
    }
    renderProjects();
  });
  search.addEventListener("input", renderProjects);
  projectMenu.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const options = [...results.querySelectorAll("button")];
    if (!options.length) return;
    event.preventDefault();
    const index = options.indexOf(document.activeElement);
    const target = index < 0 ? event.key === "ArrowDown" ? 0 : options.length - 1 : index + (event.key === "ArrowDown" ? 1 : -1);
    if (target < 0) search.focus();
    else options[Math.min(target, options.length - 1)].focus();
  });
  async function sidebarFor(selector, key) {
    let found = document.querySelector(selector);
    if (found) return found;
    host13.revealPane("sessions");
    for (let i = 0; i < 10 && activeHere(key); i++) {
      await new Promise(requestAnimationFrame);
      found = document.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  async function selectProject(path) {
    const key = scope2();
    projectMenu.hidePopover();
    if (normalized(path) === normalized(host13.state.cwd.get())) return;
    const draft = await host13.composer.getDraft(null).catch(() => null);
    const sidebar2 = await sidebarFor(sidebarSelector, key);
    const openDraft = nativeDraftWorkspaceAction(sidebar2);
    if (!activeHere(key)) return;
    if (!openDraft) return error();
    openDraft(path);
    if (draft) {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const next = await host13.composer.getDraft(null).catch(() => null);
      if (!next && !host13.state.focusedStoredSessionId.get() && !host13.state.busy.get() && key === scope2()) {
        await host13.composer.setDraft(null, draft).catch(() => {
        });
      }
    }
  }
  async function createProject() {
    const key = scope2();
    projectMenu.hidePopover();
    const sidebar2 = await sidebarFor(sidebarSelector, key);
    if (!sidebar2 || !activeHere(key)) return;
    sidebar2.querySelector("[data-hcv-show-projects]")?.click();
    sidebar2.querySelector('[data-sessions-mode="project"] button[class~="group/back"]')?.click();
    const create2 = await sidebarFor(sidebarSelector + " [data-hcv-projects-actions] button:has(> .codicon-add)", key);
    if (activeHere(key)) {
      if (create2) create2.click();
      else error();
    }
  }
  function localize() {
    const t = labels9();
    strip.setAttribute("aria-label", t.bar);
    projects2.element.setAttribute("aria-label", t.projects);
    projectMenu.setAttribute("aria-label", t.projects);
    device.element.setAttribute("aria-label", t.location);
    localMenu.setAttribute("aria-label", t.location);
    gear.element.setAttribute("aria-label", t.configure);
    gear.element.title = t.configure;
    gearMenu.setAttribute("aria-label", t.configure);
    search.setAttribute("aria-label", t.search);
    search.placeholder = t.search;
    localHeading.textContent = t.location;
    gitHeading.textContent = t.configure;
    create.label.textContent = t.create;
    noProject.label.textContent = t.none;
    selectedLocal.label.textContent = t.device;
    manage.label.textContent = t.manage;
    newWorktree.label.textContent = t.worktree;
    branch.label.textContent = t.branch;
    branchValue.textContent = worktree.branch || t.noBranch;
    environment.label.textContent = t.environment;
    envValue.textContent = t.noEnvironment;
    projects2.label.textContent = worktree.label || t.noProject;
    device.label.textContent = connection?.kind === "local" || !connection ? t.device : connection.label;
  }
  let refreshId = 0;
  async function refresh() {
    const key = scope2();
    const id2 = ++refreshId;
    const cwd = host13.state.cwd.get();
    if (key !== dataScope) {
      dataScope = key;
      worktree = { label: "", branch: "" };
      const active3 = host13.state.connectionId.get();
      connection = active3 && active3 !== "local" ? { kind: "remote", label: "\u2026" } : null;
      for (const menu of [projectMenu, localMenu, gearMenu]) menu.hidePopover();
    }
    localize();
    const active2 = host13.state.connectionId.get();
    const [devices, info] = await Promise.all([
      host13.connections().catch(() => []),
      cwd && canRequest() ? request("projects.for_cwd", { cwd }).catch(() => null) : null
    ]);
    if (!activeHere(key) || id2 !== refreshId) return;
    connection = devices.find((row2) => row2.id === active2) || connection;
    worktree = {
      label: info?.project?.name || cwd.split(/[/\\]/).filter(Boolean).at(-1) || "",
      branch: info?.branch || "",
      projectId: info?.project?.id
    };
    device.glyph(connection?.kind === "local" || !connection ? "laptop" : "cloud");
    localize();
  }
  strip.append(projects2.element, projectMenu, device.element, localMenu, gear.element, gearMenu);
  form.before(strip);
  const unbind = [host13.state.connectionId, host13.state.profile, host13.state.gateway, host13.state.cwd].map((store) => store.listen(refresh));
  const resize = () => {
    for (const [popup, control, end] of [[projectMenu, projects2, false], [localMenu, device, false], [gearMenu, gear, true]]) {
      if (popup.matches(":popover-open")) position(popup, control.element, end);
    }
  };
  window.addEventListener("resize", resize);
  window.addEventListener("focus", refresh);
  void refresh();
  return {
    localize,
    dispose() {
      disposed = true;
      for (const off of unbind) off();
      window.removeEventListener("resize", resize);
      window.removeEventListener("focus", refresh);
      bridge?.(true);
      strip.remove();
    }
  };
}
function styles3(active2) {
  const draft = active2 + " " + toolbar;
  const menu = active2 + " [data-hcv-draft-menu]";
  const native = active2 + " [data-hcv-draft-native-menu]";
  const popper = active2 + " [data-radix-popper-content-wrapper]:has(> [data-hcv-draft-native-menu])";
  const control = "[data-hcv-draft-button]";
  const label = "[data-hcv-draft-label]";
  const glyph3 = "[data-hcv-draft-icon]";
  return [
    "@media (forced-colors: none) {",
    draft + " { position: relative; z-index: 1; display: flex; align-items: center; min-inline-size: 0; min-block-size: 40px; margin: 0 " + toolbarInset + "px -4px; padding: 6px 8px; border-radius: 20px 20px 0 0; background: var(--hcv-hover); color: var(--hcv-text); font: 12px/18px var(--hcv-ui-font); }",
    draft + " + " + formSelector + " { z-index: 2; }",
    draft + " " + control + " { display: flex; min-inline-size: 0; min-block-size: 28px; align-items: center; gap: 6px; padding: 0 8px; border-radius: 999px; text-align: start; cursor: pointer; -webkit-app-region: no-drag; }",
    draft + " > " + control + ":last-of-type { flex: none; justify-content: center; margin-inline-start: auto; inline-size: 28px; padding: 0; color: var(--hcv-muted); }",
    draft + " " + label + " { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }",
    draft + " " + label + ":empty { display: none; }",
    draft + " " + glyph3 + " { display: inline-block; flex: none; inline-size: 16px; block-size: 16px; }",
    draft + " > " + control + ':is(:hover, [aria-expanded="true"]) { background: var(--hcv-composer); }',
    draft + " > " + control + ":focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }",
    menu + ", " + native + " { box-sizing: border-box; min-inline-size: 0; max-block-size: var(--hcv-draft-max-height, 60vh); overflow: auto; overscroll-behavior: contain; padding: 4px; border: 1px solid transparent; border-radius: 16px; background: var(--hcv-menu); box-shadow: 0 0 0 .5px var(--hcv-hairline), 0 8px 16px -4px #0000001f; color: var(--hcv-text); font: 13px/20px var(--hcv-ui-font); }",
    ...Object.entries(menuWidths).map(([kind, width]) => menu + '[data-hcv-draft-menu="' + kind + '"]' + (kind === "device" ? ", " + native : "") + " { inline-size: min(" + width + "px, calc(100vw - 16px)); }"),
    menu + '[data-hcv-draft-menu="git"] { padding: 8px; }',
    menu + ", " + popper + " { position: fixed !important; inset: auto auto var(--hcv-draft-bottom, 40px) var(--hcv-draft-left, 8px) !important; transform: none !important; margin: 0; }",
    menu + " " + control + ", " + native + ' [role^="menuitem"] { inline-size: 100%; justify-content: flex-start; border-radius: 11px; min-block-size: 28px; }',
    menu + " " + control + ":disabled { color: var(--hcv-muted); opacity: .55; cursor: default; background: transparent; }",
    menu + " " + control + " > " + glyph3 + '[data-hcv-draft-icon="check"] { margin-inline-start: auto; }',
    active2 + " [data-hcv-draft-menu-heading] { min-block-size: 28px; display: flex; align-items: center; padding-inline: 8px; color: var(--hcv-muted); }",
    draft + " [data-hcv-draft-detail] { margin-inline-start: auto; color: var(--hcv-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    draft + " [data-hcv-draft-search-row] { display: flex; min-block-size: 36px; margin-inline: 4px; padding-inline: 3px; gap: 6px; align-items: center; color: var(--hcv-muted); border-block-end: 1px solid var(--hcv-hairline); }",
    draft + " [data-hcv-draft-search-row]:focus-within { color: var(--hcv-text); background: color-mix(in srgb, var(--hcv-text) 3%, transparent); }",
    draft + " [data-hcv-draft-search] { inline-size: 100%; min-inline-size: 0; min-block-size: 30px; background: transparent; color: var(--hcv-text); outline: none; }",
    draft + " [data-hcv-draft-projects] { max-block-size: min(40vh, 230px); overflow-y: auto; overscroll-behavior: contain; padding-block: 4px; }",
    draft + " :is([data-hcv-draft-projects], [data-hcv-draft-branches]) p { margin: 0; padding: 7px; color: var(--hcv-muted); }",
    draft + " [data-hcv-draft-menu-footer] { border-block-start: 1px solid var(--hcv-stroke); padding-block-start: 4px; }",
    native + ' [role^="menuitem"] { padding: 0 8px; }',
    native + ' [role^="menuitem"] > span:first-child { gap: 6px; }',
    native + ' [data-slot="dropdown-menu-separator"] { margin-inline: 8px; }',
    native + ' [data-slot="connection-glyph"] { flex: none; width: 16px; height: 16px; background: currentColor; mask: ' + codexMask("cloud") + " center / contain no-repeat; }",
    native + ' [data-connection-kind="local"] { mask-image: ' + codexMask("laptop") + "; }",
    native + ' [data-slot="connection-glyph"] > svg { display: none; }',
    native + ' [role^="menuitem"] :is(.codicon-settings-gear, .codicon-check) { flex: none; width: 16px; height: 16px; background: currentColor; }',
    native + " .codicon-settings-gear { mask: " + codexMask("settings") + " center / contain no-repeat; }",
    native + " .codicon-check { mask: " + codexMask("check") + " center / contain no-repeat; }",
    native + ' [role^="menuitem"] :is(.codicon-settings-gear, .codicon-check)::before { content: none; }',
    native + " [data-hcv-device-label] { font-size: 0; }",
    native + " [data-hcv-device-label]::after { content: attr(data-hcv-device-label); font-size: 13px; }",
    "}"
  ].join("\n");
}
function registerDraftSetup(ctx, active2, localEnvironment) {
  const root = document.documentElement;
  const contrast = matchMedia("(forced-colors: none)");
  const sheet = node("style", { "data-hcv-draft-setup-style": "" });
  sheet.textContent = styles3(active2);
  document.head.append(sheet);
  let form;
  let bar;
  let frame = 0;
  const target = () => {
    if (!contrast.matches || !root.matches(active2) || host13.state.focusedStoredSessionId.get() || host13.state.activeSessionId.get() || host13.state.busy.get()) return null;
    const chat2 = document.querySelector(primary3);
    const transcript4 = chat2?.querySelector('[data-slot="aui_thread-content"]');
    if (!transcript4 || transcript4.querySelector('[data-slot="aui_message-group"]')) return null;
    return chat2.querySelector(formSelector);
  };
  const update = () => {
    frame = 0;
    const next = target();
    if (next === form) return;
    bar?.dispose();
    form = next;
    bar = form ? newDraftBar(form, () => target() === form, localEnvironment) : null;
  };
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const observer = new MutationObserver((records) => {
    const selector = [primary3, formSelector, '[data-slot="aui_thread-content"]', '[data-slot="aui_message-group"]'].join(", ");
    if (records.some(({ target: target2, addedNodes, removedNodes }) => target2 === root || [...addedNodes, ...removedNodes].some((node2) => node2 instanceof Element && (node2.matches(selector) || node2.querySelector(selector))))) queue();
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-hermes-theme", "data-hermes-codex-visual", "data-popped-out"]
  });
  contrast.addEventListener("change", queue);
  const off = [host13.state.focusedStoredSessionId, host13.state.activeSessionId, host13.state.busy].map((store) => store.subscribe(queue));
  ctx.i18n.onLocaleChange(() => bar?.localize());
  ctx.onDispose(() => {
    observer.disconnect();
    contrast.removeEventListener("change", queue);
    for (const unsubscribe of off) unsubscribe();
    cancelAnimationFrame(frame);
    bar?.dispose();
    sheet.remove();
  });
  queue();
}

// source/interface.js
var menus = ':is([data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-sub-content"], [data-slot="context-menu-content"], [data-slot="context-menu-sub-content"], [data-slot="select-content"])';
var modelCatalog = '[data-slot="dropdown-menu-content"]:has(> [data-slot="dropdown-menu-search"]):has(> [data-slot="dropdown-menu-item"] > .codicon-settings-gear)';
var modelMeta = '[data-slot="dropdown-menu-sub-trigger"] > span > span.uppercase.tracking-wide';
var effortBadge = "data-hcv-model-effort";
var effortLabels = /* @__PURE__ */ new Set(["Off", "Min", "Low", "Med", "High", "XHigh", "Max", "Ultra"]);
var items = ':is([data-slot^="dropdown-menu-"][role^="menuitem"], [data-slot^="context-menu-"][role^="menuitem"], [data-slot="select-item"])';
var popover = '[data-slot="popover-content"]';
var tip = '[data-slot="tooltip-content"]';
var dialog = '[data-slot="dialog-content"]';
var dialogOverlay = '[data-slot="dialog-overlay"]';
var notification = '[data-slot="card-stack-surface"] > div > [data-slot="alert"][aria-live]';
var notificationStack = `[data-slot="card-stack"]:has(> [data-slot="card-stack-front"] > ${notification})`;
var overlays = "[data-overlay-surface]";
var selectTriggers = ':is([data-slot="select-trigger"], [data-slot="searchable-select-trigger"], [data-slot="compact-select-trigger"])';
var fields = `:is([data-slot="input"]:not([type="file"], [type="checkbox"], [type="range"], [type="color"]), ${selectTriggers}, [data-slot="textarea"])`;
var checks = ':is([data-slot="checkbox"], [data-slot="checkbox-mark"])';
var checkIcon = ":is(.codicon-check, svg.tabler-icon-check)";
var commandItems = '[data-slot="command-item"]';
var menuButtons = ":is([data-hcv-draft-menu], [data-hcv-recents-menu], [data-hcv-queue-menu], [data-hcv-message-menu]) button";
var highlightedItem = `${items}:is(:focus, [data-highlighted], [data-state="open"]):not([data-disabled], [aria-disabled="true"])`;
var toggle = '[data-slot="switch"][role="switch"]';
var thumb = '[data-slot="switch-thumb"]';
var pageTabs = '[data-tour="page-tabs"]';
var pageShell = "section.h-full.min-w-0.overflow-hidden:not([data-chat-surface])";
var menuGlyphs = {
  "archive": "archive",
  "check": "check",
  "check-all": "markRead",
  "chevron-down": "down",
  "chevron-right": "right",
  "close": "close",
  "copy": "copy",
  "edit": "edit",
  "folder": "folder",
  "folder-library": "folder",
  "folder-opened": "folderOpen",
  "new-folder": "folderPlus",
  "pin": "pin",
  "pinned": "pin",
  "pinned-dirty": "pin",
  "refresh": "refresh",
  "symbol-color": "palette",
  "target": "target",
  "trash": "trash",
  "clock": "schedule",
  "root-folder": "folder",
  "account": "person",
  "pulse": "system",
  "list-filter": "filter",
  "add": "plus",
  "kebab-vertical": "more",
  "ellipsis": "more"
};
function screenFromRoute() {
  const name = window.location.hash.match(/^#\/(settings|command-center|session-import|capabilities|messaging|artifacts|cron|agents|profiles|starmap|webhooks)(?:[/?#]|$)/)?.[1];
  return name || "";
}
function watchModelEffortBadges(ctx) {
  const refresh = () => {
    observer.disconnect();
    observer.observe(document.body, { childList: true });
    for (const menu of document.querySelectorAll(modelCatalog)) {
      for (const badge of menu.querySelectorAll(modelMeta)) {
        const levels = badge.textContent.trim().split("\u2192");
        badge.toggleAttribute(effortBadge, levels.every((level) => effortLabels.has(level)));
      }
      observer.observe(menu, { childList: true, subtree: true, characterData: true });
    }
  };
  const observer = new MutationObserver(refresh);
  refresh();
  ctx.onDispose(() => {
    observer.disconnect();
    for (const badge of document.querySelectorAll(`[${effortBadge}]`)) badge.removeAttribute(effortBadge);
  });
}
function registerInterface(ctx, active2) {
  watchModelEffortBadges(ctx);
  const root = document.documentElement;
  const setScreen = () => {
    const screen = screenFromRoute();
    if (!root.matches(active2) || !screen) root.removeAttribute("data-hcv-screen");
    else if (root.dataset.hcvScreen !== screen) root.dataset.hcvScreen = screen;
  };
  const observer = new MutationObserver(setScreen);
  observer.observe(root, { attributes: true, attributeFilter: ["data-hermes-theme", "data-hermes-codex-visual"] });
  ctx.addEventListener(window, "hashchange", setScreen);
  ctx.addEventListener(window, "popstate", setScreen);
  if (window.navigation) ctx.addEventListener(window.navigation, "currententrychange", setScreen);
  ctx.onDispose(() => {
    observer.disconnect();
    root.removeAttribute("data-hcv-screen");
  });
  setScreen();
  const pages = `${active2}:is([data-hcv-screen="capabilities"],[data-hcv-screen="messaging"],[data-hcv-screen="artifacts"]) ${pageShell}`;
  const capabilities = `${active2}[data-hcv-screen="capabilities"] ${pageShell}`;
  const shown = `${active2} ${overlays}`;
  const sessions = `${active2}[data-hcv-screen="command-center"] ${overlays} main`;
  const artifacts = `${active2}[data-hcv-screen="artifacts"] ${pageShell}`;
  const cron = `${active2}[data-hcv-screen="cron"] ${overlays}`;
  const pageSearch = "div:has(> svg.tabler-icon-search + input[placeholder])";
  const messageRows = `${active2}[data-hcv-screen="messaging"] ${pageShell} button.row-hover`;
  const tabs = `${active2} [data-zone-tabstrip] [role="tab"][data-tree-tab]:has(> .pane-tab-content):not([data-vertical])`;
  const mainTabs = tabs.replace("[data-zone-tabstrip]", '[data-zone-tabstrip="grp-main"]');
  const projectRow2 = `${active2} [data-sessions-project]:not([data-sessions-mode]) > :first-child`;
  const paneAdd = `${active2} [data-zone-tabstrip] button:has(> .codicon-add)`;
  const card = `${active2} [data-hcv-context-card]`;
  const catalogDetail = `${active2}[data-hcv-screen="capabilities"] [data-slot="dialog-content"]:has([data-catalog-detail])`;
  const nav = `${shown} [data-tour="overlay-nav"]`;
  const notice2 = `${active2} ${notification}`;
  const noticeDetails = `${notice2} details > summary`;
  const popupButtons = `${active2} :is(
    ${dialog} [data-slot="dialog-close-button"],
    ${dialog} :is([data-slot="dialog-footer"], footer) button[data-slot="button"],
    ${popover} button[data-slot="button"],
    ${notification} button[data-slot="button"]
  )`;
  const quietPopupButtons = `${popupButtons}:is([data-variant="ghost"], [data-variant="outline"], [data-variant="secondary"], [data-slot="dialog-close-button"])`;
  const switchThumb = codexReference.switch.height - codexReference.switch.offset * 2;
  const switchTravel = codexReference.switch.width - codexReference.switch.height;
  const sheet = document.createElement("style");
  sheet.dataset.hcvInterface = "";
  sheet.textContent = `
${active2} ${modelCatalog} [${effortBadge}] { display: none; }
${active2} ${modelCatalog} :is([data-slot="dropdown-menu-item"][class~="group/label"], [data-slot="dropdown-menu-label"]) {
  text-transform: lowercase;
  letter-spacing: normal;
}
@media (forced-colors: none) {
  ${active2} {
    --hcv-unit: ${codexReference.spacing}px;
    --hcv-ui-font: ${codexReference.font};
    --hcv-enter: ${codexReference.enter};
    --hcv-exit: ${codexReference.exit};
    --hcv-ease: ${codexReference.hover};
    --hcv-move: ${codexReference.move};
    --hcv-enter-time: ${codexReference.enterTime};
    --hcv-exit-time: ${codexReference.exitTime};
    --hcv-menu-start-scale: ${codexReference.menuStartScale};
    --hcv-highlight-start-scale: ${codexReference.highlightStartScale};
    /* Codex Desktop menu/form/action radii. See 0fff881d427a.css and e77f816560c6.css. */
    --hcv-menu-radius: calc(5 * var(--hcv-unit));
    --hcv-dialog-radius: calc(6 * var(--hcv-unit));
    --hcv-popup-button-radius: 10px;
    --hcv-hover-menu: color-mix(in srgb, var(--hcv-text) 8%, transparent);
    --hcv-hairline: color-mix(in srgb, var(--hcv-text) 11%, transparent);
    --hcv-form-surface: color-mix(in srgb, var(--hcv-text) 4%, var(--hcv-chat));
    --hcv-menu-shadow: 0 12px 32px rgba(0,0,0,.15), 0 2px 6px rgba(0,0,0,.09);
  }
  ${active2}[data-hermes-mode="dark"] {
    --hcv-hover-menu: color-mix(in srgb, var(--hcv-text) 12%, transparent);
    --hcv-menu-shadow: 0 12px 32px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.19);
  }

  /* Native Radix menus retain focus, arrow keys, radio semantics and placement. */
  ${active2} :is(${menus}, ${popover}) {
    border: 1px solid var(--hcv-hairline);
    border-radius: var(--hcv-menu-radius);
    background-color: var(--hcv-menu);
    color: var(--hcv-text);
    box-shadow: var(--hcv-menu-shadow);
    font-family: var(--hcv-ui-font);
    --tw-enter-blur: 0px;
    --tw-exit-blur: 0px;
    animation: none;
  }
  ${active2} ${tip} {
    max-inline-size: min(300px, calc(100vw - 24px), var(--radix-tooltip-content-available-width, 300px));
    padding: ${codexReference.tooltip.padding};
    border: 1px solid color-mix(in srgb, var(--hcv-text) 5%, transparent);
    border-radius: ${codexReference.tooltip.radius};
    background: var(--hcv-menu);
    color: var(--hcv-text);
    box-shadow: var(--hcv-menu-shadow);
    font: 400 13px/18px var(--hcv-ui-font);
    letter-spacing: -.15px;
    transform-origin: var(--radix-tooltip-content-transform-origin);
    animation: none;
  }
  ${active2} ${tip} [data-slot="tooltip-arrow"] { fill: var(--hcv-menu); }
  ${active2} :is(${dialog}, ${dialogOverlay}) { animation: none; }
  /* A dialog on a route overlay already has a blurred layer behind it.
     Use Codex's solid scrim here to avoid sampling that layer a second time. */
  ${active2}:has(${overlays}) ${dialogOverlay} {
    backdrop-filter: none;
    background-color: light-dark(#0000004d, #00000080);
  }
  ${active2}:has(${overlays}) ${dialog} { background-color: var(--hcv-menu); }
  ${active2} ${dialog} {
    border: 1px solid var(--hcv-hairline);
    border-radius: var(--hcv-dialog-radius);
    box-shadow: var(--hcv-menu-shadow);
    font-family: var(--hcv-ui-font);
  }
  ${active2} ${dialog} [data-slot="dialog-title"] {
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: -.012em;
  }
  ${active2} ${dialog} [data-slot="dialog-description"] {
    font-size: 13px;
    line-height: 1.5;
  }
  ${active2} ${notificationStack} :is([data-slot="card-stack-surface"], [data-slot="card-stack-edge"]) {
    border-color: var(--hcv-hairline);
    border-radius: var(--hcv-menu-radius);
    background-color: var(--hcv-menu);
    box-shadow: var(--hcv-menu-shadow);
  }
  ${notice2} {
    column-gap: 10px;
    font-family: var(--hcv-ui-font);
  }
  ${notice2} [data-slot="alert-title"] {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: -.01em;
  }
  ${notice2} [data-slot="alert-description"] {
    color: var(--hcv-muted);
    font-size: 13px;
    line-height: 1.5;
  }
  ${notice2} [data-slot="alert-description"] > p:first-child { line-height: inherit; }
  ${noticeDetails} {
    inline-size: fit-content;
    margin-inline-start: -6px;
    padding: 2px 6px;
    border-radius: 7px;
    cursor: pointer;
  }
  ${notice2} details > div { border-radius: var(--hcv-popup-button-radius); }
  ${popupButtons} {
    border-radius: var(--hcv-popup-button-radius);
    font-family: var(--hcv-ui-font);
    transition: none;
  }
  ${active2} :is(${dialog}, ${dialogOverlay})[data-state="closed"] { pointer-events: none; }
  ${active2} ${menus} { padding: 6px; font-size: 13px; line-height: 20px; }
  ${active2} [data-slot="dropdown-menu-content"]:is([data-hcv-sidebar-menu], :has(> [role="menuitem"] > .codicon-folder-opened)) {
    min-inline-size: min(224px, var(--radix-dropdown-menu-content-available-width, 100vw));
  }
  ${active2} [data-hcv-sidebar-menu] { translate: var(--hcv-sidebar-menu-shift, 0px) 0; }
  ${active2} ${items} {
    position: relative;
    min-block-size: 28px;
    border-radius: var(--hcv-popup-button-radius);
    gap: 8px;
    padding-block: 4px;
    padding-inline-start: 8px;
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    isolation: isolate;
  }
  ${active2} ${highlightedItem} {
    background: transparent;
  }
  ${active2} ${items}::before {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--hcv-hover-menu);
    opacity: 0;
    transform: scale(var(--hcv-highlight-start-scale));
    content: '';
    pointer-events: none;
  }
  ${active2} ${highlightedItem}::before {
    opacity: 1;
    transform: scale(1);
  }
  ${active2} ${items}[data-variant="destructive"]::before {
    background: color-mix(in srgb, var(--destructive) 13%, transparent);
  }
  ${active2} :is([data-slot="dropdown-menu-separator"], [data-slot="context-menu-separator"], [data-slot="select-separator"]) {
    margin: 4px 6px;
    background: var(--hcv-hairline);
  }
  ${Object.entries(menuGlyphs).map(([native, name]) => codexIconRules(`${active2} ${items} .codicon-${native}`, name)).join("")}
  ${codexIconRules(`${active2} ${items} ${checkIcon}`, "check")}
  ${active2} ${commandItems} { border-radius: 8px; }
  ${active2} ${commandItems}:is(:focus, [data-selected="true"]):not([data-disabled="true"], [aria-disabled="true"]),
  ${active2} ${menuButtons}:focus-visible:not(:disabled, [aria-disabled="true"]) {
    background-color: var(--hcv-hover-menu);
    color: var(--hcv-text);
  }
  ${codexIconRules(`${active2} ${commandItems} ${checkIcon}`, "check")}

  /* Native checkbox and checkbox-mark need different selectors: the mark
     renders a child icon only when selected and is itself decorative. */
  ${active2} ${checks} {
    inline-size: 16px;
    block-size: 16px;
    flex: 0 0 16px;
    border: 1px solid color-mix(in srgb, var(--hcv-text) 28%, transparent);
    border-radius: 4px;
  }
  ${active2} ${checks}:is([data-state="checked"], [data-state="indeterminate"], :has(> ${checkIcon})) {
    border-color: transparent;
    background-color: var(--hcv-action);
    color: var(--hcv-ink);
  }
  ${codexIconRules(`${active2} ${checks} ${checkIcon}`, "check")}
  ${active2} ${fields} {
    border-radius: 8px;
    min-inline-size: 0;
    font-family: var(--hcv-ui-font);
  }
  ${codexIconRules(`${active2} ${selectTriggers} > .codicon-chevron-down`, "down")}
  ${codexIconRules(`${active2} ${selectTriggers} > .codicon-chevron-up`, "down")}
  ${active2} ${selectTriggers} > .codicon-chevron-up { rotate: 180deg; }
  ${active2} ${toggle} {
    box-sizing: border-box;
    inline-size: ${codexReference.switch.width}px;
    min-inline-size: ${codexReference.switch.width}px;
    block-size: ${codexReference.switch.height}px;
    padding-inline: ${codexReference.switch.offset - 1}px;
    justify-content: flex-start;
    border: 1px solid var(--hcv-stroke);
    border-radius: 999px;
    background-color: var(--hcv-selected);
    box-shadow: none;
  }
  ${active2} ${toggle}[data-state="checked"] { background-color: var(--hcv-action); border-color: transparent; }
  ${active2} ${toggle} > ${thumb} {
    inline-size: ${switchThumb}px;
    block-size: ${switchThumb}px;
    translate: 0 0;
    transform: none;
    background-color: var(--hcv-text);
  }
  ${active2} ${toggle}[data-state="checked"] > ${thumb} {
    translate: ${switchTravel}px 0;
    background-color: var(--hcv-ink);
  }
  ${active2} ${toggle}[data-state="checked"]:dir(rtl) > ${thumb} { translate: -${switchTravel}px 0; }
  ${active2} ${toggle}:is(:disabled, [aria-disabled="true"]) { opacity: .5; }

  /* Compact controls: the hover target includes the whole row, with a
     stable trailing slot so titles don't jump when the actions appear. */
  ${tabs} {
    box-sizing: border-box;
    block-size: 32px;
    min-block-size: 32px;
    max-block-size: 32px;
    align-self: center;
    margin-inline: 2px;
    padding-inline: 4px;
    border: 0;
    border-radius: 8px;
    box-shadow: none;
    background: transparent;
    color: var(--hcv-muted);
  }
  ${tabs}[data-closeable] { --pane-tab-close-width: 22px; padding-inline-end: var(--pane-tab-close-width); }
  ${mainTabs} {
    block-size: 28px;
    min-block-size: 28px;
    max-block-size: 28px;
    padding-inline: 8px;
  }
  ${mainTabs}[data-closeable] { padding-inline-end: calc(var(--pane-tab-close-width) + 4px); }
  ${tabs}[data-closeable]:hover > .pane-tab-content { mask-image: none; }
  ${tabs}[data-active="true"], ${tabs}[data-selected] { color: var(--hcv-text); background: var(--hcv-selected); }
  ${tabs} .pane-tab-content span { text-transform: none; letter-spacing: normal; }
  ${tabs} .pane-tab-content .truncate {
    font: 500 13px/18px var(--hcv-ui-font);
    letter-spacing: 0;
    text-transform: none;
    text-overflow: ellipsis;
    unicode-bidi: plaintext;
  }
  ${tabs} .pane-tab-content > span:first-child { margin-inline: 4px 0; }
  ${codexIconRules(`${tabs} .pane-tab-content .codicon-folder`, "folder")}
  ${codexIconRules(`${paneAdd} > .codicon-add`, "plus")}
  ${paneAdd} {
    inline-size: 26px;
    block-size: 26px;
    margin-inline: 2px;
    border-radius: 7px;
  }
  ${active2} [data-titlebar-cluster] button[data-size="icon-titlebar"] { border-radius: 8px; }
  ${codexIconRules(`${active2} [data-titlebar-cluster] .codicon-settings-gear`, "settings")}
  ${codexIconRules(`${active2} [data-titlebar-cluster] .codicon-comment-discussion`, "hud")}
  ${codexIconRules(`${active2} [data-titlebar-cluster] .codicon-arrow-swap`, "swap")}
  ${codexIconRules(`${active2} [data-titlebar-cluster] .codicon-layout`, "layout")}
  ${projectRow2} {
    min-block-size: ${codexReference.sidebar.rowHeight}px;
    border-radius: ${codexReference.sidebar.rowRadius}px;
    padding-inline: 2px 4px;
    color: var(--hcv-text);
    cursor: default;
  }
  ${projectRow2}:has([data-state="open"][aria-haspopup="menu"]) { background: var(--hcv-selected); }
  ${projectRow2} [data-slot="row-button"] > span { text-decoration: none; }
  ${projectRow2} [data-row-actions] button {
    inline-size: 26px;
    block-size: 26px;
    border-radius: 6px;
  }
  ${projectRow2} [data-row-actions] button:focus-visible,
  ${projectRow2}[data-hcv-preview-open] [data-row-actions] button,
  ${projectRow2}:has([data-state="open"][aria-haspopup="menu"]) [data-row-actions] button { opacity: 1; }
  ${projectRow2} [data-row-actions] button > .codicon { font-size: 14px !important; }
  ${codexIconRules(`${projectRow2} [data-row-actions] .codicon-kebab-vertical`, "more")}
  ${codexIconRules(`${projectRow2} [data-row-actions] .codicon-add`, "newChat")}
  ${codexIconRules(`${active2} [data-tour="sessions-sidebar"] [data-row-actions] .codicon-kebab-vertical`, "more")}
  ${codexIconRules(`${active2} [data-tour="sessions-sidebar"] .codicon-list-filter`, "filter")}

  /* Shells share spacing but keep their own controls, labels and content. */
  ${pages}, ${shown} {
    font-family: var(--hcv-ui-font);
    --conversation-text-font-size: 14px;
    --conversation-caption-font-size: 12px;
    --conversation-caption-line-height: 18px;
  }
  ${pages} [data-catalog-card], ${pages} [data-tour="artifact-card"] {
    border: 1px solid var(--hcv-hairline);
    border-radius: 12px;
    background: var(--hcv-form-surface);
  }
  ${pages} [data-catalog-card] button:has(> .text-lg) > span { font-size: 15px; line-height: 20px; }
  ${pages} [data-catalog-card] > div { padding-inline: 12px; }
  ${catalogDetail} {
    background: var(--hcv-chat);
    color: var(--hcv-text);
    box-shadow: var(--hcv-menu-shadow);
    font-family: var(--hcv-ui-font);
    --conversation-caption-font-size: 13px;
    --conversation-caption-line-height: 20px;
  }
  ${catalogDetail} [data-slot="dialog-title"] {
    font-size: 21px;
    line-height: 28px;
    font-weight: 600;
  }
  ${catalogDetail} button.row-hover {
    border-radius: 8px;
    border: 1px solid var(--hcv-hairline);
  }
  ${artifacts} div:has(> table) {
    border-radius: 12px;
    border-color: var(--hcv-hairline);
    background: var(--hcv-form-surface);
  }
  ${artifacts} table th {
    padding: 8px 12px;
    background: var(--hcv-chat);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }
  ${artifacts} table tbody tr:focus-within { background: var(--hcv-hover); }
  ${pages} ${pageTabs} button {
    min-block-size: 30px;
    padding-inline: 12px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 18px;
  }
  ${pages} ${pageTabs} button:is([aria-current], [aria-selected="true"], [data-active="true"]) {
    color: var(--hcv-text);
    background: var(--hcv-selected);
  }
  ${capabilities} ${pageTabs} button {
    min-block-size: 26px;
    block-size: 26px;
    padding-inline: 8px;
    border-radius: 7px;
  }
  ${capabilities} ${pageTabs} button[data-active] > span { text-decoration-line: none; }
  :is(${pages}, ${shown}) ${pageSearch} {
    min-block-size: 32px;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 8px;
    opacity: 1;
    background-color: var(--hcv-form-surface);
  }
  :is(${pages}, ${shown}) ${pageSearch}:focus-within { border-color: var(--hcv-focus); }
  :is(${pages}, ${shown}) ${pageSearch} > input {
    height: auto;
    min-block-size: 30px;
    font-size: 13px;
    line-height: 18px;
  }
  ${codexIconRules(`:is(${pages}, ${shown}) ${pageSearch} > svg.tabler-icon-search`, "search")}
  ${messageRows}, ${cron} [data-panel-row] {
    min-block-size: 32px;
    border-radius: 8px;
    font-size: 13px;
  }
  ${messageRows} { padding-inline: 8px 10px; }
  ${cron} header > div > h2 { font-size: 20px; line-height: 26px; letter-spacing: -.01em; }
  ${cron} [data-panel-row] > button:first-child { padding-inline: 8px; }
  ${codexIconRules(`${cron} .codicon-watch`, "schedule")}
  ${codexIconRules(`${cron} .codicon-kebab-vertical`, "more")}
  ${codexIconRules(`${cron} .codicon-add`, "plus")}
  ${shown} {
    padding: clamp(10px, 2.4vw, 32px);
    background-color: rgb(0 0 0 / .24);
    backdrop-filter: blur(2px);
  }
  ${shown} > div > [data-glass-raised] {
    border: 1px solid var(--hcv-hairline);
    border-radius: var(--hcv-dialog-radius);
    background-color: var(--hcv-chat);
    box-shadow: var(--hcv-menu-shadow);
  }
  ${shown} main {
    padding-block-start: 24px;
    padding-block-end: 12px;
  }
  ${nav} { padding: 12px 8px; background: var(--hcv-sidebar); }
  ${nav} button.row-hover {
    height: auto;
    min-height: 30px;
    border: 0;
    border-radius: 8px;
    font-size: 13px;
    gap: 8px;
  }
  ${nav} button.row-hover[aria-current="page"] { background: var(--hcv-selected); color: var(--hcv-text); }
  ${nav} button.row-hover > svg { width: 16px; height: 16px; }
  ${shown} button[data-size="icon-titlebar"] { border-radius: 8px; }
  ${codexIconRules(`${shown} button[data-size="icon-titlebar"] .codicon-close`, "close")}
  ${codexIconRules(`${nav} button[data-tour="nav-sessions"] > svg`, "messages")}
  ${codexIconRules(`${nav} button[data-tour="nav-system"] > svg`, "system")}
  ${codexIconRules(`${nav} button[data-tour="nav-usage"] > svg`, "usage")}
  ${codexIconRules(`${nav} button[data-tour="nav-maintenance"] > svg`, "wrench")}

  ${sessions} > header h2 { font-size: 22px; font-weight: 600; line-height: 28px; }
  ${sessions} > header p { margin-block-start: 4px; }
  ${sessions} > header:has(input) > :last-child { flex: 0 1 min(45%, 320px); }
  ${sessions} > header:has(input) > :last-child > div { inline-size: 100%; }
  ${sessions} > div > div > ul > li {
    margin-block: 2px;
    padding: 0 8px 0 0;
    border-radius: 10px;
  }
  ${sessions} > div > div > ul > li > button:first-child {
    min-block-size: 48px;
    padding: 8px 12px;
    border-radius: 10px;
  }
  ${sessions} > div > div > ul > li > button:first-child > div:first-child { font-size: 14px; }
  ${sessions} > div > div > ul > li:focus-within { background: var(--hcv-hover); }

  ${active2} :is(${fields}, ${toggle}, [data-slot="checkbox"], [data-hcv-context-card] button, ${dialog} button):focus-visible,
  ${popupButtons}:focus-visible,
  ${noticeDetails}:focus-visible,
  ${shown} :is(button, a, input, textarea, select):focus-visible,
  ${projectRow2} :is(button, a):focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -2px;
  }
  :is(${pages}, ${shown}) ${pageSearch} > input:focus-visible { outline: none; }

  /* Codex Desktop bf55123332b3.css: menu item focus is a fill, with
     native outline behavior in forced colors. */
  ${active2} :is(${items}, ${commandItems}, ${menuButtons}):focus {
    outline: none;
    box-shadow: none;
  }

  @media (hover: hover) and (pointer: fine) {
    ${capabilities} ${pageTabs} button[data-active="false"]:hover { background-color: var(--hcv-hover); }
    ${active2} ${items}:hover:not([data-disabled], [aria-disabled="true"])::before {
      opacity: 1;
      transform: scale(1);
    }
    ${active2} ${menuButtons}:hover:not(:disabled, [aria-disabled="true"]) {
      background-color: var(--hcv-hover-menu);
    }
    ${noticeDetails}:hover,
    ${quietPopupButtons}:hover:not(:disabled, [aria-disabled="true"]) {
      background-color: var(--hcv-hover-menu);
      color: var(--hcv-text);
    }
    ${active2} ${toggle}[data-state="unchecked"]:not(:disabled, [aria-disabled="true"]):hover {
      background-color: color-mix(in srgb, var(--hcv-selected) 88%, var(--hcv-text));
    }
    ${tabs}:not([data-active="true"], [data-selected]):hover { background-color: var(--hcv-hover); }
    ${projectRow2}:hover,
    ${paneAdd}:hover,
    ${nav} button.row-hover:not([aria-current="page"]):hover,
    ${sessions} > div > div > ul > li:hover { background-color: var(--hcv-hover); }
    ${artifacts} table tbody tr:hover { background-color: var(--hcv-hover); }
    ${pages} [data-catalog-card]:hover, ${pages} [data-tour="artifact-card"]:hover {
      border-color: var(--hcv-stroke);
      background: var(--hcv-hover);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${pages}, ${shown} > div > [data-glass-raised] {
      animation: hcv-surface-in var(--hcv-enter-time) var(--hcv-enter);
    }
    ${active2} ${dialog}[data-state="open"] { animation: hcv-menu-in var(--hcv-enter-time) var(--hcv-enter) both; }
    ${active2} ${dialog}[data-state="closed"] { animation: hcv-menu-out var(--hcv-exit-time) var(--hcv-exit) both; }
    ${active2} ${dialogOverlay}[data-state="open"] { animation: hcv-surface-in var(--hcv-enter-time) var(--hcv-enter) both; }
    ${active2} ${dialogOverlay}[data-state="closed"] { animation: hcv-surface-out var(--hcv-exit-time) var(--hcv-exit) both; }
    ${active2} ${tip}:is([data-state="delayed-open"], [data-state="instant-open"]) {
      animation: hcv-menu-in ${codexReference.tooltip.duration} var(--hcv-enter) both;
    }
    ${active2} ${tip}[data-state="closed"] { animation: hcv-tip-out ${codexReference.tooltip.duration} var(--hcv-enter) both; }
    ${active2} ${toggle} {
      transition: background-color ${codexReference.switch.trackTime} linear ${codexReference.switch.trackDelay},
        border-color var(--hcv-enter-time) var(--hcv-ease);
    }
    ${active2} ${toggle} > ${thumb} {
      transition: translate ${codexReference.switch.thumbTime} var(--hcv-move),
        background-color var(--hcv-enter-time) var(--hcv-ease);
    }
    ${active2} ${items}::before {
      transition: opacity var(--hcv-exit-time) var(--hcv-ease),
        transform var(--hcv-enter-time) var(--hcv-enter);
    }
    ${popupButtons}, ${noticeDetails} {
      transition: background-color var(--hcv-enter-time) var(--hcv-ease),
        color var(--hcv-enter-time) var(--hcv-ease);
    }
    ${active2} ${items}:active:not([data-disabled])::before { transform: scale(var(--hcv-highlight-start-scale)); }
    ${active2} :is(${menus}, ${popover}) {
      transform-origin: var(--hcv-sidebar-menu-origin, var(--radix-dropdown-menu-content-transform-origin,
        var(--radix-context-menu-content-transform-origin,
        var(--radix-popover-content-transform-origin,
        var(--radix-select-content-transform-origin, center top)))));
    }
    ${active2} :is(${menus}, ${popover})[data-state="open"] {
      animation: hcv-menu-in var(--hcv-enter-time) var(--hcv-enter) both;
    }
    ${active2} :is(${menus}, ${popover})[data-state="closed"] {
      animation: hcv-menu-out var(--hcv-exit-time) var(--hcv-exit) both;
      pointer-events: none;
    }
    ${tabs}, ${paneAdd}, ${card} button, ${projectRow2}, ${projectRow2} button,
    ${messageRows}, ${cron} [data-panel-row], :is(${pages}, ${shown}) ${pageSearch},
    ${nav} button, ${sessions} > div > div > ul > li,
    ${pages} :is([data-catalog-card], [data-tour="artifact-card"], ${pageTabs} button) {
      transition: background-color var(--hcv-enter-time) var(--hcv-ease),
        color var(--hcv-enter-time) var(--hcv-ease),
        border-color var(--hcv-enter-time) var(--hcv-ease);
    }
  }
  @media (max-width: 760px) {
    ${shown} { padding: 16px 8px 8px; }
    ${shown} main { padding-block-start: 8px; }
    ${shown} [data-glass-raised] > div > .grid:has(> [data-tour="overlay-nav"]) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
    ${nav} { display: none; }
    ${nav} + div { display: flex; }
    ${sessions} > header:has(input) > :last-child { flex: 1 1 100%; }
    ${sessions} > header:has(input) > :last-child > div { max-inline-size: none; }
  }
  @media (any-hover: none) {
    ${projectRow2} [data-row-actions] button { opacity: 1; }
  }
  @keyframes hcv-menu-in {
    from { opacity: 0; transform: scale(var(--hcv-menu-start-scale)); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes hcv-menu-out {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(var(--hcv-menu-start-scale)); }
  }
  @keyframes hcv-tip-out {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(${codexReference.tooltip.exitScale}); }
  }
  @keyframes hcv-surface-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes hcv-surface-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }
}
`;
  document.head.append(sheet);
  ctx.onDispose(() => sheet.remove());
}

// source/settings.js
var groups = {
  "config:model": "model",
  "config:chat": "messages",
  "config:appearance": "palette",
  "config:workspace": "desktop",
  "config:safety": "lock",
  "config:browser": "web",
  "config:memory": "memory",
  "config:voice": "mic",
  "config:advanced": "wrench",
  vault: "shield",
  notifications: "bell",
  billing: "usage",
  providers: "bolt",
  gateway: "globe",
  connections: "globe",
  keybinds: "keyboard",
  keys: "keys",
  sessions: "archive",
  about: "info"
};
var nativeIcons = {
  archive: "archive",
  bell: "bell",
  box: "model",
  brain: "memory",
  "chart-bar": "usage",
  "circle-letter-a": "artifacts",
  cpu: "model",
  download: "download",
  "file-image": "artifacts",
  "file-text": "artifacts",
  "folder-open": "folderOpen",
  globe: "globe",
  keyboard: "keyboard",
  key: "keys",
  "key-round": "keys",
  lock: "lock",
  "message-circle": "messages",
  microphone: "mic",
  mic: "mic",
  monitor: "desktop",
  "device-desktop": "desktop",
  network: "globe",
  palette: "palette",
  paw: "paw",
  photo: "image",
  "settings-2": "sliders",
  "shield-lock": "shield",
  terminal: "terminal",
  "terminal-2": "terminal",
  tool: "wrench",
  trash: "trash",
  "trash-2": "trash",
  users: "team",
  "volume-2": "audio",
  wrench: "wrench",
  bolt: "bolt",
  zap: "bolt",
  "info-circle": "info"
};
function registerSettingsStyle(ctx, active2) {
  const settings = `${active2}[data-hcv-screen="settings"] [data-overlay-surface]`;
  const rail = `${settings} [data-tour="overlay-nav"]`;
  const compact = `${rail} + div button[aria-haspopup="menu"]`;
  const settingsMenu = `${active2}[data-hcv-screen="settings"] [data-slot="dropdown-menu-content"] [role="menuitem"]`;
  const main = `${settings} main`;
  const system = `${active2}[data-hcv-screen="command-center"] [data-overlay-surface] main`;
  const preferences = `:is(${main}, ${system})`;
  const crumbs = `${main} > nav:has(> [aria-current="page"])`;
  const control = ':is([data-slot="select-trigger"], [data-slot="searchable-select-trigger"], [data-slot="input"]:not([type="file"],[type="checkbox"],[type="range"],[type="color"]), [data-slot="textarea"])';
  const rowHost = '[class~="@container"]';
  const nativeRow = `${rowHost}:has(> .grid.py-3)`;
  const rowGroup = `${main} .grid:has(> ${rowHost} + ${rowHost}):not(:has(> :not(${rowHost})))`;
  const modes = `${main} [id="setting-field-gateway.connection-mode"] > .grid`;
  const mode = `${modes} > button`;
  const selectable = `${main} button.rounded-lg.border.transition-colors.text-left:not([data-slot], [id="setting-field-gateway.connection-mode"] *)`;
  const action = `${preferences} button[data-slot="button"]:is([data-variant="text"], [data-variant="textStrong"]):not([data-size="inline"])`;
  const inlineAction = `${preferences} button[data-size="inline"]:is([data-variant="text"], [data-variant="textStrong"])`;
  const link = `:is(${preferences}, ${active2}[data-hcv-screen="settings"] [data-slot="dialog-content"]) :is(a[href]:not([data-slot="button"]), [data-variant="link"])`;
  const operationRow = '.flex.items-center.justify-between.gap-3.py-2:has(> div.min-w-0 + button[data-variant="textStrong"])';
  const operation = `${system} section > ${operationRow}`;
  const toggle2 = `${main} [data-slot="switch"][role="switch"]`;
  const sheet = document.createElement("style");
  sheet.dataset.hcvSettings = "";
  sheet.textContent = `
@media (forced-colors: none) {
  ${settings} [data-glass-raised] > div > .grid:has(> main, > [data-tour="overlay-nav"]) {
    grid-template-columns: minmax(0, 224px) minmax(0, 1fr);
  }
  ${rail} {
    gap: 2px;
    padding: 16px 10px 12px;
    border-inline-end: 1px solid var(--hcv-hairline);
  }
  ${rail} button.row-hover {
    min-block-size: 32px;
    padding-inline: 8px;
    font-weight: 400;
    color: var(--hcv-muted);
  }
  ${rail} button.row-hover:not([aria-current="page"]) { background-color: transparent; }
  ${rail} button.row-hover[aria-current="page"] { background-color: var(--hcv-selected); color: var(--hcv-text); font-weight: 500; }
  ${rail} button.row-hover:has(+ button[aria-expanded="true"]):not([aria-current]) { color: var(--hcv-text); }
  ${rail} div[id] > button.row-hover { min-block-size: 30px; font-size: 12px; }
  ${rail} div[id] > button.row-hover > svg { inline-size: 14px; block-size: 14px; }
  ${rail} button[data-tour^="nav-toggle-"] { border-radius: 6px; }
  ${Object.entries(nativeIcons).map(([native, icon8]) => codexIconRules(
    `:is(${rail} button.row-hover, ${compact}, ${settingsMenu}) > svg.tabler-icon-${native}`,
    icon8
  )).join("")}
  ${codexIconRules(`:is(${rail} button.row-hover, ${compact}, ${settingsMenu}) > .codicon-account`, "person")}
  ${Object.entries(groups).map(([name, icon8]) => codexIconRules(`${rail} button[data-tour="nav-${name}"] > :is(svg, .codicon)`, icon8)).join("")}
  ${codexIconRules(`${rail} button[data-tour^="nav-toggle-"] > :is(svg, .codicon)`, "right")}
  ${codexIconRules(`${compact} > .codicon-chevron-down`, "down")}
  ${compact} { min-block-size: 30px; padding-inline: 8px; border-radius: 8px; }
  ${compact}:is(:hover, :focus-visible, [data-state="open"]) { background: var(--hcv-hover); }
  ${codexIconRules(`${rail} > div:last-child > button > svg.tabler-icon-download`, "download")}
  ${codexIconRules(`${rail} > div:last-child > button > svg.tabler-icon-upload`, "upload")}
  ${codexIconRules(`${rail} > div:last-child > button > svg.tabler-icon-refresh`, "refresh")}

  /* Personalization, 338923.5e5c677ceb.js: 768px including 20px side padding.
     ZEx5 in 100740.15f1098565.js: grouped rows inside a 16px frame. */
  ${preferences} {
    --hcv-settings-group: light-dark(#f7f7f7, #232323);
    --hcv-settings-group-stroke: color-mix(in srgb, var(--hcv-text) 8%, transparent);
    --hcv-settings-button: color-mix(in srgb, var(--hcv-text) 5%, transparent);
    font-family: var(--hcv-ui-font);
  }
  ${preferences} :is(div, section, fieldset, pre).rounded-md.border { border-radius: 8px; }
  ${preferences} :is(div, section, fieldset, pre).rounded-lg.border { border-radius: 10px; }
  ${preferences} :is(div, section, fieldset, pre).rounded-xl.border { border-radius: 12px; }
  ${preferences} :is(div, section, fieldset, pre).rounded-2xl.border { border-radius: 16px; }
  ${main} {
    max-inline-size: 768px;
    padding-block-start: 32px;
    padding-block-end: 0;
    --conversation-text-font-size: 14px;
    --conversation-caption-font-size: 12px;
    --conversation-caption-line-height: 18px;
  }
  ${main} > section > div.h-full {
    padding-inline: 20px;
    padding-block-end: 32px;
  }
  ${crumbs} {
    min-block-size: 30px;
    margin-block-end: 16px;
    padding-inline: 20px;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 12px;
    line-height: 18px;
  }
  ${crumbs} > [aria-current="page"] {
    flex-basis: 100%;
    font-size: 28px;
    font-weight: 500;
    line-height: 1.2;
    min-inline-size: 0;
  }
  ${crumbs} > button { font-size: 12px; }
  ${crumbs} > svg:has(+ [aria-current="page"]) { display: none; }
  ${codexIconRules(`${crumbs} > svg`, "right")}
  ${main} :is(h1, h2) { font-weight: 600; text-wrap: balance; }
  ${main} :is(p, label) { overflow-wrap: anywhere; }
  ${rowGroup}, ${modes} {
    gap: 0;
    min-inline-size: 0;
    border: 1px solid var(--hcv-settings-group-stroke);
    border-radius: 16px;
    background: var(--hcv-settings-group);
  }
  ${rowGroup} { padding-inline: clamp(8px, 2vw, 16px); }
  ${main} ${nativeRow} + ${nativeRow} { border-block-start: 1px solid var(--hcv-hairline); }
  ${main} ${nativeRow} > .grid { gap: 12px 24px; padding-block: 12px; }
  ${main} ${nativeRow} > .grid > div > div:first-child { font-weight: 500; }
  ${main} ${nativeRow} > .grid:has(> div:nth-child(2) > [role="switch"]:only-child) {
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: center;
  }
  @container (min-width: 672px) {
    ${main} ${nativeRow} > .grid:has(> div + div) {
      grid-template-columns: minmax(0, 1fr) minmax(0, max-content);
      align-items: center;
    }
    ${main} ${nativeRow} > .grid > div:nth-child(2) { max-inline-size: 244px; }
  }
  ${modes} { grid-template-columns: minmax(0, 1fr); grid-auto-rows: auto; }
  ${mode} {
    position: relative;
    padding: 12px 16px;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  ${mode}:first-child { border-start-start-radius: 15px; border-start-end-radius: 15px; }
  ${mode}:last-child { border-end-start-radius: 15px; border-end-end-radius: 15px; }
  ${mode} + button::before {
    content: '';
    position: absolute;
    inset: 0 16px auto;
    block-size: 1px;
    background: var(--hcv-hairline);
    pointer-events: none;
  }
  ${mode}.ring-2 { background-color: var(--hcv-hover-menu); }
  ${mode}:active:not(:disabled) { background-color: color-mix(in srgb, var(--hcv-text) 16%, transparent); }
  ${mode}:focus-visible { z-index: 1; }
  ${mode} > p { margin-block-start: 4px; }
  ${selectable} { border-color: var(--hcv-hairline); border-radius: 16px; box-shadow: none; }
  ${selectable}.ring-2 { border-color: var(--hcv-stroke); background-color: var(--hcv-hover-menu); }

  /* Button actions and inline documentation have different affordances. */
  ${action} {
    min-block-size: 28px;
    max-inline-size: 100%;
    padding: 4px 8px;
    border-radius: var(--hcv-popup-button-radius);
    background-color: var(--hcv-settings-button);
    color: var(--hcv-text);
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
    text-decoration: none;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  ${action}.text-destructive { color: var(--hcv-error); }
  ${action}:active:not(:disabled) { background-color: color-mix(in srgb, var(--hcv-text) 16%, transparent); }
  ${inlineAction}, ${link} { text-decoration: none; }
  ${link} { color: light-dark(#0169cc, #83c3ff); }
  ${link}:is(:hover, :focus-visible) { text-decoration: underline; }
  ${action}:focus-visible { box-shadow: none; }
  ${operation} {
    min-inline-size: 0;
    flex-wrap: wrap;
    padding: 12px 16px;
    border-inline: 1px solid var(--hcv-settings-group-stroke);
    background: var(--hcv-settings-group);
  }
  ${operation}:nth-child(1 of ${operationRow}) {
    border-block-start: 1px solid var(--hcv-settings-group-stroke);
    border-start-start-radius: 16px;
    border-start-end-radius: 16px;
  }
  ${operation} + ${operationRow} { border-block-start: 1px solid var(--hcv-hairline); }
  ${operation}:nth-last-child(1 of ${operationRow}) {
    border-block-end: 1px solid var(--hcv-settings-group-stroke);
    border-end-start-radius: 16px;
    border-end-end-radius: 16px;
  }

  /* Personalization uses the default F0xz switch (189497.6182e00931.js). */
  ${toggle2} {
    block-size: 20px;
    padding-inline: 2px;
    border: 0;
    background-color: color-mix(in srgb, var(--hcv-text) 10%, transparent);
  }
  ${toggle2}[data-state="checked"] { background-color: #339cff; }
  ${toggle2} > [data-slot="switch-thumb"] { inline-size: 16px; block-size: 16px; background-color: #fff; }
  ${toggle2}[data-state="checked"] > [data-slot="switch-thumb"] { translate: 12px 0; background-color: #fff; }
  ${toggle2}[data-state="checked"]:dir(rtl) > [data-slot="switch-thumb"] { translate: -12px 0; }

  ${main} ${control} {
    min-block-size: 32px;
    border: 1px solid var(--hcv-hairline);
    background: var(--hcv-form-surface);
    padding-inline: 10px;
    font-size: 13px;
    line-height: 18px;
    box-shadow: none;
  }
  ${main} ${control}:is(:focus, :focus-within, [data-state="open"]):not(:disabled, [aria-invalid="true"]) {
    border-color: color-mix(in srgb, var(--hcv-text) 50%, transparent);
  }
  ${main} ${control}[aria-invalid="true"] { border-color: var(--hcv-error); }
  ${main} textarea[data-slot="textarea"] { padding-block: 8px; }
  ${main} [data-slot="select-trigger"] > [data-slot="select-value"] {
    min-inline-size: 0;
    text-overflow: ellipsis;
  }
  ${main} button[data-slot="button"]:not([data-size="inline"]) {
    border-radius: var(--hcv-popup-button-radius);
  }
  ${main} button[data-size="sm"]:is([data-variant="default"], [data-variant="outline"], [data-variant="secondary"]) {
    min-block-size: 28px;
  }
  ${main} button:is([data-variant="outline"], [data-variant="secondary"]):not(:disabled) {
    border-color: var(--hcv-hairline);
  }
  ${settings} button[data-glass-opaque] { font-family: var(--hcv-ui-font); }
  ${settings} button[data-glass-opaque]:has(> [data-slot="kbd-group"]) {
    padding-inline: 10px;
    border-radius: 8px;
    border-color: var(--hcv-hairline);
    background-color: var(--hcv-menu);
    color: var(--hcv-muted);
  }
  ${codexIconRules(`${settings} button[data-glass-opaque] > svg.tabler-icon-search`, "search")}

  @media (hover: hover) and (pointer: fine) {
    ${main} ${control}:hover:not(:disabled, :focus, :focus-within, [data-state="open"], [aria-invalid="true"]) { border-color: var(--hcv-stroke); }
    ${mode}:hover:not(:disabled, .ring-2, :active),
    ${action}:hover:not(:disabled, :active) { background-color: var(--hcv-hover-menu); }
    ${rail} button.row-hover:not([aria-current]):hover { background: var(--hcv-hover); color: var(--hcv-text); }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${preferences} :is(button:not([role="switch"]), ${control}) {
      transition: color var(--hcv-enter-time) var(--hcv-ease), background-color var(--hcv-enter-time) var(--hcv-ease),
        border-color var(--hcv-enter-time) var(--hcv-ease), box-shadow var(--hcv-enter-time) var(--hcv-ease);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    ${preferences} :is(button:not([role="switch"]), ${control}) { transition: none; }
  }
  @media (max-width: 760px) {
    ${settings} [data-glass-raised] > div > .grid:has(> [data-tour="overlay-nav"]) {
      grid-template-columns: minmax(0, 1fr);
    }
    ${main} { padding-block-start: 6px; }
    ${main} > section > div.h-full { padding-inline: 16px; }
    ${crumbs} { padding-inline: 16px; margin-block-end: 8px; }
    ${crumbs} > [aria-current="page"] { font-size: 24px; line-height: 28px; }
  }
}
@media (forced-colors: active) {
  ${preferences} :is(button, a[href], input, textarea, select):focus-visible {
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }
}
`;
  document.head.append(sheet);
  ctx.onDispose(() => sheet.remove());
}

// source/remaining-surfaces.js
function registerRemainingSurfaces(ctx, active2) {
  const directory = `${active2} [data-slot="connectors-directory"]`;
  const connector = `${directory} [data-slot="connector-row-card"]`;
  const connectorDialog = `${active2}[data-hcv-screen="capabilities"] [data-slot="dialog-content"]`;
  const connectorTools = `${active2} :is([data-slot="tools-list"], [data-slot="tools-summary"])`;
  const overlays2 = `${active2} [data-overlay-surface]`;
  const panelRows = `${overlays2} [data-panel-row]`;
  const cap = `${active2}[data-hcv-screen="capabilities"] section.h-full.min-w-0.overflow-hidden`;
  const scopeRow = `${cap} div:has(> span + button[data-slot="select-trigger"] > [data-slot="select-value"])`;
  const filterRow = "button.row-hover[aria-pressed]";
  const filters = `${cap} [data-catalog] [data-tour="overlay-nav"] > ${filterRow}`;
  const catalogCard = `${cap} [data-catalog] [data-catalog-card]`;
  const dialog2 = `${active2} [data-slot="dialog-content"]`;
  const profiles = `${active2}[data-hcv-screen="profiles"] [data-overlay-surface]`;
  const profileRows = `${profiles} [data-panel-row]`;
  const selectedProfile = `${profileRows}[class~="bg-(--ui-row-active-background)"]`;
  const profileSearch = `${profiles} div.mb-1.w-full.shrink-0:has(> svg.tabler-icon-search + input[type="text"][placeholder])`;
  const profileEditor = `${profiles} section > .min-h-48:has(> div > div > .cm-editor)`;
  const proseFrame = `.flex.h-full.min-h-0.flex-col.overflow-hidden.border:has(> div > .cm-editor)`;
  const framedEditor = `:is(${profileEditor} > ${proseFrame}, ${dialog2}.max-w-2xl > .h-80 > ${proseFrame})`;
  const segmented = `:is(${overlays2}, ${dialog2}) .inline-grid.auto-cols-fr.grid-flow-col:has(> button[aria-pressed])`;
  const segmentedButton = `${segmented} > button[aria-pressed]`;
  const webhookAlert = `${active2}[data-hcv-screen="webhooks"] [data-glass-raised] > div > [data-slot="alert"]`;
  const botRows = `${active2} :is(button[data-roster-key], [data-slot="bots-section"] button[draggable="true"][data-slot="row-button"])`;
  const botPane = `${active2} [data-hcv-sidebar-shell]:has(> [data-panel-header] [data-tree-tab="hermes-bots:pane"][aria-selected="true"]) > .relative.flex-1 > .absolute.inset-0:not([data-pane-hidden]) > .h-full.flex-col`;
  const botLoading = `${botPane} > div:has(> [role="status"] > .glyph-spinner)`;
  const terminalRail = `${active2}:has([data-hcv-sidebar-shell] [data-tree-tab="terminal"][aria-selected="true"]) [data-pane-host="terminal"] [data-suppress-pane-reveal] > [role="tablist"]`;
  const sheet = document.createElement("style");
  sheet.dataset.hcvRemainingSurfaces = "";
  sheet.textContent = `
@media (forced-colors: none) {
  ${directory} {
    container-type: inline-size;
    gap: 12px;
    padding: 8px 4px 0;
    font-family: var(--hcv-ui-font);
  }
  ${directory} > div:has(> h2) { gap: 12px; flex-wrap: wrap; }
  ${directory} > div > h2 {
    margin: 0;
    color: var(--hcv-text);
    font-size: 22px;
    font-weight: 600;
    line-height: 28px;
    letter-spacing: -.012em;
  }
  ${directory} > div:has(> h2) > button { min-block-size: 30px; padding-inline: 12px; border-radius: 8px; }
  ${directory} div:has(> svg.tabler-icon-search + input[placeholder]) {
    max-inline-size: 480px;
    flex: 1 1 320px;
  }
  ${directory} section > header h3 {
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
  }
  ${directory} section > .grid:has(> [data-slot="connector-row-card"]) { gap: 8px; }
  ${connector} {
    min-block-size: 66px;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 12px;
    background: var(--hcv-form-surface);
    color: var(--hcv-text);
  }
  ${connector}[data-state="open"], ${connector}:has(button[aria-expanded="true"]) { background: var(--hcv-selected); }
  ${connector} > div:first-child { border-radius: 8px; }
  ${connector} button::after { border-radius: 12px; }
  ${connector} button:has(> .sr-only) { font-size: 14px; font-weight: 500; line-height: 20px; }
  ${connector} > div:last-child { inline-size: auto; min-inline-size: 72px; }
  ${connector} > div:last-child button:not([role="switch"]) { min-block-size: 26px; padding-inline: 8px; border-radius: 7px; }
  ${connector} p { font-size: 12px; line-height: 17px; }
  ${connector}:focus-within { border-color: var(--hcv-focus); }
  ${cap} :is([data-slot="compact-select-value"], [data-slot="select-value"]) { font-size: 13px; }
  ${cap} :is([data-slot="select-trigger"], button[data-variant="outline"]) {
    border-color: var(--hcv-hairline);
    background: var(--hcv-form-surface);
  }
  ${scopeRow} { flex-wrap: wrap; gap: 6px 8px; padding: 6px 12px; }
  ${scopeRow} > button[data-slot="select-trigger"] {
    inline-size: max-content;
    max-inline-size: min(100%, 420px);
    min-inline-size: 0;
    min-block-size: 28px;
    padding: 0 8px;
    border-radius: 8px;
  }
  ${scopeRow} > button > [data-slot="select-value"] {
    display: block;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  ${scopeRow} > button > .codicon-chevron-down { flex: none; inline-size: 14px; block-size: 14px; }
  ${codexIconRules(`${scopeRow} > button > .codicon-chevron-down`, "down")}
  ${filters} { min-block-size: 26px; block-size: 26px; padding: 3px 6px; border-radius: 7px; }
  ${filters} + ${filterRow} { margin-block-start: var(--hcv-unit); }
  ${catalogCard} > div { padding-inline: 10px; }
  ${catalogCard} button[aria-haspopup="dialog"]:focus-visible::after {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -3px;
  }
  ${connectorDialog} [data-slot="add-server-form"] { gap: 16px; }
  ${connectorDialog} [data-slot="add-server-form"] label > span { font-size: 13px; line-height: 18px; }
  ${connectorTools} [data-slot="tool-row"] {
    border-radius: 8px;
    font-family: var(--hcv-ui-font);
  }
  ${connectorTools} [data-slot="tools-dirty-footer"] { border-color: var(--hcv-hairline); }

  /* Shared panel shell used by Hermes profiles, agents, webhooks, starmap,
     session import, and contributed panels. None of their actions are replaced. */
  ${overlays2} header:has(> div > h2) > div > h2 {
    font-size: 20px;
    line-height: 26px;
    font-weight: 600;
  }
  ${panelRows} {
    min-block-size: 32px;
    border-radius: 8px;
    font-size: 13px;
  }
  ${panelRows} > button:first-child { min-block-size: inherit; padding-inline: 8px; }
  ${panelRows} :is(button, a):focus-visible { outline: 1px solid var(--hcv-focus); outline-offset: -1px; }
  ${profiles} { font-family: var(--hcv-ui-font); }
  ${profiles} header h3 { font-size: 16px; line-height: 22px; font-weight: 600; overflow-wrap: anywhere; }
  ${profiles} :is(header > div > p.font-mono, dl) { font-size: 12px; line-height: 18px; }
  ${profiles} :is(header > div > p.font-mono, dl dt) { color: var(--hcv-muted); }
  ${profileSearch} {
    min-block-size: 36px;
    padding-inline: 12px;
    border: 0;
    border-radius: 999px;
    background: var(--hcv-hover);
  }
  ${profileSearch}:has(> input:focus-visible) { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${profileSearch} > input:focus-visible { outline: none; }
  ${profileRows} { min-block-size: 30px; border-radius: 10px; }
  ${profileRows} > button[data-slot="row-button"] { border-radius: inherit; }
  ${profileRows} button[aria-haspopup="menu"] {
    inline-size: 24px;
    block-size: 24px;
    border-radius: 8px;
  }
  ${selectedProfile} { background: var(--hcv-selected); }
  ${profiles} button[data-slot="button"][data-size="sm"] { min-block-size: 28px; border-radius: 10px; }

  /* AGENTS.md in Codex settings is a 320px scrollable prose editor.
     The framed native CodeMirror keeps its buffer, shortcuts and wrapping. */
  ${profileEditor} { block-size: clamp(128px, 45vh, 320px); min-block-size: 0; }
  ${profileEditor} > div { min-inline-size: 0; }
  ${profiles} section:has(> .min-h-48) > div:first-child > div > div:first-child {
    color: var(--hcv-text);
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    letter-spacing: normal;
    text-transform: none;
  }
  ${framedEditor} {
    border-radius: 10px;
    border-color: var(--hcv-hairline);
    background-color: var(--hcv-form-surface);
  }
  ${framedEditor}:focus-within { border-color: var(--hcv-focus); }
  ${framedEditor} > div { padding: 8px 12px; }
  ${framedEditor} .cm-editor.cm-focused { outline: none; }
  ${framedEditor} :is(.cm-content, .cm-line, .cm-scroller),
  ${dialog2} #new-profile-soul {
    font-family: var(--hcv-ui-font);
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
  }
  ${framedEditor} .cm-line { padding-block: 2px; }
  @media (max-width: 760px), (max-height: 720px) {
    ${profileEditor} { block-size: clamp(128px, 30vh, 320px); }
    ${dialog2}.max-w-2xl > .h-80:has(> div > div > .cm-editor) { block-size: min(320px, 50vh); }
  }
  ${segmented} { padding: 2px; gap: 2px; max-inline-size: 100%; border-radius: 10px; background: var(--hcv-hover); }
  ${segmentedButton} {
    min-block-size: 26px;
    min-inline-size: 0;
    padding-inline: 8px;
    border-radius: 8px;
    font: 500 13px/18px var(--hcv-ui-font);
    box-shadow: none;
  }
  ${segmentedButton}[aria-pressed="true"] { background-color: var(--hcv-menu); }
  ${webhookAlert} { border-radius: 12px; }
  ${webhookAlert}:first-child { margin-block-start: 24px; }
  ${botRows} { border-radius: 8px; font-family: var(--hcv-ui-font); }
  ${botRows}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${botPane} { min-block-size: 0; background: var(--hcv-sidebar); }
  ${botPane} > :first-child {
    flex: none;
    min-block-size: 40px;
    padding: 6px 12px;
  }
  ${botPane} > :first-child > span:first-child {
    color: var(--hcv-muted);
    font: 600 13px/18px var(--hcv-ui-font);
    letter-spacing: normal;
    text-transform: none;
  }
  ${botPane} > [data-slot="bots-roster"] > div { padding-inline: 8px; }
  ${botLoading} {
    flex: none;
    min-block-size: 32px;
    justify-content: flex-start;
    gap: 8px;
    padding-inline: 12px;
    color: var(--hcv-muted);
    font: 400 12px/18px var(--hcv-ui-font);
  }
  ${botLoading}::after { content: 'Loading bots\u2026'; }
  ${botLoading}:lang(ru)::after { content: '\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0431\u043E\u0442\u043E\u0432\u2026'; }
  ${terminalRail} { padding-block-start: 6px; }
  ${dialog2} :is([data-slot="input"], [data-slot="textarea"], [data-slot="select-trigger"]) {
    border-color: var(--hcv-hairline);
    background: var(--hcv-form-surface);
  }
  ${dialog2} :is([data-slot="input"], [data-slot="select-trigger"]):not([type="file"]) { min-block-size: 32px; }
  ${dialog2} button:is([data-variant="outline"], [data-variant="secondary"]) { border-color: var(--hcv-hairline); }

  ${codexIconRules(`${directory} svg.tabler-icon-rosette-discount-check`, "verified")}
  ${codexIconRules(`${overlays2} .codicon-add`, "plus")}
  ${codexIconRules(`${overlays2} .codicon-kebab-vertical`, "more")}
  ${codexIconRules(`${overlays2} .codicon-hubot`, "bots")}
  ${codexIconRules(`${overlays2} .codicon-account`, "person")}
  ${codexIconRules(`${overlays2} .codicon-link`, "link")}
  ${codexIconRules(`${overlays2} .codicon-comment-discussion`, "hud")}
  ${codexIconRules(`${overlays2} .codicon-edit`, "edit")}
  ${codexIconRules(`${overlays2} .codicon-trash`, "trash")}
  ${codexIconRules(`${overlays2} .codicon-refresh`, "refresh")}
  ${codexIconRules(`${dialog2} :is(.codicon-close, button[data-slot="dialog-close-button"] > svg.tabler-icon-x)`, "close")}
  ${codexIconRules(`${active2} button[aria-haspopup="menu"] > .codicon-add`, "plus")}

  @container (max-width: 680px) {
    ${directory} section > .grid:has(> [data-slot="connector-row-card"]) { grid-template-columns: minmax(0, 1fr); }
  }
  @media (hover: hover) and (pointer: fine) {
    ${catalogCard}:hover {
      border-color: var(--hcv-hairline);
      background: color-mix(in srgb, var(--hcv-form-surface) 76%, var(--hcv-hover));
      box-shadow: none;
    }
    ${connector}:hover { background: var(--hcv-hover); border-color: var(--hcv-stroke); }
    ${connectorTools} [data-slot="tool-row"]:hover { background: var(--hcv-hover); }
    ${panelRows}:hover { background: var(--hcv-hover); }
    ${selectedProfile}:hover { background: var(--hcv-selected); }
    ${segmentedButton}[aria-pressed="false"]:hover:not(:disabled) { background: var(--hcv-hover-menu); }
    ${botRows}:hover { background: var(--hcv-hover); }
  }
  @media (prefers-reduced-motion: no-preference) {
    ${connector}, ${connectorTools} [data-slot="tool-row"], ${panelRows}, ${botRows} {
      transition: background-color var(--hcv-enter-time) var(--hcv-ease), border-color var(--hcv-enter-time) var(--hcv-ease);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    ${profileSearch}, ${profileRows} button, ${segmentedButton} { transition: none; }
  }
}
@media (forced-colors: active) {
  ${selectedProfile}, ${segmentedButton}[aria-pressed="true"] { outline: 1px solid Highlight; outline-offset: -1px; }
  ${profiles} :is(button, input):focus-visible,
  ${segmentedButton}:focus-visible { outline: 2px solid Highlight; outline-offset: -2px; }
}
`;
  document.head.append(sheet);
  ctx.onDispose(() => sheet.remove());
}

// source/shell-surfaces.js
function registerShellSurfaces(ctx, active2) {
  const panel2 = `${active2} aside[class~="before:pointer-events-none"][class~="pt-(--titlebar-height)"]`;
  const overlay = `${active2} :is([data-narrow-overlay="files"], [data-narrow-overlay="review"])`;
  const panelEntrance = `:is(${panel2}:not([data-narrow-overlay] *), ${overlay})`;
  const header = `${panel2} [class~="group/project-header"]`;
  const label = `${panel2} span:has(> .dither[aria-hidden="true"])`;
  const empty = `${panel2} > div:has(> button > .codicon-folder-opened)`;
  const openFolder = `${empty} > button`;
  const rows = `${panel2} :is([data-project-tree] [class~="group/row"], [class~="group/review-row"])`;
  const panelActions = `${panel2} :is([class~="group/project-header"], [class~="group/review-row"], [data-suppress-pane-reveal-side]) button[data-size="icon-xs"]`;
  const previewToolbar = `${active2} .flex.h-full.flex-col.overflow-hidden.bg-transparent > .flex.h-7.shrink-0.items-center.justify-end.gap-3:has(> button.underline-offset-4, > div > button > :is(svg.tabler-icon-pencil, svg.tabler-icon-x))`;
  const previewActions = `:is(${previewToolbar} > button, ${previewToolbar} > div > button)`;
  const footer = `${active2} [data-slot="statusbar"]`;
  const statusActions = `:is(${footer} > div > :is(button, a[href]), ${footer} [data-slot="connection-switcher"] button[aria-haspopup="menu"])`;
  const profiles = `${active2} [data-slot="profile-rail"]`;
  const gateway = `${active2} [data-slot="dropdown-menu-content"]:has(> .text-sm > div > div > button > svg.tabler-icon-power)`;
  const gatewayTools = `${gateway} > .text-sm > .flex:first-child > div > button`;
  const layouts = `${active2} div[class~="w-[26rem]"][class~="z-50"]:has(> header h2):has(> div > div > section .grid-cols-4)`;
  const layoutCards = `${layouts} section :is(.grid > button[aria-pressed], [class~="group/preset"] > button:first-child)`;
  const layoutHandles = `${active2} [data-tree-group] > .cursor-grab.outline-dashed > span:has(> .codicon-gripper)`;
  const sheet = document.createElement("style");
  sheet.dataset.hcvShellSurfaces = "";
  sheet.textContent = `
@media (forced-colors: none) {
  ${panel2} {
    background-color: var(--hcv-sidebar);
    border-color: var(--hcv-hairline);
    box-shadow: none;
    font-family: var(--hcv-ui-font);
  }
  ${panel2}.border-l { border-start-end-radius: 12px; }
  ${panel2}.border-r { border-start-start-radius: 12px; }
  ${overlay}.right-0 { border-start-start-radius: 12px; border-end-start-radius: 12px; }
  ${overlay}.left-0 { border-start-end-radius: 12px; border-end-end-radius: 12px; }
  ${header} { block-size: 32px; gap: 2px; padding-inline: 12px 6px; }
  ${label} {
    gap: 6px;
    padding-inline-start: 0;
    color: var(--hcv-muted);
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    letter-spacing: normal;
    text-transform: none;
  }
  ${label} > .dither { display: none; }
  ${label} > span.leading-none { line-height: inherit; }
  ${empty} { gap: 10px; }
  ${empty} > span:has(> .dither) { font-size: 13px; }
  ${empty} > span > span.truncate { white-space: normal; }
  ${openFolder} {
    block-size: auto;
    min-block-size: 30px;
    max-inline-size: 100%;
    padding: 5px 12px;
    gap: 6px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 999px;
    background: var(--hcv-form-surface);
    color: var(--hcv-text);
    font-size: 12px;
    line-height: 16px;
    white-space: normal;
  }
  ${openFolder} > .codicon-folder-opened { flex: none; inline-size: 16px; block-size: 16px; }
  ${codexIconRules(`${openFolder} > .codicon-folder-opened`, "folderOpen")}
  ${rows} {
    margin-inline: 6px;
    border-radius: 8px;
    font-size: 12px;
  }
  ${rows}[aria-selected="true"] { background-color: var(--hcv-selected); color: var(--hcv-text); }
  ${panelActions} { border-radius: 7px; }
  ${codexIconRules(`${panel2} [data-project-tree] .codicon-folder`, "folder")}
  ${codexIconRules(`${panel2} [data-project-tree] .codicon-folder-opened`, "folderOpen")}

  ${previewToolbar} {
    block-size: auto;
    min-block-size: 32px;
    flex-wrap: wrap;
    padding: 3px 8px;
    gap: 2px;
    border-color: var(--hcv-hairline);
    font-family: var(--hcv-ui-font);
  }
  ${previewActions} {
    min-block-size: 24px;
    padding: 3px 7px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 500;
    line-height: 16px;
  }
  ${previewToolbar} > button.underline {
    background-color: var(--hcv-selected);
    color: var(--hcv-text);
    text-decoration: none;
  }
  ${codexIconRules(`${previewActions} > svg.tabler-icon-pencil`, "edit")}

  ${footer} {
    block-size: 26px;
    padding: 2px 6px;
    font-family: var(--hcv-ui-font);
  }
  ${statusActions} {
    border-radius: 7px;
    font-size: 11px;
    line-height: 16px;
  }
  ${statusActions}:is([aria-expanded="true"], [aria-pressed="true"], [data-state="open"]) {
    background-color: var(--hcv-selected);
    color: var(--hcv-text);
  }
  ${profiles} { font-family: var(--hcv-ui-font); }
  ${profiles} button { border-radius: 7px; }
  ${gateway} > .text-sm { font-family: var(--hcv-ui-font); }
  ${gateway} > .text-sm > .flex:first-child { padding: 10px 12px; gap: 8px; }
  ${gateway} > .text-sm > .flex:first-child > div:first-child { gap: 4px; font-size: 12px; line-height: 15px; }
  ${gateway} [class~="text-[0.62rem]"] {
    font-size: 11px;
    line-height: 16px;
    font-weight: 500;
    letter-spacing: normal;
    text-transform: none;
  }
  ${gatewayTools} { inline-size: 24px; block-size: 24px; border-radius: 7px; }
  ${codexIconRules(`${gatewayTools} > svg.tabler-icon-refresh:not(.animate-spin)`, "refresh")}
  ${codexIconRules(`${gatewayTools} > svg.tabler-icon-layout-dashboard`, "system")}

  ${layouts} {
    border-color: var(--hcv-hairline);
    border-radius: 16px;
    background: var(--hcv-menu);
    box-shadow: var(--hcv-menu-shadow);
    font-family: var(--hcv-ui-font);
  }
  ${layouts} > header h2 { font-size: 15px; line-height: 20px; }
  ${layouts} > header button, ${layouts} section button { border-radius: 8px; }
  ${layouts} section > span {
    font-size: 12px;
    font-weight: 500;
    letter-spacing: normal;
    text-transform: none;
  }
  ${layoutCards} { border-radius: var(--hcv-popup-button-radius); }
  ${layoutCards} > span { font-size: 11px; line-height: 15px; }
  ${layoutHandles} {
    gap: 6px;
    padding: 4px 10px;
    border-color: var(--hcv-hairline);
    border-radius: 999px;
    background: var(--hcv-menu);
    font: 500 12px/16px var(--hcv-ui-font);
    letter-spacing: normal;
    text-transform: none;
  }

  :is(${openFolder}, ${panelActions}, ${previewActions}, ${statusActions}, ${profiles} button, ${gatewayTools}, ${layouts} button):focus-visible {
    outline: 2px solid var(--hcv-focus);
    outline-offset: -2px;
  }
}
@media (forced-colors: none) and (hover: hover) {
  :is(${openFolder}, ${panelActions}, ${previewActions}:not(.bg-primary), ${statusActions}, ${gatewayTools}):hover:not(:disabled, [aria-disabled="true"]) {
    background-color: var(--hcv-hover-menu);
  }
  ${gatewayTools}:has(> svg.tabler-icon-power):hover { color: var(--destructive); }
  ${rows}:hover:not([aria-selected="true"]) { background-color: var(--hcv-hover); }
}
@media (forced-colors: none) and (prefers-reduced-motion: no-preference) {
  ${panelEntrance} {
    opacity: 1;
    translate: 0 0;
    transition: opacity ${codexReference.summaryTime} var(--hcv-enter), translate ${codexReference.summaryTime} var(--hcv-enter);
  }
  :is(${panel2}.border-r, ${overlay}.left-0) { --hcv-pane-enter-x: -8px; }
  ${layouts} {
    opacity: 1;
    scale: 1;
    transition: opacity var(--hcv-enter-time) var(--hcv-enter), scale var(--hcv-enter-time) var(--hcv-enter);
  }
  @starting-style {
    ${panelEntrance} { opacity: .2; translate: var(--hcv-pane-enter-x, 8px) 0; }
    ${layouts} { opacity: 0; scale: .98; }
  }
  :is(${openFolder}, ${statusActions}, ${gatewayTools}) {
    transition: background-color var(--hcv-enter-time) var(--hcv-ease), color var(--hcv-enter-time) var(--hcv-ease);
  }
}
`;
  document.head.append(sheet);
  ctx.onDispose(() => sheet.remove());
}

// source/session-tabs.js
import { createElement as h11, useRef as useRef7, useState as useState9 } from "react";
import {
  atom as atom5,
  Button as Button3,
  Dialog as Dialog3,
  DialogContent as DialogContent3,
  DialogDescription as DialogDescription3,
  DialogFooter as DialogFooter3,
  DialogHeader as DialogHeader3,
  DialogTitle as DialogTitle3,
  host as host14,
  Input as Input2,
  TITLEBAR_AREAS as TITLEBAR_AREAS5,
  useValue as useValue6
} from "@hermes/plugin-sdk";
var tilePrefix = "session-tile:";
var workspaceTab = '[role="tab"][data-tree-tab="workspace"]';
var chatTab = `${workspaceTab}, [role="tab"][data-tree-tab^="${tilePrefix}"]`;
var labelSelector = ".pane-tab-content .truncate";
var draftLabels = /* @__PURE__ */ new Set(["New session", "Untitled session", "\u041D\u043E\u0432\u0430\u044F \u0441\u0435\u0441\u0441\u0438\u044F", "\u0421\u0435\u0430\u043D\u0441 \u0431\u0435\u0437 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F"]);
var copy5 = {
  ru: {
    fresh: "\u041D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442",
    title: "\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u0447\u0430\u0442",
    hint: "\u041A\u0440\u0430\u0442\u043A\u043E \u0438 \u0443\u0437\u043D\u0430\u0432\u0430\u0435\u043C\u043E",
    input: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0447\u0430\u0442\u0430",
    placeholder: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435\u2026",
    cancel: "\u041E\u0442\u043C\u0435\u043D\u0430",
    save: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C",
    failed: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437."
  },
  en: {
    fresh: "New chat",
    title: "Rename chat",
    hint: "Keep it short and recognizable",
    input: "Chat title",
    placeholder: "Add a title\u2026",
    cancel: "Cancel",
    save: "Save",
    failed: "Couldn\u2019t save the chat title. Try again."
  }
};
function tabSession(tab) {
  for (const dot of tab.querySelectorAll(".pane-tab-content span.rounded-full")) {
    for (let node2 = committedFiber(dot); node2; node2 = node2.return) {
      const props = node2.memoizedProps;
      if (props?.["data-tree-tab"]) break;
      if (props && "storedSessionId" in props && "session" in props) return props;
    }
  }
  return null;
}
function tabId(tab) {
  const pane = tab.dataset.treeTab;
  if (pane.startsWith(tilePrefix)) return pane.slice(tilePrefix.length);
  const session = tabSession(tab);
  if (session) return session.storedSessionId || null;
  for (let node2 = committedFiber(tab); node2; node2 = node2.return) {
    const props = node2.memoizedProps;
    if (props?.tabPaneId === "workspace" && props.storedSessionId) return props.storedSessionId;
  }
  return null;
}
function draftSubmit(tab) {
  const group = tab.closest("[data-tree-group]");
  const input = group?.querySelector('[data-chat-surface][data-composer-target="main"] [data-slot="composer-rich-input"]');
  for (let node2 = committedFiber(input); node2; node2 = node2.return) {
    const props = node2.memoizedProps;
    if (typeof props?.onSubmit === "function" && "busy" in props && "cwd" in props) return props.onSubmit;
  }
  return null;
}
function RenameForm({ target, close, save }) {
  const { words: words3 } = target;
  const [value, setValue] = useState9(target.title);
  const [saving, setSaving] = useState9(false);
  const [error, setError] = useState9(false);
  const input = useRef7(null);
  const pending = useRef7(false);
  const title = value.trim();
  const submit = async (event) => {
    event.preventDefault();
    if (!title || pending.current) return;
    if (title === target.title) return close();
    pending.current = true;
    setSaving(true);
    setError(false);
    try {
      await save(target, title);
      close();
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return h11(
    Dialog3,
    { open: true, onOpenChange: (open) => {
      if (!open && !pending.current) close();
    } },
    h11(
      DialogContent3,
      {
        "data-hcv-rename-chat": "",
        bodyClassName: "hcv-rename-body",
        blurBackdrop: false,
        overlayClassName: "hcv-rename-overlay",
        showCloseButton: !saving,
        onOpenAutoFocus: (event) => {
          event.preventDefault();
          input.current?.focus();
          input.current?.select();
        },
        onCloseAutoFocus: (event) => {
          event.preventDefault();
          if (target.tab.isConnected) target.tab.focus({ preventScroll: true });
        }
      },
      h11(
        "form",
        { onSubmit: submit },
        h11(DialogHeader3, null, h11(DialogTitle3, null, words3.title), h11(DialogDescription3, null, words3.hint)),
        h11(Input2, {
          ref: input,
          "aria-label": words3.input,
          placeholder: words3.placeholder,
          value,
          disabled: saving,
          onChange: (event) => setValue(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
          }
        }),
        error && h11("p", { role: "alert", className: "hcv-rename-error" }, words3.failed),
        h11(
          DialogFooter3,
          null,
          h11(Button3, { type: "button", variant: "outline", disabled: saving, onClick: close }, words3.cancel),
          h11(Button3, { type: "submit", disabled: saving || !title }, words3.save)
        )
      )
    )
  );
}
function RenameSlot({ model, close, save }) {
  const target = useValue6(model);
  return target && h11(RenameForm, { key: target.key, target, close, save });
}
function renameStyles(active2) {
  const dialog2 = `${active2} [data-hcv-rename-chat]`;
  const close = `${dialog2} [data-slot="dialog-close-button"]`;
  return `
@media (forced-colors: none) {
  ${active2} .hcv-rename-overlay { background: rgb(0 0 0 / 25%); backdrop-filter: none; }
  ${dialog2} {
    inline-size: min(420px, calc(100vw - 32px));
    max-inline-size: none;
    border: 0;
    border-radius: 16px;
    background: var(--hcv-menu);
    color: var(--hcv-text);
    font-family: var(--hcv-ui-font);
  }
  ${dialog2} .hcv-rename-body { padding: 20px; }
  ${dialog2} form { display: flex; flex-direction: column; gap: 12px; }
  ${dialog2} [data-slot="dialog-header"] { gap: 4px; padding-inline-end: 24px; text-align: start; }
  ${dialog2} [data-slot="dialog-title"] { font-size: 20px; font-weight: 600; line-height: 26px; }
  ${dialog2} [data-slot="dialog-description"] { color: var(--hcv-muted); font-size: 14px; line-height: 20px; }
  ${dialog2} input[data-slot="input"] {
    block-size: 36px;
    padding: 0 10px;
    border: 1px solid var(--hcv-hairline);
    border-radius: 8px;
    background: transparent;
    color: var(--hcv-text);
    box-shadow: none;
    font: 13px/18px var(--hcv-ui-font);
  }
  ${dialog2} input[data-slot="input"]:focus {
    border-color: #339cffb3;
    outline: none;
    box-shadow: none;
  }
  ${dialog2} input[data-slot="input"]::selection {
    background: light-dark(#c3ddf0, #42586a);
    color: var(--hcv-text);
  }
  ${dialog2} [data-slot="dialog-footer"] { flex-flow: row wrap; justify-content: flex-end; gap: 12px; }
  ${dialog2} [data-slot="dialog-footer"] button {
    min-block-size: 32px;
    block-size: auto;
    padding: 5px 16px;
    border-radius: 10px;
    font: 400 14px/20px var(--hcv-ui-font);
  }
  ${dialog2} button[type="submit"] { background: var(--hcv-action); color: var(--hcv-ink); }
  ${dialog2} button[data-variant="outline"] {
    border: 1px solid var(--hcv-hairline);
    background: color-mix(in srgb, var(--hcv-text) 4%, var(--hcv-menu));
    color: var(--hcv-text);
  }
  ${close} { inset-block-start: 16px; inset-inline-end: 16px; inline-size: 24px; block-size: 24px; border-radius: 8px; }
  ${codexIconRules(`${close} > svg`, "close")}
  ${dialog2} .hcv-rename-error { margin: 0; color: var(--dt-destructive); font-size: 13px; }
}
`;
}
function registerSessionTabs(ctx, active2) {
  const root = document.documentElement;
  const model = atom5(null);
  const translated = /* @__PURE__ */ new Map();
  const named = /* @__PURE__ */ new Map();
  const sessions = new BroadcastChannel("hermes:sessions");
  let requestKey = 0;
  let frame = 0;
  let disposed = false;
  const words3 = () => root.matches(":lang(ru)") ? copy5.ru : copy5.en;
  const close = () => model.set(null);
  const enabled = () => !disposed && root.matches(active2);
  const restore = (text, entry) => {
    if (text.data === entry.shown) text.data = entry.original;
    if (entry.label.title === entry.shown) entry.label.title = entry.tooltip;
    translated.delete(text);
  };
  const labels10 = () => {
    frame = 0;
    for (const [text, entry] of translated) {
      if (!enabled() || !text.isConnected || text.data !== entry.shown) restore(text, entry);
    }
    if (!enabled()) return;
    const openIds = /* @__PURE__ */ new Set();
    for (const tab of document.querySelectorAll(chatTab)) {
      const id2 = tabId(tab);
      openIds.add(id2);
      const label = tab.querySelector(labelSelector);
      const text = label?.childNodes.length === 1 ? label.firstChild : null;
      if (!(text instanceof Text)) continue;
      const row2 = tabSession(tab)?.session;
      const nativeTitle = row2?.title?.trim() || "";
      if (nativeTitle && translated.get(text)?.shown === nativeTitle) translated.delete(text);
      const previous = translated.get(text);
      const original = previous?.original ?? text.data;
      const renamed = named.get(id2);
      if (renamed && (row2?.connection_id && row2.connection_id !== renamed.owner.connectionId || row2?.profile && row2.profile !== renamed.owner.profile || original === renamed.title || nativeTitle && nativeTitle !== renamed.previous)) named.delete(id2);
      const saved = named.get(id2)?.title;
      const shown = saved ? saved : draftLabels.has(original) && !row2?.title?.trim() && !row2?.preview?.trim() ? words3().fresh : original;
      if (previous?.shown === shown) continue;
      if (previous) restore(text, previous);
      if (shown === original) continue;
      translated.set(text, { original, shown, label, tooltip: label.title });
      if (label.title === original) label.title = shown;
      text.data = shown;
    }
    for (const id2 of named.keys()) if (!openIds.has(id2)) named.delete(id2);
  };
  const schedule = () => {
    frame ||= requestAnimationFrame(labels10);
  };
  const sheet = document.createElement("style");
  sheet.dataset.hcvSessionTabs = "";
  sheet.textContent = renameStyles(active2);
  document.head.append(sheet);
  const observer = new MutationObserver((changes2) => {
    if (!enabled()) return;
    if (changes2.some(({ target, addedNodes }) => {
      const element4 = target instanceof Element ? target : target.parentElement;
      return element4?.closest("[data-zone-tabstrip]") || [...addedNodes].some((node2) => node2 instanceof Element && (node2.matches(chatTab) || node2.querySelector(chatTab)));
    })) schedule();
  });
  const themeObserver = new MutationObserver(() => {
    if (!enabled()) close();
    schedule();
  });
  themeObserver.observe(root, { attributes: true, attributeFilter: ["data-hermes-theme", "lang"] });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  async function save(target, title) {
    if (!enabled() || !target.tab.isConnected || tabId(target.tab) !== target.id) throw new Error("Chat changed");
    const owner = target.owner;
    if (!owner?.connectionId || !owner.profile) throw new Error("Chat owner unavailable");
    const api = (id3, options) => window.hermesDesktop.api({
      connectionId: owner.connectionId,
      profile: owner.profile,
      path: `/api/sessions/${encodeURIComponent(id3)}`,
      ...options
    });
    const previous = tabSession(target.tab)?.session?.title?.trim() || "";
    let id2 = target.id;
    let finalTitle = title;
    if (id2) {
      try {
        const result = await api(id2, { method: "PATCH", body: { title, profile: owner.profile } });
        if (!result?.ok) throw new Error("Title not saved");
        finalTitle = result.title || title;
      } catch (error) {
        if (!target.runtime) throw error;
        const result = await host14.requestProfile({ ...owner, targetProfile: owner.profile }, "session.title", {
          session_id: target.runtime,
          title
        });
        finalTitle = result?.title || title;
      }
    } else {
      const submit = draftSubmit(target.tab);
      if (!submit || host14.state.focusedStoredSessionId.get() || host14.state.focusedSessionId.get()) {
        throw new Error("New chat not ready");
      }
      window.dispatchEvent(new CustomEvent("hermes:composer-draft-sync", {
        detail: { mode: "flush", target: "main" }
      }));
      const draft = await host14.composer.getDraft("new");
      await submit(`/title ${title}`, { attachments: [], displayKind: "hidden" });
      const workspace = document.querySelector(workspaceTab);
      id2 = workspace && tabId(workspace);
      if (!id2 || id2 !== host14.state.focusedStoredSessionId.get()) throw new Error("Chat changed");
      const retained = await host14.composer.getDraft(id2);
      if (draft && !retained && !await host14.composer.setDraft(id2, draft)) throw new Error("Draft not restored");
      if ((await api(id2)).title !== title) throw new Error("Title not saved");
    }
    named.set(id2, { title: finalTitle, previous, owner });
    if (!disposed) {
      sessions.postMessage(1);
      schedule();
    }
  }
  ctx.register({
    id: "chat-tab-rename",
    area: TITLEBAR_AREAS5.center,
    render: () => h11(RenameSlot, { model, close, save })
  });
  ctx.addEventListener(document, "dblclick", (event) => {
    if (!enabled() || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
    const tab = origin?.closest(chatTab);
    if (!tab || model.get() || !tab.closest("[data-zone-tabstrip]")) return;
    const control = origin.closest('button, a, input, [role="button"]');
    if (control && control !== tab) return;
    event.preventDefault();
    event.stopPropagation();
    const id2 = tabId(tab);
    const label = tab.querySelector(labelSelector);
    const translation = translated.get(label?.firstChild);
    const title = translation && draftLabels.has(translation.original) && !named.has(id2) ? "" : label?.textContent.trim() || "";
    const focused = id2 === host14.state.focusedStoredSessionId.get();
    const row2 = tabSession(tab)?.session;
    const owner = focused ? host14.state.focusedSessionOwner.get() : row2?.connection_id && { connectionId: row2.connection_id, profile: row2.profile || "default" };
    if (!owner) return;
    model.set({
      key: ++requestKey,
      tab,
      id: id2,
      title,
      words: words3(),
      owner,
      runtime: focused ? host14.state.focusedSessionId.get() : null
    });
  }, true);
  schedule();
  ctx.onDispose(() => {
    disposed = true;
    close();
    observer.disconnect();
    themeObserver.disconnect();
    cancelAnimationFrame(frame);
    labels10();
    sessions.close();
    sheet.remove();
  });
}

// source/context-meter.js
import { Tip as Tip2, host as host15, useValue as useValue7 } from "@hermes/plugin-sdk";
import { createElement as h12, useCallback, useEffect as useEffect8, useState as useState10 } from "react";
function readContext(usage) {
  const used = usage?.context_used;
  const max = usage?.context_max;
  if (!Number.isFinite(used) || used < 0 || !Number.isFinite(max) || max <= 0) return null;
  return { used: Math.min(used, max), max, estimated: usage.context_estimated === true };
}
var modelName = (value) => String(value ?? "").toLowerCase().split("/").at(-1);
function useContext(inMainComposer) {
  const session = useValue7(host15.state.focusedSessionId);
  const owner = useValue7(host15.state.focusedSessionOwner);
  const primary4 = useValue7(host15.state.activeSessionId);
  const profile2 = useValue7(host15.state.profile) || "default";
  const connection = useValue7(host15.state.connectionId);
  const model = useValue7(host15.state.model);
  const busy = useValue7(host15.state.busy);
  const gateway = useValue7(host15.state.gateway);
  const usage = useValue7(host15.state.focusedUsage);
  const [snapshot, setSnapshot] = useState10(null);
  const sameGateway = !owner || owner.profile === profile2 && (!connection || owner.connectionId === connection);
  const key = inMainComposer && session && session === primary4 && sameGateway ? JSON.stringify([owner?.connectionId ?? connection, profile2, session, model]) : null;
  useEffect8(() => {
    if (!key || busy || gateway !== "open") return;
    const socket = host15.getGateway();
    if (!socket) return;
    let request = 0;
    const refresh = () => {
      const current = ++request;
      void socket.request("session.context_breakdown", { session_id: session }).then((data) => {
        if (current !== request || host15.getGateway() !== socket) return;
        if (model && data?.model && modelName(model) !== modelName(data.model)) return;
        setSnapshot({ key, context: readContext(data), seenUsage: host15.state.focusedUsage.get() });
      }).catch(() => {
      });
    };
    const unsubscribe = socket.onEvent((event) => {
      if (event.type === "session.info" && event.session_id === session && !event.payload?.running) refresh();
    });
    refresh();
    return () => {
      request++;
      unsubscribe();
    };
  }, [key, session, model, busy, gateway]);
  if (!key || gateway !== "open" || snapshot?.key !== key || !snapshot.context) return null;
  const context = snapshot.context;
  const liveModelMatches = !model || !usage?.model || modelName(model) === modelName(usage.model);
  const live = usage !== snapshot.seenUsage && liveModelMatches ? readContext(usage) : null;
  return live?.max === context.max ? live : context;
}
var number = new Intl.NumberFormat("ru-RU");
var thousands = (tokens) => number.format(Math.round(tokens / 1e3));
function ContextReadout({ context }) {
  const percent = context.used / context.max * 100;
  const whole = Math.round(percent);
  const full = whole >= 50;
  const detail = full ? `${whole}% \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043E` : `${whole}% \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u043E (\u043E\u0441\u0442\u0430\u043B\u043E\u0441\u044C ${100 - whole}%)`;
  const used = `${context.estimated ? "\u2248" : ""}${thousands(context.used)}`;
  const label = h12(
    "div",
    { "data-hcv-context-detail": "" },
    h12("span", { "data-muted": "" }, "\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u043D\u043E\u0435 \u043E\u043A\u043D\u043E:"),
    h12("span", full ? { "data-muted": "" } : null, detail),
    h12("span", null, `\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u043E ${used} \u043A / ${thousands(context.max)} \u043A \u0442\u043E\u043A\u0435\u043D\u043E\u0432`)
  );
  const circle = { cx: 6, cy: 6, r: 5, stroke: "currentColor", strokeWidth: 2, fill: "none" };
  const ring = h12(
    "svg",
    { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true },
    h12("circle", { ...circle, opacity: 0.16 }),
    h12("circle", {
      ...circle,
      "data-hcv-context-arc": "",
      opacity: Number(percent !== 0),
      strokeLinecap: "round",
      pathLength: 100,
      strokeDasharray: 100,
      strokeDashoffset: 100 - percent,
      transform: "rotate(-90 6 6)"
    })
  );
  return h12(
    Tip2,
    { label, side: "top", align: "center", sideOffset: 4, "data-hcv-context-tip": "" },
    h12("span", {
      "data-hcv-context-meter": "",
      role: "img",
      tabIndex: 0,
      "aria-label": `\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u0435 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0430: ${whole}%`
    }, ring)
  );
}
function ContextMeter() {
  const [inMainComposer, setInMainComposer] = useState10(false);
  const locate = useCallback((node2) => {
    const composer2 = node2?.closest('[data-slot="composer-surface"]');
    setInMainComposer(Boolean(composer2?.querySelector('[data-tour="model-pill"]')));
  }, []);
  const context = useContext(inMainComposer);
  return h12(
    "span",
    { "data-hcv-context-anchor": "", ref: locate },
    context ? h12(ContextReadout, { context }) : null
  );
}
function registerContextMeter(ctx, active2) {
  const root = document.documentElement;
  const sheet = document.createElement("style");
  sheet.textContent = `
    ${active2} [data-hcv-context-anchor] { display: contents; }
    ${active2} [data-hcv-context-meter] {
      display: inline-grid;
      place-items: center;
      flex: none;
      inline-size: 24px;
      block-size: 24px;
      color: var(--hcv-muted);
      border-radius: 6px;
    }
    ${active2} [data-hcv-context-meter]:focus-visible {
      outline: 2px solid var(--hcv-focus);
      outline-offset: -2px;
    }
    ${active2} [data-hcv-context-arc] {
      transition: stroke-dashoffset 120ms ease-out, opacity 120ms ease-out;
    }
    ${active2} [data-hcv-context-detail] {
      display: flex;
      flex-direction: column;
      gap: 2px;
      inline-size: min(152px, calc(100vw - 50px));
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    ${active2} [data-hcv-context-detail] [data-muted] { opacity: .6; }
    ${active2} [data-hcv-context-tip] span:has(> [data-slot="tooltip-arrow"]) { display: none; }
    @media (prefers-reduced-motion: reduce) {
      ${active2} [data-hcv-context-arc] { transition: none; }
    }
  `;
  document.head.append(sheet);
  let remove;
  const update = () => {
    if (root.matches(active2)) {
      remove ??= ctx.register({
        id: "context-meter",
        area: "composer.actions",
        order: 110,
        render: () => h12(ContextMeter)
      });
    } else if (remove) {
      remove();
      remove = void 0;
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(root, { attributes: true, attributeFilter: ["data-hermes-theme"] });
  ctx.onDispose(() => {
    observer.disconnect();
    remove?.();
    sheet.remove();
  });
  update();
}

// source/composer.js
import { host as host19 } from "@hermes/plugin-sdk";

// source/queue.js
import { useI18n as useI18n5 } from "@hermes/plugin-sdk";
import { createElement as h13, useLayoutEffect as useLayoutEffect2, useRef as useRef8 } from "react";

// source/queue-order.js
import { host as host16 } from "@hermes/plugin-sdk";
var storageKey2 = "hermes.desktop.composerQueue.v1";
var dragType = "application/x-hcv-queued-prompt";
var rowSelector2 = '[data-slot="status-row"]';
var gripSelector = "[data-hcv-queue-grip]";
var editing = '[data-slot="composer-surface"] [class~="bg-accent/18"]:has(> div > button + button)';
function queueIdentity(dock2, panel2) {
  const state = host16.state;
  const runtime = state.focusedSessionId.get();
  const stored = state.focusedStoredSessionId.get();
  const primary4 = dock2.querySelector('form[data-tour="composer"]');
  const target = dock2.closest("[data-floating-composer-target]")?.dataset.floatingComposerTarget ?? dock2.closest("[data-composer-target]")?.dataset.composerTarget;
  const focused = primary4 ? runtime === state.activeSessionId.get() : stored && target === `tile:${stored}`;
  const parked = panel2.querySelector(".status-section-icon > .codicon-debug-pause");
  if (!runtime || !focused || !state.busy.get() && !parked || dock2.querySelector(editing)) return null;
  const owner = state.focusedSessionOwner.get();
  return {
    keys: [...new Set([stored, runtime].filter(Boolean))],
    scope: JSON.stringify([owner?.connectionId ?? state.connectionId.get(), owner?.profile ?? state.profile.get(), stored, runtime])
  };
}
function readQueue(dock2, panel2, copy6) {
  const identity = queueIdentity(dock2, panel2);
  const rows = Array.from(panel2.querySelectorAll(`:scope > .status-section-body > ${rowSelector2}`));
  if (!identity || rows.length < 2) return null;
  try {
    const raw = localStorage.getItem(storageKey2);
    const queues = JSON.parse(raw);
    if (!queues || typeof queues !== "object" || Array.isArray(queues)) return null;
    const matching = identity.keys.filter((key2) => {
      if (!Object.hasOwn(queues, key2)) return false;
      const entries2 = queues[key2];
      return Array.isArray(entries2) && entries2.length === rows.length && entries2.every((entry, index) => {
        if (typeof entry?.id !== "string" || typeof entry.text !== "string" || !Array.isArray(entry.attachments)) return false;
        const caption = entry.displayKind === "hidden" ? copy6.hiddenQueued : (entry.displayText ?? entry.text).trim() || (entry.attachments.length ? copy6.attachmentOnly : copy6.emptyTurn);
        return rows[index].querySelector(".status-row-content p")?.textContent === caption;
      });
    });
    if (matching.length !== 1) return null;
    const key = matching[0];
    const entries = queues[key];
    const ids = entries.map((entry) => entry.id);
    if (new Set(ids).size !== ids.length) return null;
    return { scope: identity.scope, key, entries, ids, rows, queues, raw };
  } catch {
    return null;
  }
}
function sameQueue(before, after) {
  return after && before.scope === after.scope && before.key === after.key && before.ids.length === after.ids.length && before.ids.every((id2, index) => id2 === after.ids[index] && before.rows[index] === after.rows[index]);
}
function saveOrder(snapshot, from, to) {
  if (from === to || from < 0 || to < 0 || Math.max(from, to) >= snapshot.ids.length) return false;
  const entries = snapshot.entries.slice();
  const [entry] = entries.splice(from, 1);
  entries.splice(to, 0, entry);
  try {
    if (localStorage.getItem(storageKey2) !== snapshot.raw) return false;
    localStorage.setItem(storageKey2, JSON.stringify({ ...snapshot.queues, [snapshot.key]: entries }));
  } catch {
    return false;
  }
  window.dispatchEvent(new StorageEvent("storage", { key: storageKey2, storageArea: localStorage }));
  return true;
}
function bindQueueOrder(dock2, panel2, t, copy6) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const announcement = document.createElement("span");
  announcement.className = "sr-only";
  announcement.setAttribute("role", "status");
  panel2.append(announcement);
  let drag;
  let marker2;
  const sync = () => {
    const snapshot = readQueue(dock2, panel2, copy6);
    panel2.toggleAttribute("data-hcv-queue-reorder", Boolean(snapshot));
    if (drag && !sameQueue(drag.snapshot, snapshot)) clearDrag();
  };
  const clearMarker = () => {
    marker2?.removeAttribute("data-hcv-queue-drop");
    marker2 = void 0;
  };
  const clearDrag = () => {
    clearMarker();
    drag?.element.removeAttribute("data-hcv-queue-dragging");
    drag = void 0;
  };
  const move = (before, from, to) => {
    const current = readQueue(dock2, panel2, copy6);
    if (!sameQueue(before, current) || !saveOrder(current, from, to)) return false;
    announcement.textContent = t("queueMoved", to + 1, current.ids.length);
    return true;
  };
  const gripOf = (event) => event.target instanceof Element ? event.target.closest(gripSelector) : null;
  const rowOf = (event) => event.target instanceof Element ? event.target.closest(rowSelector2) : null;
  panel2.addEventListener("dragstart", (event) => {
    if (!gripOf(event) || !event.dataTransfer) return;
    const snapshot = readQueue(dock2, panel2, copy6);
    const element4 = rowOf(event);
    const index = snapshot?.rows.indexOf(element4) ?? -1;
    if (index < 0) {
      event.preventDefault();
      return;
    }
    drag = { snapshot, element: element4, index };
    event.dataTransfer.setData(dragType, "queued");
    event.dataTransfer.effectAllowed = "move";
    const bounds = element4.getBoundingClientRect();
    event.dataTransfer.setDragImage(element4, event.clientX - bounds.left, event.clientY - bounds.top);
    element4.dataset.hcvQueueDragging = "";
    event.stopPropagation();
  }, options);
  panel2.addEventListener("dragover", (event) => {
    if (!drag || !event.dataTransfer?.types.includes(dragType)) return;
    const target = rowOf(event);
    if (!drag.snapshot.rows.includes(target)) {
      clearMarker();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (marker2 !== target) clearMarker();
    marker2 = target;
    const box = target.getBoundingClientRect();
    target.dataset.hcvQueueDrop = event.clientY >= box.top + box.height / 2 ? "after" : "before";
  }, options);
  panel2.addEventListener("drop", (event) => {
    if (!drag || !event.dataTransfer?.types.includes(dragType)) return;
    event.preventDefault();
    event.stopPropagation();
    const { snapshot, index } = drag;
    const target = rowOf(event);
    const at = snapshot.rows.indexOf(target);
    if (at >= 0) {
      const box = target.getBoundingClientRect();
      const boundary = at + Number(event.clientY >= box.top + box.height / 2);
      move(snapshot, index, boundary - Number(boundary > index));
    }
    clearDrag();
  }, options);
  panel2.addEventListener("dragend", clearDrag, options);
  panel2.addEventListener("dragleave", (event) => {
    if (!(event.relatedTarget instanceof Node) || !panel2.contains(event.relatedTarget)) clearMarker();
  }, options);
  panel2.addEventListener("keydown", (event) => {
    const grip = gripOf(event);
    if (!grip || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const snapshot = readQueue(dock2, panel2, copy6);
    const index = snapshot?.rows.indexOf(rowOf(event)) ?? -1;
    if (index < 0 || !move(snapshot, index, index + (event.key === "ArrowUp" ? -1 : 1))) return;
    requestAnimationFrame(() => {
      if (grip.isConnected && document.activeElement === document.body) grip.focus();
    });
  }, options);
  const release = [
    host16.state.busy,
    host16.state.focusedSessionId,
    host16.state.focusedStoredSessionId
  ].map((state) => state.listen(sync));
  return {
    add(actions) {
      const grip = document.createElement("button");
      grip.type = "button";
      grip.draggable = true;
      grip.dataset.hcvQueueGrip = "";
      grip.setAttribute("aria-label", t("queueMove"));
      grip.title = t("queueMove");
      actions.parentElement.append(grip);
      return () => grip.remove();
    },
    sync,
    dispose() {
      events.abort();
      release.forEach((stop) => stop());
      clearDrag();
      panel2.removeAttribute("data-hcv-queue-reorder");
      announcement.remove();
    }
  };
}

// source/queue.js
var stack = '[data-slot="composer-status-stack"]';
var section = '[data-slot="status-section"]';
var row = '[data-slot="status-row"]';
var edit2 = "button:has(> svg.tabler-icon-pencil)";
var steer = "button:has(> svg.tabler-icon-steering-wheel)";
var send = "button:has(> svg.tabler-icon-corner-down-left)";
var modeKey = "queueFollowUps";
function menuButton(icon8) {
  const button2 = document.createElement("button");
  button2.type = "button";
  button2.style.setProperty("--hcv-queue-icon", codexMask(icon8));
  return button2;
}
function rowMenu(actions, ctx, queueing) {
  const { t } = ctx.i18n;
  const trigger = menuButton("queueMore");
  trigger.dataset.hcvQueueMore = "";
  trigger.setAttribute("aria-label", t("queueActions"));
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  const popup = document.createElement("div");
  popup.popover = "auto";
  popup.dataset.hcvQueueMenu = "";
  popup.setAttribute("role", "menu");
  popup.setAttribute("aria-label", t("queueActions"));
  const item = (icon8, run) => {
    const button2 = menuButton(icon8);
    button2.setAttribute("role", "menuitem");
    button2.tabIndex = -1;
    button2.addEventListener("click", () => {
      popup.hidePopover();
      run();
    });
    popup.append(button2);
    return button2;
  };
  const editItem = item("queueEdit", () => actions.querySelector(edit2)?.click());
  const sendItem = item("queueSteer", () => actions.querySelector(send)?.click());
  const modeItem = item("queueFollowUp", () => ctx.storage.set(modeKey, !queueing()));
  const items2 = () => Array.from(popup.querySelectorAll("button:not([hidden], :disabled)"));
  trigger.popoverTargetElement = popup;
  popup.addEventListener("beforetoggle", (event) => {
    const opening = event.newState === "open";
    trigger.setAttribute("aria-expanded", String(opening));
    if (!opening) return;
    const editButton = actions.querySelector(edit2);
    const sendButton = actions.querySelector(send);
    editItem.textContent = t("queueEdit");
    editItem.disabled = !editButton || editButton.disabled;
    sendItem.textContent = t("queueNext");
    sendItem.hidden = !sendButton || !actions.querySelector(steer);
    sendItem.disabled = !sendButton || sendButton.disabled;
    modeItem.textContent = t(queueing() ? "queueOff" : "queueOn");
    const rect = trigger.getBoundingClientRect();
    const maxHeight = 92;
    popup.style.right = Math.max(8, window.innerWidth - rect.right) + "px";
    const below = rect.bottom + maxHeight + 8 < window.innerHeight;
    popup.style.top = below ? rect.bottom + 4 + "px" : "auto";
    popup.style.bottom = below ? "auto" : window.innerHeight - rect.top + 4 + "px";
  });
  popup.addEventListener("toggle", (event) => {
    if (event.newState === "open") items2()[0]?.focus({ preventScroll: true });
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!popup.matches(":popover-open")) trigger.click();
      else items2()[0]?.focus();
    }
  });
  popup.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      popup.hidePopover();
      trigger.focus();
      return;
    }
    const buttons = items2();
    const current = buttons.indexOf(document.activeElement);
    const last = buttons.length - 1;
    if (last < 0) return;
    let index;
    switch (event.key) {
      case "ArrowDown":
        index = (current + 1) % buttons.length;
        break;
      case "ArrowUp":
        index = current <= 0 ? last : current - 1;
        break;
      case "Home":
        index = 0;
        break;
      case "End":
        index = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    buttons[index].focus();
  });
  actions.append(trigger, popup);
  return () => {
    trigger.remove();
    popup.remove();
  };
}
function QueueSurface({ ctx, queueing }) {
  const anchor = useRef8(null);
  const { locale, t: { composer: copy6 } } = useI18n5();
  useLayoutEffect2(() => {
    const dock2 = anchor.current?.closest('[data-slot="composer-dock"]');
    if (!dock2) return;
    const menus2 = /* @__PURE__ */ new Map();
    let current;
    let ordering;
    let expandedByPlugin = false;
    const cleanSection = () => {
      for (const dispose of menus2.values()) dispose();
      menus2.clear();
      ordering?.dispose();
      ordering = void 0;
      if (!current) return;
      current.removeAttribute("data-hcv-queue");
      current.removeAttribute("aria-label");
      current.removeAttribute("role");
      current.style.removeProperty("--hcv-queue-steer-label");
      if (expandedByPlugin && current.isConnected) {
        current.querySelector('.status-section-trigger[aria-expanded="true"]')?.click();
      }
      expandedByPlugin = false;
    };
    const sync = () => {
      const icon8 = dock2.querySelector(stack + " .status-section-trigger > .status-section-icon > :is(.codicon-layers, .codicon-debug-pause)");
      const panel2 = icon8?.closest(section);
      if (panel2 !== current) {
        cleanSection();
        current = panel2;
        if (panel2) ordering = bindQueueOrder(dock2, panel2, ctx.i18n.t, copy6);
      }
      if (!panel2) return;
      if (!panel2.hasAttribute("data-hcv-queue")) {
        panel2.dataset.hcvQueue = "";
        panel2.setAttribute("role", "group");
        panel2.setAttribute("aria-label", ctx.i18n.t("queueLabel"));
        panel2.style.setProperty("--hcv-queue-steer-label", JSON.stringify(ctx.i18n.t("queueSteer")));
      }
      const collapsed = panel2.querySelector('.status-section-trigger[aria-expanded="false"]');
      if (collapsed && !panel2.closest("[inert]")) {
        expandedByPlugin = true;
        collapsed.click();
      }
      const live = new Set(panel2.querySelectorAll(".status-section-body > " + row + " > .status-row-actions"));
      for (const [actions, dispose] of menus2) {
        if (!live.has(actions)) {
          dispose();
          menus2.delete(actions);
        }
      }
      for (const actions of live) {
        if (menus2.has(actions)) continue;
        const removeMenu = rowMenu(actions, ctx, queueing);
        const removeGrip = ordering.add(actions);
        menus2.set(actions, () => {
          removeMenu();
          removeGrip();
        });
      }
      ordering.sync();
    };
    const observer = new MutationObserver(sync);
    observer.observe(dock2, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-expanded", "inert"]
    });
    sync();
    return () => {
      observer.disconnect();
      cleanSection();
    };
  }, [ctx, locale, copy6, queueing]);
  return h13("span", { ref: anchor, hidden: true });
}
function queueStyles(active2) {
  const panel2 = active2 + " [data-hcv-queue]";
  const entry = panel2 + " > .status-section-body > " + row;
  const soleQueue = '[data-slot="status-stack-content"] > :only-child > [data-hcv-queue]';
  const onlyQueue = stack + ":has(" + soleQueue + ")";
  const bareDock = active2 + ' [data-slot="composer-dock"]:has(' + stack + " " + soleQueue + "):not(:has(.coding-status-bar))";
  const queueRows = " > .status-section-body > " + row;
  const visibleQueue = ".status-drawer:not([data-collapsed]) [data-hcv-queue]" + queueRows;
  const attached = active2 + ' [data-slot="composer-dock"]:not([data-popped-out]):has(> ' + visibleQueue + ")";
  const lastQueue = '[data-slot="status-stack-content"] > :last-child > [data-hcv-queue]';
  const grip = entry + " > [data-hcv-queue-grip]";
  const popup = active2 + " [data-hcv-queue-menu]";
  const more = entry + " [data-hcv-queue-more]";
  const deleteButton = entry + " .status-dismiss-button";
  const primary4 = entry + " .status-row-actions > :is(" + steer + ", " + send + ")";
  return `
    ${active2}[data-hermes-mode="dark"] {
      --hcv-queue-text: #dfdfdf;
      --hcv-queue-muted: #969696;
    }
    ${active2} ${onlyQueue} > div {
      /* Codex insets the tray 13px. Hermes reserves a 5px grab margin. */
      margin-inline: 18px;
      background: transparent;
      backdrop-filter: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    ${bareDock} [data-slot="status-drawer-toggle"][aria-expanded="true"] { display: none; }
    ${attached} {
      /* attached-uA8vni in Codex 0b2d31a9d760.css: radius + one unit. */
      --hcv-queue-overlap: 20px;
    }
    ${attached} > .status-drawer:has(${lastQueue}) {
      margin-block-end: calc(-1 * var(--hcv-queue-overlap));
    }
    ${attached} ${lastQueue} { padding-block-end: var(--hcv-queue-overlap); }
    ${attached} > [data-slot="composer-root"] { z-index: 1; }
    ${panel2} {
      background: var(--hcv-menu);
      border: 1px solid var(--hcv-stroke);
      border-block-end: 0;
      border-radius: 16px 16px 0 0;
      container-type: inline-size;
      overflow: clip;
      color: var(--hcv-queue-text, var(--hcv-text));
      font-family: var(--hcv-ui-font);
    }
    ${panel2} > .status-section-header:not(:has(.codicon-debug-pause)) { display: none; }
    ${panel2} > .status-section-body {
      display: grid;
      row-gap: 1px;
      max-block-size: 30dvh;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }
    ${entry} {
      position: relative;
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr) auto 22px 22px;
      grid-template-areas: "icon text primary delete more";
      align-items: center;
      min-block-size: 29px;
      gap: 4px;
      padding: 2px 9px;
      background: transparent;
    }
    ${entry}:hover { background: transparent; }
    ${grip} {
      display: none;
      position: absolute;
      inset-inline-start: 1px;
      inset-block-start: 50%;
      translate: 0 -50%;
      place-items: center;
      inline-size: 11px;
      block-size: 20px;
      padding: 0;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: color-mix(in srgb, var(--hcv-queue-muted, var(--hcv-muted)) 70%, transparent);
      opacity: 0;
      cursor: grab;
    }
    ${panel2}[data-hcv-queue-reorder] > .status-section-body > ${row} > [data-hcv-queue-grip] { display: grid; }
    ${grip}::before {
      content: "";
      inline-size: 14px;
      block-size: 14px;
      background: currentColor;
      mask: ${codexMask("queueGrip")} center / contain no-repeat;
    }
    ${entry}:is(:hover, :focus-within, [data-hcv-queue-dragging]) > [data-hcv-queue-grip] { opacity: 1; }
    ${grip}:focus-visible { outline: 1px solid var(--hcv-focus); }
    ${entry}[data-hcv-queue-dragging] { opacity: .6; cursor: grabbing; }
    ${entry}[data-hcv-queue-drop]::after {
      content: "";
      position: absolute;
      inset-inline: 10px;
      block-size: 1px;
      background: var(--hcv-focus);
      pointer-events: none;
    }
    ${entry}[data-hcv-queue-drop="before"]::after { inset-block-start: 0; }
    ${entry}[data-hcv-queue-drop="after"]::after { inset-block-end: 0; }
    ${entry} > :is(.status-row-actions, .status-row-dismiss) { display: contents; opacity: 1; }
    ${entry} > .status-row-icon {
      grid-area: icon;
      color: color-mix(in srgb, var(--hcv-queue-muted, var(--hcv-muted)) 70%, transparent);
      width: 14px;
      height: 14px;
      background: currentColor;
      mask: ${codexMask("queueFollowUp")} center / contain no-repeat;
    }
    ${entry} > .status-row-icon > *,
    ${entry} :is(.status-dismiss-button, ${steer}, ${send}) > svg,
    ${deleteButton} > * { display: none; }
    ${entry} > .status-row-content { grid-area: text; margin-inline-start: 2px; }
    ${entry} > .status-row-content p { font: 400 13px/20px var(--hcv-ui-font); color: inherit; }
    ${entry} .status-row-actions > ${edit2},
    ${entry}:has(> .status-row-actions > button > svg.tabler-icon-steering-wheel) .status-row-actions > ${send} { display: none; }
    ${primary4}, ${deleteButton}, ${more} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      block-size: 22px;
      min-inline-size: 22px;
      margin: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--hcv-queue-muted, var(--hcv-muted));
      font: 400 12px/18px var(--hcv-ui-font);
      cursor: pointer;
    }
    ${primary4} { grid-area: primary; inline-size: auto; padding-inline: 5px; }
    ${primary4}::after { content: attr(aria-label); }
    ${entry} .status-row-actions > ${steer}::after { content: var(--hcv-queue-steer-label); }
    ${deleteButton} { grid-area: delete; inline-size: 22px; }
    ${more} { grid-area: more; inline-size: 22px; }
    ${primary4} { --hcv-queue-icon: ${codexMask("queueSteer")}; }
    ${deleteButton} { --hcv-queue-icon: ${codexMask("queueTrash")}; }
    ${primary4}::before, ${deleteButton}::before, ${more}::before,
    ${popup} button::before {
      content: "";
      display: block;
      inline-size: 14px;
      block-size: 14px;
      flex: none;
      background: currentColor;
      mask: var(--hcv-queue-icon) center / contain no-repeat;
    }
    ${primary4}:is(:hover, :focus-visible), ${deleteButton}:is(:hover, :focus-visible),
    ${more}:is(:hover, :focus-visible, [aria-expanded="true"]) {
      color: var(--hcv-queue-text, var(--hcv-text));
      background: var(--hcv-hover-menu);
    }
    ${primary4}:focus-visible, ${deleteButton}:focus-visible, ${more}:focus-visible {
      outline: 1px solid var(--hcv-focus);
      outline-offset: -1px;
    }
    ${popup} {
      position: fixed;
      inset: auto;
      margin: 0;
      inline-size: max-content;
      max-inline-size: calc(100vw - 16px);
      padding: 4px;
      border: 1px solid var(--hcv-stroke);
      border-radius: 16px;
      background: var(--hcv-menu);
      color: var(--hcv-queue-text, var(--hcv-text));
      box-shadow: var(--hcv-menu-shadow);
      font: 400 13px/18px var(--hcv-ui-font);
    }
    ${popup} button {
      display: flex;
      align-items: center;
      inline-size: 100%;
      min-block-size: 26px;
      gap: 7px;
      padding: 3px 7px;
      border: 0;
      border-radius: 8px;
      text-align: start;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    ${popup} button[hidden] { display: none; }
    ${popup} button:disabled { opacity: .45; cursor: default; }
    @container (max-width: 350px) {
      ${primary4}::after { display: none; }
    }
  `;
}
function registerQueueAppearance(ctx, active2, queueing) {
  ctx.i18n.register({
    en: {
      queueLabel: "Queued messages",
      queueActions: "Queued message actions",
      queueSteer: "Steer",
      queueEdit: "Edit message",
      queueNext: "Send next",
      queueOff: "Turn off queueing",
      queueOn: "Turn on queueing",
      queueMove: "Move queued message with Up or Down",
      queueMoved: (position2, count) => `Position ${position2} of ${count}`
    },
    ru: {
      queueLabel: "\u041E\u0447\u0435\u0440\u0435\u0434\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439",
      queueActions: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u0441 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435\u043C \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u0438",
      queueSteer: "\u0421\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
      queueEdit: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
      queueNext: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u043C",
      queueOff: "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043F\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443 \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u044C",
      queueOn: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043F\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0443 \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u044C",
      queueMove: "\u041F\u0435\u0440\u0435\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0432 \u043E\u0447\u0435\u0440\u0435\u0434\u0438 \u0441\u0442\u0440\u0435\u043B\u043A\u0430\u043C\u0438 \u0432\u0432\u0435\u0440\u0445 \u0438\u043B\u0438 \u0432\u043D\u0438\u0437",
      queueMoved: (position2, count) => `\u041F\u043E\u0437\u0438\u0446\u0438\u044F ${position2} \u0438\u0437 ${count}`
    }
  });
  const root = document.documentElement;
  const sheet = document.createElement("style");
  sheet.dataset.hcvQueueStyle = "";
  sheet.textContent = queueStyles(active2);
  document.head.append(sheet);
  let remove;
  const sync = () => {
    if (root.matches(active2)) {
      remove ??= ctx.register({
        id: "queue-appearance",
        area: "composer.top",
        render: () => h13(QueueSurface, { ctx, queueing })
      });
    } else if (remove) {
      remove();
      remove = void 0;
    }
  };
  const theme2 = new MutationObserver(sync);
  theme2.observe(root, { attributes: true, attributeFilter: ["data-hermes-theme"] });
  ctx.onDispose(() => {
    theme2.disconnect();
    remove?.();
    sheet.remove();
  });
  sync();
}
function queueingPreference(ctx) {
  return ctx.storage.get(modeKey, true);
}

// source/composer-approval.js
import { createElement as h14, useCallback as useCallback2, useState as useState11, useSyncExternalStore as useSyncExternalStore2 } from "react";
import { COMPOSER_AREAS, DropdownMenu as DropdownMenu5, DropdownMenuContent as DropdownMenuContent5, DropdownMenuTrigger as DropdownMenuTrigger5, host as host17 } from "@hermes/plugin-sdk";
var nativeSelector = '[data-slot="statusbar"]';
function nativeItem(footer) {
  for (let fiber = committedFiber(footer); fiber; fiber = fiber.return) {
    const items2 = fiber.memoizedProps?.items;
    if (!Array.isArray(items2)) continue;
    return items2.find((item) => item.id === "approval-mode" && !item.hidden && item.menuContent);
  }
}
function nativeButton(footer) {
  for (const button2 of footer.querySelectorAll('button[aria-haspopup="menu"]')) {
    for (let fiber = committedFiber(button2); fiber && fiber.stateNode !== footer; fiber = fiber.return) {
      if (fiber.memoizedProps?.item?.id === "approval-mode") return button2;
    }
  }
}
function ApprovalControl({ subscribe, snapshot }) {
  const [main, setMain] = useState11(false);
  const locate = useCallback2((node2) => {
    setMain(Boolean(node2?.closest('form[data-slot="composer-root"][data-tour="composer"]:not([data-popped-out])') && !node2.closest("[data-hud-shell]")));
  }, []);
  const { item, route } = useSyncExternalStore2(subscribe, snapshot);
  let control;
  if (main && item) {
    const off = Boolean(item.className);
    control = h14(
      DropdownMenu5,
      { key: route },
      h14(
        DropdownMenuTrigger5,
        { asChild: true },
        h14(
          "button",
          {
            type: "button",
            "data-hcv-approval": off ? "off" : "",
            "aria-label": item.title,
            title: item.title,
            disabled: item.disabled
          },
          h14("span", { "data-hcv-approval-icon": "", "aria-hidden": "true", style: codexIconStyle(off ? "shieldWarning" : "shield") }),
          h14("span", { "data-hcv-approval-label": "" }, item.label)
        )
      ),
      h14(DropdownMenuContent5, {
        side: "top",
        align: "start",
        sideOffset: 4,
        "data-hcv-approval-menu": "",
        "aria-label": item.toggleLabel
      }, item.menuContent)
    );
  }
  return h14("span", { ref: locate, "data-hcv-approval-anchor": "" }, control);
}
function registerComposerApproval(ctx, active2) {
  const root = document.documentElement;
  const contrast = matchMedia("(forced-colors: none)");
  const listeners = /* @__PURE__ */ new Set();
  let current = {};
  let source;
  let registration;
  let frame;
  const snapshot = () => current;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const markSource = (button2) => {
    if (source === button2) return;
    source?.removeAttribute("data-hcv-approval-source");
    source = button2;
    source?.setAttribute("data-hcv-approval-source", "");
  };
  function sync() {
    frame = 0;
    const enabled = contrast.matches && root.matches(active2);
    if (enabled) {
      registration ??= ctx.register({
        id: "composer-approval",
        area: COMPOSER_AREAS.leading,
        render: () => h14(ApprovalControl, { subscribe, snapshot })
      });
    } else {
      registration?.();
      registration = void 0;
    }
    const footer = enabled && document.querySelector(nativeSelector);
    const item = footer ? nativeItem(footer) : void 0;
    const route = JSON.stringify([host17.state.connectionId.get(), host17.state.profile.get()]);
    markSource(item && footer ? nativeButton(footer) : void 0);
    if (item !== current.item || route !== current.route) {
      current = { item, route };
      for (const listener of listeners) listener();
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(sync);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-hermes-theme", "lang"]
  });
  contrast.addEventListener("change", schedule);
  const unsubscribe = [host17.state.gateway, host17.state.connectionId, host17.state.profile].map((atom6) => atom6.listen(schedule));
  ctx.onDispose(() => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    registration?.();
    markSource(void 0);
    contrast.removeEventListener("change", schedule);
    for (const off of unsubscribe) off();
  });
  sync();
}

// source/composer-changes.js
import { host as host18 } from "@hermes/plugin-sdk";
var dockSelector = '[data-chat-surface][data-composer-target="main"]:not([data-hud-shell] *, [data-pane-hidden] *, [inert] *) [data-slot="composer-dock"]:not([data-popped-out])';
var editTools = /* @__PURE__ */ new Set(["edit_file", "patch", "write_file"]);
var ansi = /\x1b\[[0-?]*[ -/]*[@-~]/g;
var hunkHeader = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
function resultRecord(value) {
  try {
    const record = typeof value === "string" ? JSON.parse(value) : value;
    return record && typeof record === "object" && !Array.isArray(record) ? record : {};
  } catch {
    return {};
  }
}
function filePath(value) {
  const path = value?.trim().split("	")[0];
  return path && path !== "/dev/null" ? path.replace(/^[ab]\//, "") : "";
}
function pathKey(path) {
  const normalized2 = path.replaceAll("\\", "/").replace(/^\.\//, "");
  return /^[a-z]:\//i.test(normalized2) ? normalized2.toLowerCase() : normalized2;
}
function changedFiles(payload) {
  const result = resultRecord(payload.result);
  if (payload.error || result.error || result.success === false) return [];
  const diff = [result.diff, result.inline_diff, payload.inline_diff].find((value) => typeof value === "string" && value.trim());
  if (!diff) return [];
  const args = payload.args || {};
  const fallback = [result.resolved_path, args.path, args.file, args.filepath, result.path, result.file, result.filepath].find((value) => typeof value === "string" && value.trim())?.trim();
  const sections = [];
  let file;
  let hunk;
  let oldPath;
  function section2(path) {
    hunk = null;
    file = { path, added: 0, removed: 0 };
    sections.push(file);
  }
  for (const line of diff.replace(ansi, "").split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      hunk = null;
      continue;
    }
    const header = line.match(hunkHeader);
    if (header) {
      if (!file) section2(fallback);
      const oldLines = Number(header[1] ?? 1);
      const newLines = Number(header[2] ?? 1);
      const countBody = oldLines > 0 && newLines > 0;
      if (!countBody) {
        file.added += newLines;
        file.removed += oldLines;
      }
      hunk = { oldLines, newLines, countBody };
    } else if (hunk && (hunk.oldLines || hunk.newLines) && /^[ +\-]/.test(line)) {
      if (line[0] !== "+") hunk.oldLines = Math.max(0, hunk.oldLines - 1);
      if (line[0] !== "-") hunk.newLines = Math.max(0, hunk.newLines - 1);
      if (hunk.countBody && line[0] === "+") file.added++;
      if (hunk.countBody && line[0] === "-") file.removed++;
    } else if (line.startsWith("--- ")) {
      oldPath = filePath(line.slice(4));
    } else if (line.startsWith("+++ ")) {
      section2(filePath(line.slice(4)) || oldPath);
    } else if (/^(?:[ab]\/|\/dev\/null|[A-Za-z]:[\\/]).+ → /.test(line)) {
      const [from, to] = line.split(" \u2192 ");
      section2(filePath(to) || filePath(from));
    }
  }
  const files = sections.filter((row2) => row2.added || row2.removed);
  if (files.length === 1 && fallback) files[0].path = fallback;
  return files.filter((row2) => row2.path).map((row2) => ({ ...row2, path: pathKey(row2.path) }));
}
function element3(tag, part) {
  const node2 = document.createElement(tag);
  node2.setAttribute("data-hcv-" + part, "");
  return node2;
}
function numberDisplay(part, sign) {
  const wrap = element3("span", part);
  const digits = element3("span", "changes-digits");
  wrap.append(sign, digits);
  const columns = /* @__PURE__ */ new Map();
  let shown;
  return {
    node: wrap,
    update(text) {
      if (text === shown) return;
      shown = text;
      const chars = [...text].reverse();
      const next = [];
      let position2 = 0;
      for (const char of chars) {
        if (!/^[0-9]$/.test(char)) {
          next.push(document.createTextNode(char));
          continue;
        }
        let column = columns.get(position2);
        if (!column) {
          column = element3("span", "changes-digit");
          const reel = element3("span", "changes-reel");
          for (const digit of "0123456789") {
            const cell = document.createElement("span");
            cell.textContent = digit;
            reel.append(cell);
          }
          column.append(reel);
          columns.set(position2, column);
        }
        column.firstChild.style.transform = "translateY(-" + char + "lh)";
        next.push(column);
        position2++;
      }
      next.reverse().forEach((node2, index) => {
        if (digits.childNodes[index] !== node2) digits.insertBefore(node2, digits.childNodes[index] || null);
      });
      while (digits.childNodes.length > next.length) digits.lastChild.remove();
      for (const index of columns.keys()) if (index >= position2) columns.delete(index);
      wrap.dataset.value = text;
    }
  };
}
function changesLabel(count, locale, formatted) {
  if (!locale.startsWith("ru")) return formatted + (count === 1 ? " file changed" : " files changed");
  const plural = new Intl.PluralRules("ru").select(count);
  if (plural === "one") return "\u0418\u0437\u043C\u0435\u043D\u0435\u043D " + formatted + " \u0444\u0430\u0439\u043B";
  return "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u043E " + formatted + (plural === "few" ? " \u0444\u0430\u0439\u043B\u0430" : " \u0444\u0430\u0439\u043B\u043E\u0432");
}
function registerComposerChanges(ctx, active2) {
  const root = document.documentElement;
  const contrast = matchMedia("(forced-colors: none)");
  const turns = /* @__PURE__ */ new Map();
  const key = (connection, profile2, session) => JSON.stringify([connection, profile2, session]);
  const scope2 = () => [host18.state.connectionId.get(), host18.state.profile.get()];
  const eventKey = (event) => event.session_id && !event.replayed ? key(event.connectionId || scope2()[0], event.profile || scope2()[1], event.session_id) : null;
  const rail = element3("div", "composer-changes");
  const chip2 = element3("div", "composer-changes-chip");
  const label = element3("span", "composer-changes-label");
  const totals = element3("span", "composer-changes-totals");
  const added = numberDisplay("composer-changes-added", "+");
  const removed = numberDisplay("composer-changes-removed", "\u2212");
  totals.append(added.node, removed.node);
  chip2.append(label, totals);
  chip2.setAttribute("role", "status");
  chip2.setAttribute("aria-live", "polite");
  for (const child of chip2.children) child.setAttribute("aria-hidden", "true");
  rail.append(chip2);
  const motion2 = matchMedia("(prefers-reduced-motion: no-preference)");
  let currentKey;
  let lastText;
  let sizeAnimation;
  let frame;
  function hide() {
    sizeAnimation?.cancel();
    rail.remove();
    currentKey = void 0;
    lastText = void 0;
  }
  function sync() {
    frame = 0;
    if (!root.matches(active2) || !contrast.matches) return hide();
    const session = host18.state.activeSessionId.get();
    const address = key(...scope2(), session);
    const turn = turns.get(address);
    const dock2 = turn?.paths.size && document.querySelector(dockSelector);
    if (!dock2 || !host18.state.busyBySession.get()[session]) return hide();
    if (currentKey !== address || rail.parentElement !== dock2) hide();
    const locale = root.lang.toLowerCase() || "en";
    const formatter = new Intl.NumberFormat(locale);
    const text = changesLabel(turn.paths.size, locale, formatter.format(turn.paths.size));
    const plus = formatter.format(turn.added);
    const minus = formatter.format(turn.removed);
    const accessible = text + ", +" + plus + ", \u2212" + minus;
    if (accessible === lastText && currentKey === address) return;
    const oldWidth = rail.isConnected ? chip2.getBoundingClientRect().width : 0;
    sizeAnimation?.cancel();
    label.textContent = text;
    added.update(plus);
    removed.update(minus);
    chip2.setAttribute("aria-label", accessible);
    if (!rail.isConnected) dock2.prepend(rail);
    const width = chip2.getBoundingClientRect().width;
    if (oldWidth && width !== oldWidth && motion2.matches) {
      sizeAnimation = chip2.animate([{ width: oldWidth + "px" }, { width: width + "px" }], { duration: 200, easing: "ease-out" });
    }
    lastText = accessible;
    currentKey = address;
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(sync);
  };
  ctx.onEvent("message.start", (event) => {
    const address = eventKey(event);
    if (!address) return;
    turns.set(address, { since: event.seq, calls: /* @__PURE__ */ new Set(), paths: /* @__PURE__ */ new Set(), added: 0, removed: 0 });
    if (turns.size > 64) turns.delete(turns.keys().next().value);
    schedule();
  });
  ctx.onEvent("tool.complete", (event) => {
    const payload = event.payload;
    if (!editTools.has(payload?.name) || !payload.tool_id) return;
    const turn = turns.get(eventKey(event));
    if (!turn || event.seq < turn.since || turn.calls.has(payload.tool_id)) return;
    const files = changedFiles(payload);
    if (!files.length) return;
    turn.calls.add(payload.tool_id);
    for (const row2 of files) {
      turn.paths.add(row2.path);
      turn.added += row2.added;
      turn.removed += row2.removed;
    }
    schedule();
  });
  ctx.onEvent("message.complete", (event) => {
    if (turns.delete(eventKey(event))) schedule();
  });
  const observer = new MutationObserver(schedule);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-hermes-theme", "lang", "data-pane-hidden", "data-popped-out"]
  });
  const unsubscribe = [host18.state.busyBySession, host18.state.activeSessionId, host18.state.connectionId, host18.state.profile].map((atom6) => atom6.listen(schedule));
  contrast.addEventListener("change", schedule);
  ctx.onDispose(() => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    contrast.removeEventListener("change", schedule);
    for (const off of unsubscribe) off();
    hide();
  });
}

// source/composer-layout.js
function registerComposerLayout(ctx, active2) {
  const dock2 = `${active2} [data-slot="composer-dock"]:not([data-popped-out], [data-hud-shell] *)`;
  const surface2 = `${dock2} [data-slot="composer-surface"]`;
  const fallback = `${active2} [data-chat-surface]:not([data-hud-shell] *) .composer-fallback-surface`;
  const backing = "> .pointer-events-none.absolute.inset-0.-z-10[aria-hidden]";
  const input = '[class~="[grid-area:input]"]';
  const leading = '[class~="[grid-area:menu]"]';
  const trailing = '[class~="[grid-area:controls]"]';
  const grid = `${surface2} [data-slot="composer-fade"] > div:has(> ${input} + ${trailing})`;
  const regularGrid = `${grid}:not(:has(> [data-hcv-dictation]))`;
  const editor2 = '[data-slot="composer-rich-input"]';
  const controls = `${grid} > :is(${leading}, ${trailing})`;
  const reasoning = '[data-testid="reasoning-pill"]';
  const ghost = `${controls} :is(button[aria-haspopup="menu"], button[data-tour="model-pill"], [data-slot="fan-menu-anchor"] > button):not([data-hcv-approval])`;
  const rail = `${active2} [data-hcv-composer-changes]`;
  const chip2 = `${rail} [data-hcv-composer-changes-chip]`;
  const approval = `${active2} [data-hcv-approval]`;
  const approvalMenu = `${active2} [data-hcv-approval-menu]`;
  const sheet = document.createElement("style");
  sheet.setAttribute("data-hcv-composer-layout", "");
  sheet.textContent = `
    @media (forced-colors: none) {
      ${active2} {
        --hcv-composer-light-blur: 80px;
        --hcv-composer-shadow: 0 0 0 1px #0000000a, 0 2px 8px #0000000a, 0 4px var(--hcv-composer-light-blur) 8px #00000006;
      }
      @media (max-width: 760px) { ${active2} { --hcv-composer-light-blur: 40px; } }
      ${active2}[data-hermes-mode="dark"] { --hcv-composer-shadow: inset 0 0 1px #fff3; }
      ${surface2} {
        /* Codex ef088f0f36db.css paints the fill and shadow on one surface.
           Hermes reserves a 1px native border. Move that pixel into the padding. */
        border: 0 !important;
        background-color: var(--composer-fill);
        box-shadow: var(--hcv-composer-shadow);
        --composer-control-size: 28px;
        --composer-control-primary-size: 28px;
        --composer-surface-pad-x: 8px;
        --composer-surface-pad-y: 8px;
        --hcv-composer-hover: color-mix(in srgb, var(--hcv-text) 8%, transparent);
      }
      ${surface2} ${backing}, ${fallback} ${backing},
      ${dock2} > [data-slot="composer-root"] > .pointer-events-none.absolute.inset-0 {
        display: none;
      }
      ${fallback} {
        border-color: transparent;
        border-radius: 22px;
        background-color: var(--hcv-composer);
        box-shadow: var(--hcv-composer-shadow);
      }
      ${surface2} [data-slot="composer-fade"] { container-type: inline-size; }
      ${regularGrid} {
        grid-template-areas: "input input" "menu controls";
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        column-gap: 4px;
        row-gap: 0;
      }
      ${grid} > ${input} { padding-inline: 4px; align-self: start; }
      /* Codex desktop uses 14px above the editor, two 20px lines,
         and 8px before the controls. The surface already adds 8px above. */
      ${regularGrid} > ${input} { padding-block: 6px 8px; }
      ${regularGrid} > ${input} ${editor2} { min-block-size: 40px; }
      ${grid}:has(> [data-hcv-dictation]) > ${input} { min-block-size: 40px; padding-block-start: 8px; }
      ${grid} > ${leading} { align-self: center; align-items: center; translate: none; }
      ${grid} > ${input} ${editor2} {
        inline-size: 100%; min-inline-size: 0; padding: 0;
        font-size: 14px; line-height: 20px;
      }
      ${grid} > ${input} ${editor2}[data-empty]::before { opacity: .5; }
      ${ghost} { border-radius: 999px; }
      ${ghost}:is(:hover, [data-state="open"]):not(:disabled) {
        background: var(--hcv-composer-hover); color: var(--hcv-text);
      }
      ${controls} > button:has(> .codicon-add) { color: var(--hcv-text); }
      ${codexIconRules(`${controls} > button > .codicon-add`, "plus")}
      ${controls} > button > .codicon-add { inline-size: 16px; block-size: 16px; }
      ${controls} :is(button[data-tour="model-pill"], ${reasoning}) { font-size: 13px; padding-inline: 8px; }
      ${controls} :is(button[data-tour="model-pill"], [data-slot="fan-menu-anchor"] > button) { color: var(--hcv-text); }
      ${controls} button[data-tour="model-pill"]:has(+ ${reasoning}) { padding-inline-end: 3px; margin-inline-end: -4px; }
      ${controls} ${reasoning} { padding-inline-start: 3px; }
      ${controls} ${reasoning}::after {
        content: ''; inline-size: 12px; block-size: 12px; background: currentColor; opacity: .65;
        mask: ${codexMask("down")} center / contain no-repeat;
      }
      ${controls} button[type="submit"] > span[class~="rounded-[0.1875rem]"] {
        inline-size: 16px; block-size: 16px; background: currentColor;
        mask: ${codexMask("dictationStop")} center / contain no-repeat;
      }
      ${active2} [data-hcv-approval-anchor] { display: contents; }
      ${active2}:has([data-hcv-approval]:not([data-pane-hidden] *)) [data-hcv-approval-source] { display: none; }
      ${approval} {
        display: flex; flex: none; align-items: center; gap: 4px;
        block-size: 28px; padding-inline: 6px 8px;
        border-radius: 999px; color: var(--hcv-muted); font: 13px/18px var(--hcv-ui-font);
        cursor: pointer;
      }
      ${approval}[data-hcv-approval="off"] { color: light-dark(#ab4108, #ff8549); }
      ${approval}:is(:hover, [data-state="open"]):not(:disabled) { background: var(--hcv-composer-hover); }
      ${approval}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
      ${approval} [data-hcv-approval-icon] { inline-size: 16px; block-size: 16px; flex: none; }
      ${approvalMenu} {
        inline-size: min(260px, calc(100vw - 16px));
        padding: 4px; border: 1px solid var(--hcv-hairline);
        border-radius: var(--hcv-menu-radius); background: var(--hcv-menu); color: var(--hcv-text);
        box-shadow: var(--hcv-menu-shadow);
      }
      ${approvalMenu} [role="menuitemradio"][data-highlighted] { background: var(--hcv-hover-menu); }
      @container (width < 400px) {
        ${approval} { justify-content: center; inline-size: 28px; padding-inline: 0; }
        ${approval} [data-hcv-approval-label] { display: none; }
      }
      ${rail} { display: flex; min-inline-size: 0; justify-content: center; margin-block-end: 8px; }
      ${chip2} {
        display: flex; align-items: center; gap: 4px;
        max-inline-size: calc(100% - 16px); padding: 6px 12px;
        border: 1px solid var(--hcv-hairline); border-radius: 14px;
        background: var(--hcv-menu); color: var(--hcv-muted);
        font: 14px/20px var(--hcv-ui-font); white-space: nowrap;
      }
      ${chip2} [data-hcv-composer-changes-label] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
      ${chip2} [data-hcv-composer-changes-totals] { display: inline-flex; align-items: center; gap: 4px; flex: none; }
      ${chip2} [data-hcv-composer-changes-added] { color: light-dark(#00a240, #40c977); }
      ${chip2} [data-hcv-composer-changes-removed] { color: light-dark(#ba2623, #fa423e); }
      ${chip2} :is([data-hcv-composer-changes-added], [data-hcv-composer-changes-removed], [data-hcv-changes-digits]) {
        display: inline-flex; align-items: center; font-variant-numeric: tabular-nums; letter-spacing: -.025em;
      }
      ${chip2} [data-hcv-changes-digit] { display: inline-block; inline-size: 1ch; block-size: 1lh; overflow: hidden; }
      ${chip2} [data-hcv-changes-reel] { display: flex; flex-direction: column; block-size: 1lh; contain: layout size style; }
      ${chip2} [data-hcv-changes-reel] > span { flex: 0 0 1lh; }
      @media (prefers-reduced-motion: no-preference) {
        ${ghost}, ${approval} { transition: background-color 150ms ease, color 150ms ease; }
        ${rail} { animation: hcv-changes-enter 150ms ease-out backwards; }
        ${chip2} [data-hcv-changes-reel] { transition: transform 300ms cubic-bezier(.16, 1, .3, 1); }
        @keyframes hcv-changes-enter { from { opacity: 0; translate: 0 4px; } }
      }
      @media (prefers-reduced-motion: reduce) {
        ${ghost}, ${approval} { transition: none; }
      }
    }
  `;
  document.head.append(sheet);
  ctx.onDispose(() => sheet.remove());
  registerComposerApproval(ctx, active2);
  registerComposerChanges(ctx, active2);
}

// source/composer.js
var composer = 'form[data-slot="composer-root"]';
var editor = '[data-slot="composer-rich-input"][contenteditable="true"]';
var drawer = '[data-slot="composer-completion-drawer"][role="listbox"]';
var slashMenu = `${drawer}:has(> button > :is([data-ref="command"], [data-ref="skill"], [data-ref="theme"]))`;
var queueButton = '[data-slot="composer-surface"] button[type="button"]:has(> svg.tabler-icon-layers-intersect-2)';
var voiceStartIcon = "svg.tabler-icon-wave-sine";
var voiceStartGroup = `[data-slot="composer-surface"] span:has(> button[type="button"] > ${voiceStartIcon})`;
var voiceStartItem = `[data-slot="dropdown-menu-content"]:has(> [data-slot="dropdown-menu-checkbox-item"]) > [data-slot="dropdown-menu-item"]:has(> ${voiceStartIcon})`;
var menuSeparator = '[data-slot="dropdown-menu-separator"]';
var attachments = '[data-slot="composer-attachments"]';
var queuedEdit = '[data-slot="composer-surface"] [class~="bg-accent/18"]:has(> div > button + button)';
var russianGroups = {
  Session: "\u0421\u0435\u0430\u043D\u0441",
  Sessions: "\u0421\u0435\u0430\u043D\u0441\u044B",
  Configuration: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
  "Tools & Skills": "\u0418\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B \u0438 \u043D\u0430\u0432\u044B\u043A\u0438",
  Info: "\u0418\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F",
  Exit: "\u0412\u044B\u0445\u043E\u0434",
  Commands: "\u041A\u043E\u043C\u0430\u043D\u0434\u044B",
  "Plugin commands": "\u041A\u043E\u043C\u0430\u043D\u0434\u044B \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u0432",
  Skills: "\u041D\u0430\u0432\u044B\u043A\u0438",
  Themes: "\u0422\u0435\u043C\u044B",
  Options: "\u0412\u0430\u0440\u0438\u0430\u043D\u0442\u044B"
};
function isBusy(form) {
  const focused = host19.state.focusedSessionId.get();
  if (form.dataset.tour === "composer") {
    const primary4 = host19.state.activeSessionId.get();
    return primary4 === focused ? host19.state.busy.get() : host19.state.busyBySession.get()[primary4] === true;
  }
  const target = form.closest("[data-floating-composer-target]")?.dataset.floatingComposerTarget ?? form.closest("[data-composer-target]")?.dataset.composerTarget;
  return target === `tile:${host19.state.focusedStoredSessionId.get()}` && host19.state.busy.get();
}
function isSlashCommand(input) {
  if (/^\/[^\s/]*(?:\s|$)/.test(input.innerText.trimStart())) return true;
  const chip2 = input.querySelector('[data-slash-kind][data-ref-text^="/"]');
  if (!chip2) return false;
  const prefix = document.createRange();
  prefix.setStart(input, 0);
  prefix.setEndBefore(chip2);
  return !prefix.toString().trim();
}
function shouldQueue(form, input) {
  return isBusy(form) && !form.querySelector(queuedEdit) && (form.querySelector(attachments) || !isSlashCommand(input));
}
function queueWithNativeShortcut(event, input) {
  event.preventDefault();
  event.stopPropagation();
  input.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    composed: true
  }));
}
function registerQueueShortcut(ctx, enabled, queueing) {
  const composing = /* @__PURE__ */ new WeakSet();
  const inputOf = (event) => event.target instanceof Element ? event.target.closest(editor) : null;
  ctx.addEventListener(document, "compositionstart", (event) => {
    const input = inputOf(event);
    if (input) composing.add(input);
  }, true);
  ctx.addEventListener(document, "compositionend", (event) => {
    const input = inputOf(event);
    if (input) composing.delete(input);
  }, true);
  ctx.addEventListener(document, "keydown", (event) => {
    if (event.defaultPrevented || event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.keyCode === 229 || !enabled()) return;
    const input = inputOf(event);
    const form = input?.closest(composer);
    if (!form) return;
    composing.delete(input);
    if (event.shiftKey) {
      if (form.querySelector(drawer)) event.stopPropagation();
      return;
    }
    const empty = !input.innerText.trim() && !form.querySelector(attachments);
    if ((queueing() || empty) && shouldQueue(form, input)) queueWithNativeShortcut(event, input);
  }, true);
  ctx.addEventListener(document, "submit", (event) => {
    if (event.defaultPrevented || !enabled() || !queueing() || !event.submitter) return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(composer) || !form.querySelector(queueButton)) return;
    const input = form.querySelector(editor);
    if (input && !composing.has(input) && shouldQueue(form, input)) queueWithNativeShortcut(event, input);
  }, true);
}
function registerSlashGroups(ctx, root, enabled) {
  ctx.i18n.register({
    en: { slashGroups: Object.fromEntries(Object.keys(russianGroups).map((label) => [label, label])) },
    ru: { slashGroups: russianGroups }
  });
  let form;
  const translated = /* @__PURE__ */ new Map();
  const restore = () => {
    for (const [text, { original, label }] of translated) {
      if (text.data === label) text.data = original;
    }
    translated.clear();
  };
  const sync = () => {
    if (!enabled()) {
      restore();
      return;
    }
    for (const text of translated.keys()) {
      if (!text.isConnected) translated.delete(text);
    }
    for (const heading of form?.querySelectorAll(`${slashMenu} > div`) ?? []) {
      const text = heading.firstChild;
      if (heading.childNodes.length !== 1 || text?.nodeType !== Node.TEXT_NODE) continue;
      const previous = translated.get(text);
      const original = previous?.label === text.data ? previous.original : text.data;
      const group = original.trim();
      if (!Object.hasOwn(russianGroups, group)) {
        translated.delete(text);
        continue;
      }
      const label = ctx.i18n.t(`slashGroups.${group}`);
      if (text.data !== label) text.data = label;
      if (label !== original) translated.set(text, { original, label });
      else translated.delete(text);
    }
  };
  const observer = new MutationObserver(sync);
  const watch = (node2) => {
    const next = node2 instanceof Element ? node2.closest(editor)?.closest(composer) : null;
    if (!next || next === form) return;
    observer.disconnect();
    restore();
    form = next;
    observer.observe(form, { subtree: true, childList: true, characterData: true });
    sync();
  };
  const theme2 = new MutationObserver(sync);
  theme2.observe(root, { attributes: true, attributeFilter: ["data-hermes-theme"] });
  ctx.addEventListener(document, "focusin", (event) => watch(event.target));
  ctx.i18n.onLocaleChange(sync);
  ctx.onDispose(() => {
    observer.disconnect();
    theme2.disconnect();
    restore();
  });
  watch(document.activeElement);
}
function registerComposer(ctx, active2) {
  const root = document.documentElement;
  const enabled = () => root.matches(active2);
  const menu = `${active2} ${composer} [data-slot="composer-completion-drawer"]`;
  const slash = `${active2} ${composer} ${slashMenu}`;
  const rowTip = `${active2}:has(${slashMenu} > button:is([data-state="delayed-open"], [data-state="instant-open"])) [data-slot="tooltip-content"]`;
  const sheet = document.createElement("style");
  sheet.dataset.hcvComposer = "";
  sheet.textContent = `
    ${active2} ${composer} ${queueButton} { display: none; }
    ${active2} ${composer} ${voiceStartGroup},
    ${active2} ${voiceStartItem},
    ${active2} ${voiceStartItem} + ${menuSeparator},
    ${active2} ${voiceStartItem} + ${menuSeparator} + ${menuSeparator} { display: none; }
    @media (forced-colors: none) {
      ${menu} {
        inline-size: min(380px, calc(100% - 16px));
        max-block-size: min(336px, calc(100dvh - 144px));
        margin-block-end: 6px;
        padding: 6px;
        border: 1px solid var(--hcv-hairline);
        border-radius: var(--hcv-menu-radius);
        background: var(--hcv-menu);
        box-shadow: var(--hcv-menu-shadow);
        color: var(--hcv-text);
        font: 400 13px/18px var(--hcv-ui-font);
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--hcv-text) 20%, transparent) transparent;
      }
      ${slash} > div:not(:has(*)) {
        padding-inline: 8px;
        text-transform: none;
        letter-spacing: normal;
        font: inherit;
        color: var(--hcv-muted);
      }
      ${slash} > button {
        gap: 8px;
        min-block-size: 28px;
        padding: 4px 8px;
        border-radius: 8px;
      }
      ${menu} > button:is(:hover, [data-highlighted]):not(:disabled) {
        background: var(--hcv-hover-menu);
      }
      ${slash} > button > [data-ref],
      ${slash} > button > span:nth-child(3) { color: var(--hcv-muted); }
      ${slash} > button > span:nth-child(2) { max-inline-size: 60%; }
      ${rowTip} {
        max-inline-size: min(240px, calc(100vw - 24px), var(--radix-tooltip-content-available-width, 240px));
      }
      ${rowTip} span:has(> [data-slot="tooltip-arrow"]) { display: none; }
    }
  `;
  document.head.append(sheet);
  ctx.onDispose(() => sheet.remove());
  registerSlashGroups(ctx, root, enabled);
  registerComposerLayout(ctx, active2);
  const queueing = () => queueingPreference(ctx);
  registerQueueShortcut(ctx, enabled, queueing);
  registerQueueAppearance(ctx, active2, queueing);
}

// source/dictation.js
import { host as host20 } from "@hermes/plugin-sdk";

// source/dictation-caret.js
var chip = '[contenteditable="false"]';
function textOf(fragment) {
  for (const node2 of fragment.querySelectorAll(chip)) node2.replaceWith("\uFFFC");
  for (const node2 of fragment.querySelectorAll("br")) node2.replaceWith("\n");
  return fragment.textContent;
}
function draftText(editor2) {
  return editor2.hasAttribute("data-empty") ? "" : textOf(editor2.cloneNode(true));
}
function draftSelection(editor2, range) {
  if (!range) {
    const selection = window.getSelection();
    range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  }
  if (!range || !editor2.contains(range.startContainer) || !editor2.contains(range.endContainer)) return null;
  if (editor2.hasAttribute("data-empty")) return { start: 0, end: 0 };
  const offset = (node2, index) => {
    const prefix = document.createRange();
    prefix.selectNodeContents(editor2);
    prefix.setEnd(node2, index);
    return textOf(prefix.cloneContents()).length;
  };
  return { start: offset(range.startContainer, range.startOffset), end: offset(range.endContainer, range.endOffset) };
}
function updateDictationAnchor(anchor, next, edit3) {
  const previous = anchor.text;
  if (next === previous) return;
  const delta = next.length - previous.length;
  let start;
  let oldEnd;
  if (edit3 && edit3.end + delta >= edit3.start && previous.slice(0, edit3.start) === next.slice(0, edit3.start) && previous.slice(edit3.end) === next.slice(edit3.end + delta)) {
    start = edit3.start;
    oldEnd = edit3.end;
  } else {
    start = 0;
    oldEnd = previous.length;
    let newEnd = next.length;
    while (start < oldEnd && start < newEnd && previous[start] === next[start]) start++;
    while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
  }
  const map = (offset) => offset < start ? offset : Math.max(offset, oldEnd) + delta;
  const touchedSelection = anchor.start < anchor.end && (start === oldEnd ? anchor.start <= start && start <= anchor.end : anchor.start < oldEnd && start < anchor.end);
  anchor.end = map(anchor.end);
  anchor.start = touchedSelection ? anchor.end : map(anchor.start);
  anchor.text = next;
}
function pointAt(editor2, offset) {
  const walker = document.createTreeWalker(editor2, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node2) {
      if (node2.parentElement?.closest(chip)) return NodeFilter.FILTER_REJECT;
      return node2.nodeType === Node.TEXT_NODE || node2.matches("br, " + chip) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
  });
  for (let node2 = walker.nextNode(); node2; node2 = walker.nextNode()) {
    if (node2.nodeType === Node.TEXT_NODE) {
      if (offset <= node2.length) return [node2, offset];
      offset -= node2.length;
    } else {
      const parent = node2.parentNode;
      if (offset <= 1) return [parent, [...parent.childNodes].indexOf(node2) + offset];
      offset--;
    }
  }
  return [editor2, editor2.childNodes.length];
}
function insertDictation(editor2, anchor, transcript4) {
  const { start, end, text } = anchor;
  const before = text[start - 1] || "";
  const after = text[end] || "";
  const leftSpace = /[^\s\uFFFC([{«„]/u.test(before) && !/^[,.!?;:…)}\]»”]/u.test(transcript4);
  const rightSpace = /[^\s\uFFFC,.!?;:…)}\]»”]/u.test(after);
  const insertion = (leftSpace ? " " : "") + transcript4 + (rightSpace ? " " : "");
  editor2.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.setStart(...pointAt(editor2, start));
  range.setEnd(...pointAt(editor2, end));
  selection.removeAllRanges();
  selection.addRange(range);
  return document.execCommand("insertText", false, insertion);
}

// source/dictation.js
var formSelector2 = 'form[data-slot="composer-root"]';
var editorSelector = '[data-slot="composer-rich-input"][contenteditable="true"]';
var hubSelector = '[data-slot="fan-menu-anchor"] > button:has(> .codicon-mic)';
var inputCell = '[class~="[grid-area:input]"]';
var captions = {
  ru: { record: "\u0413\u043E\u043B\u043E\u0441\u043E\u0432\u0430\u044F \u0434\u0438\u043A\u0442\u043E\u0432\u043A\u0430", stop: "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0434\u0438\u043A\u0442\u043E\u0432\u043A\u0443", cancel: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0434\u0438\u043A\u0442\u043E\u0432\u043A\u0443", starting: "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D\u0430\u2026", transcribing: "\u0420\u0430\u0441\u0448\u0438\u0444\u0440\u043E\u0432\u043A\u0430 \u0434\u0438\u043A\u0442\u043E\u0432\u043A\u0438\u2026", error: "\u0414\u0438\u043A\u0442\u043E\u0432\u043A\u0430 \u043D\u0435 \u0443\u0434\u0430\u043B\u0430\u0441\u044C", denied: "\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D\u0443", empty: "\u0420\u0435\u0447\u044C \u043D\u0435 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u043D\u0430", insert: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0434\u0438\u043A\u0442\u043E\u0432\u043A\u0443 \u0432 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A" },
  en: { record: "Voice dictation", stop: "Stop dictation", cancel: "Cancel dictation", starting: "Connecting microphone\u2026", transcribing: "Transcribing dictation\u2026", error: "Dictation failed", denied: "Microphone access denied", empty: "No speech detected", insert: "Could not insert dictation in the draft" }
};
var words2 = () => captions[document.documentElement.lang.toLowerCase().startsWith("ru") ? "ru" : "en"];
var formats = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg", "audio/wav"];
function composerTarget(form) {
  return form.closest("[data-floating-composer-target]")?.dataset.floatingComposerTarget ?? form.closest("[data-composer-target]")?.dataset.composerTarget;
}
function nativeVoice(form) {
  if (!form?.isConnected || form.closest("[data-pane-hidden], [inert]") || !form.getClientRects().length) return null;
  const editor2 = form.querySelector(editorSelector);
  if (!editor2) return null;
  for (let fiber = committedFiber(editor2); fiber; fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (typeof props?.onTranscribeAudio !== "function" || typeof props.state?.voice?.enabled !== "boolean") continue;
    if (!props.state.voice.enabled || props.disabled) return null;
    const target = composerTarget(form);
    const grid = editor2.closest(inputCell)?.parentElement;
    if (!target || !grid) return null;
    return {
      form,
      editor: editor2,
      grid,
      target,
      transcribe: props.onTranscribeAudio,
      limit: props.maxRecordingSeconds ?? 120,
      address: JSON.stringify([
        target,
        props.sessionId,
        props.queueSessionKey,
        host20.state.connectionId.get(),
        host20.state.profile.get(),
        target === "main" ? host20.state.activeSessionId.get() : null
      ])
    };
  }
  return null;
}
function nativeMenuOwner(item) {
  if (!item || item.getAttribute("data-disabled") !== null || !Object.values(captions).some((copy6) => item.textContent.trim() === copy6.record)) return null;
  const id2 = item.closest('[role="menu"]')?.id;
  return id2 ? document.querySelector(`${formSelector2} button[aria-controls="${CSS.escape(id2)}"]`) : null;
}
function createStrip(grid, abort, stop) {
  const strip = document.createElement("div");
  strip.setAttribute("data-hcv-dictation", "");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.setAttribute("data-hcv-dictation-cancel", "");
  cancel.addEventListener("click", abort);
  const wave = document.createElement("canvas");
  wave.setAttribute("aria-hidden", "true");
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  status.setAttribute("data-hcv-dictation-caption", "");
  const finish = document.createElement("button");
  finish.type = "button";
  finish.setAttribute("data-hcv-dictation-stop", "");
  finish.addEventListener("click", stop);
  strip.append(cancel, wave, status, finish);
  grid.append(strip);
  return { strip, cancel, wave, status, finish };
}
function startWaveform(canvas, stream) {
  const graphics = canvas.getContext("2d");
  if (!graphics) return () => {
  };
  let audio;
  let analyser;
  try {
    audio = new AudioContext();
    analyser = audio.createAnalyser();
    analyser.fftSize = 256;
    audio.createMediaStreamSource(stream).connect(analyser);
    void audio.resume().catch(() => {
    });
  } catch {
    analyser = null;
  }
  const samples = new Float32Array(256);
  const history2 = [];
  const motion2 = matchMedia("(prefers-reduced-motion: reduce)");
  const stillPattern = [0.3, 0.5, 1, 0.7, 0.4, 0.7];
  const step2 = 5;
  let lastSample = -Infinity;
  let lastFrame;
  let level = 0;
  let phase = 0;
  let frame;
  const paint = (now) => {
    if (analyser && now - lastSample >= 100) {
      lastSample = now;
      analyser.getFloatTimeDomainData(samples);
      const energy = samples.reduce((sum, sample) => sum + sample ** 2, 0);
      const rms = Math.sqrt(energy / samples.length);
      level = rms < 25e-4 ? 0 : Math.min(1, 8 * rms);
    }
    phase += Math.min(100, now - (lastFrame ?? now)) * 0.06;
    lastFrame = now;
    while (phase >= step2) {
      phase -= step2;
      history2.push(level);
      if (history2.length > 256) history2.shift();
    }
    frame = requestAnimationFrame(paint);
    const { clientWidth: width, clientHeight: height } = canvas;
    if (!width || !height) return;
    const scale = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
    }
    graphics.setTransform(scale, 0, 0, scale, 0, 0);
    graphics.clearRect(0, 0, width, height);
    graphics.fillStyle = getComputedStyle(canvas).color;
    const reduced = motion2.matches;
    for (let index = 0, x = width - 2 - (reduced ? 0 : phase); x > 0; index++, x -= step2) {
      const amplitude = reduced ? level * stillPattern[index % stillPattern.length] : history2.at(-1 - index) ?? 0;
      const fade = Math.min(1, Math.min(x, width - x - 2) / 20);
      const bar = 2 + amplitude * (0.88 * height - 2);
      graphics.globalAlpha = (amplitude ? 0.45 : 0.225) * fade * fade * (3 - 2 * fade);
      graphics.beginPath();
      graphics.roundRect(Math.round(x * scale) / scale, (height - bar) / 2, 2, bar, 1);
      graphics.fill();
    }
    graphics.globalAlpha = 1;
  };
  frame = requestAnimationFrame(paint);
  return () => {
    cancelAnimationFrame(frame);
    if (audio && audio.state !== "closed") void audio.close().catch(() => {
    });
  };
}
function styles4(active2) {
  const row2 = `${active2} [data-hcv-dictation]`;
  const surface2 = `${active2} [data-slot="composer-surface"]:has([data-hcv-dictation])`;
  const layout = "div:has(> [data-hcv-dictation])";
  const hub = `${surface2} button[data-hcv-dictation-hub]`;
  return `
@media (forced-colors: none) {
  ${surface2} { background-color: var(--hcv-composer); background-clip: padding-box; }
  ${surface2} [data-slot="composer-fade"] { border-radius: inherit; }
  ${surface2} ${layout} {
    grid-template-areas: "input input input" "menu dictation controls";
    grid-template-columns: auto minmax(28px, 1fr) auto;
    align-items: center; gap: 4px;
  }
  ${surface2}:not(:has(button[data-hcv-dictation-hub])) ${layout} {
    grid-template-areas: "input input" "dictation dictation" "menu controls";
    grid-template-columns: auto minmax(0, 1fr);
  }
  ${surface2} [class~="[grid-area:menu]"] { translate: none; align-self: center; }
  ${row2} { grid-area: dictation; display: flex; min-inline-size: 0; align-items: center; gap: 8px; color: var(--hcv-muted); }
  ${row2} button, ${hub} {
    display: grid; place-items: center; flex: none; inline-size: 28px; block-size: 28px; padding: 0;
    border-radius: 50%; color: var(--hcv-text); background: color-mix(in srgb, currentColor 6%, transparent);
  }
  ${row2} button:hover, ${hub}:hover { background: color-mix(in srgb, currentColor 13%, transparent); }
  ${row2} button:focus-visible, ${hub}:focus-visible { outline: 2px solid var(--hcv-focus); outline-offset: -2px; }
  ${row2} button::before, ${hub}::after { content: ''; }
  ${row2} [data-hcv-dictation-cancel]::before {
    inline-size: 14px; block-size: 14px; background: currentColor; mask: ${codexMask("close")} center / contain no-repeat;
  }
  ${row2} [data-hcv-dictation-stop]::before, ${hub}::after {
    inline-size: 16px; block-size: 16px; background: currentColor;
    mask: ${codexMask("dictationStop")} center / contain no-repeat;
  }
  ${hub}::before { display: none !important; }
  ${surface2}:has(button[data-hcv-dictation-hub]) [data-hcv-dictation-stop],
  ${row2}:not([data-state="recording"]) [data-hcv-dictation-stop],
  ${row2}[data-state="recording"] [data-hcv-dictation-caption],
  ${row2}:not([data-state="recording"]) canvas { display: none; }
  ${row2} canvas {
    display: block; flex: 1 1 0; inline-size: 0; min-inline-size: 0; block-size: 28px;
    color: var(--hcv-text);
  }
  ${row2} [data-hcv-dictation-caption] {
    min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px;
  }
  ${hub}[data-hcv-dictation-hub="transcribing"]::after {
    mask: ${codexMask("sidebarWorking")} center / contain no-repeat;
  }
  @media (prefers-reduced-motion: no-preference) {
    ${hub}[data-hcv-dictation-hub="transcribing"]::after { animation: hcv-sidebar-spin 2s steps(60, end) infinite; }
  }
}
`;
}
function registerDictation(ctx, active2) {
  const sheet = document.createElement("style");
  sheet.setAttribute("data-hcv-dictation-style", "");
  sheet.textContent = styles4(active2);
  document.head.append(sheet);
  const root = document.documentElement;
  const contrast = matchMedia("(forced-colors: none)");
  const selections = /* @__PURE__ */ new WeakMap();
  let current;
  let frame;
  const enabled = () => contrast.matches && root.matches(active2);
  function rememberSelection() {
    const editor2 = window.getSelection()?.anchorNode;
    const input = (editor2 instanceof Element ? editor2 : editor2?.parentElement)?.closest(editorSelector);
    const position2 = input && draftSelection(input);
    if (position2) selections.set(input, { ...position2, text: draftText(input) });
  }
  function valid(run) {
    const live = enabled() && nativeVoice(run.form);
    return live && live.address === run.address && live.editor === run.editor && live.grid === run.grid;
  }
  function restoreHub(run) {
    if (!run.hub) return;
    const { button: button2, label, pressed } = run.hub;
    button2.removeAttribute("data-hcv-dictation-hub");
    for (const [key, value] of [["aria-label", label], ["aria-pressed", pressed]]) {
      if (value === null) button2.removeAttribute(key);
      else button2.setAttribute(key, value);
    }
    run.hub = null;
  }
  function paint(run) {
    const copy6 = words2();
    const button2 = run.form.querySelector(hubSelector);
    if (run.hub?.button !== button2) {
      restoreHub(run);
      if (button2) run.hub = { button: button2, label: button2.getAttribute("aria-label"), pressed: button2.getAttribute("aria-pressed") };
    }
    if (button2) {
      button2.dataset.hcvDictationHub = run.phase;
      button2.setAttribute("aria-label", run.phase === "transcribing" ? copy6.transcribing : copy6.stop);
      button2.setAttribute("aria-pressed", "true");
    }
    const { strip, cancel: cancel2, status, finish } = run.ui;
    strip.dataset.state = run.phase;
    cancel2.setAttribute("aria-label", copy6.cancel);
    cancel2.title = copy6.cancel;
    finish.setAttribute("aria-label", copy6.stop);
    finish.title = copy6.stop;
    const caption = copy6[run.phase] || copy6.record;
    if (status.textContent !== caption) status.textContent = caption;
  }
  function release(run) {
    clearTimeout(run.timeout);
    run.stopWaveform?.();
    run.stopWaveform = null;
    run.stream?.getTracks().forEach((track) => track.stop());
  }
  function cancel(run = current) {
    if (!run || run !== current) return;
    current = null;
    run.observer.disconnect();
    if (run.recorder) {
      run.recorder.onstop = null;
      run.recorder.onerror = null;
      if (run.recorder.state !== "inactive") run.recorder.stop();
    }
    release(run);
    restoreHub(run);
    run.ui.strip.remove();
  }
  function updateAnchor(run) {
    const next = draftText(run.editor);
    updateDictationAnchor(run.anchor, next, run.edit);
    run.edit = null;
  }
  async function transcribe(run) {
    release(run);
    if (current !== run || !valid(run)) return cancel(run);
    run.phase = "transcribing";
    paint(run);
    try {
      const audio = new Blob(run.chunks, { type: run.recorder.mimeType || run.chunks[0]?.type });
      const text = audio.size ? (await run.transcribe(audio)).trim() : "";
      if (current !== run || !valid(run)) return;
      if (text) {
        updateAnchor(run);
        if (!insertDictation(run.editor, run.anchor, text)) throw new Error(words2().insert);
      } else host20.notify({ kind: "warning", title: words2().empty });
    } catch (error) {
      if (current === run && valid(run)) host20.notifyError(error, words2().error);
    } finally {
      cancel(run);
    }
  }
  function stop(run) {
    if (current !== run || run.phase === "transcribing") return;
    if (run.phase === "starting" || !valid(run)) return cancel(run);
    clearTimeout(run.timeout);
    run.phase = "transcribing";
    paint(run);
    if (run.recorder.state !== "inactive") run.recorder.stop();
  }
  async function record(run) {
    try {
      const permitted = await window.hermesDesktop?.requestMicrophoneAccess?.();
      if (permitted === false) throw new Error(words2().denied);
      if (current !== run || !valid(run)) return cancel(run);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (current !== run || !valid(run)) {
        stream.getTracks().forEach((track) => track.stop());
        return cancel(run);
      }
      run.stream = stream;
      const mimeType = formats.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = run.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : void 0);
      recorder.ondataavailable = (event) => {
        if (event.data.size) run.chunks.push(event.data);
      };
      recorder.onstop = () => void transcribe(run);
      recorder.onerror = (event) => {
        if (current !== run) return;
        cancel(run);
        host20.notifyError(event.error, words2().error);
      };
      recorder.start();
      run.phase = "recording";
      paint(run);
      run.stopWaveform = startWaveform(run.ui.wave, stream);
      run.timeout = window.setTimeout(() => stop(run), Math.min(600, Math.max(1, run.limit)) * 1e3);
    } catch (error) {
      if (current !== run) return;
      cancel(run);
      host20.notifyError(error, words2().error);
    }
  }
  function toggle2(form) {
    if (!enabled() || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return false;
    if (current?.form === form) {
      stop(current);
      return true;
    }
    const voice = nativeVoice(form);
    if (!voice) return false;
    cancel();
    const { editor: editor2, grid } = voice;
    const text = draftText(editor2);
    const selection = draftSelection(editor2);
    const anchor = selection ? { ...selection, text } : { ...selections.get(editor2) };
    if (anchor.text === void 0) Object.assign(anchor, { text, start: text.length, end: text.length });
    else updateDictationAnchor(anchor, text);
    const run = current = { ...voice, anchor, phase: "starting", chunks: [] };
    run.ui = createStrip(grid, () => cancel(run), () => stop(run));
    run.observer = new MutationObserver(() => updateAnchor(run));
    run.observer.observe(editor2, { childList: true, characterData: true, subtree: true });
    paint(run);
    void record(run);
    return true;
  }
  function refresh() {
    frame = 0;
    if (!current) return;
    if (!valid(current)) cancel();
    else paint(current);
  }
  const schedule = () => {
    if (current && !frame) frame = requestAnimationFrame(refresh);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-hermes-theme", "data-hermes-codex-visual", "data-pane-hidden", "contenteditable", "inert", "lang"]
  });
  const off = [host20.state.activeSessionId, host20.state.connectionId, host20.state.profile].map((state) => state.listen(schedule));
  contrast.addEventListener("change", schedule);
  ctx.addEventListener(document, "selectionchange", rememberSelection);
  ctx.addEventListener(document, "pointerdown", rememberSelection, true);
  ctx.addEventListener(document, "beforeinput", (event) => {
    if (event.target === current?.editor) {
      current.edit = draftSelection(current.editor, event.getTargetRanges?.()[0]);
    }
  }, true);
  ctx.addEventListener(document, "input", (event) => {
    if (event.target === current?.editor) updateAnchor(current);
  });
  ctx.addEventListener(document, "click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (current && event.target.closest('button:is([aria-label="\u041D\u0430\u0447\u0430\u0442\u044C \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0439 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440"], [aria-label="Start voice conversation"])')) cancel();
    const item = event.target.closest('[role="menuitemcheckbox"]');
    const trigger = item && nativeMenuOwner(item);
    const button2 = event.target.closest(hubSelector) || trigger;
    if (!button2 || button2.disabled || !toggle2(button2.closest(formSelector2))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    item?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  }, true);
  ctx.addEventListener(window, "hermes:composer-dictation", (event) => {
    const form = [...document.querySelectorAll(formSelector2)].find(
      (node2) => composerTarget(node2) === event.detail?.target && nativeVoice(node2)
    );
    if (form && toggle2(form)) event.stopImmediatePropagation();
  }, true);
  ctx.addEventListener(window, "hermes:composer-voice-toggle", () => cancel(), true);
  ctx.addEventListener(document, "keydown", (event) => {
    if (current && event.target === current.editor && event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !current.form.querySelector('[data-slot="composer-completion-drawer"]')) cancel();
  }, true);
  ctx.addEventListener(document, "submit", (event) => {
    if (event.target === current?.form) cancel();
  }, true);
  ctx.addEventListener(window, "pagehide", () => cancel());
  ctx.onDispose(() => {
    cancel();
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
    contrast.removeEventListener("change", schedule);
    for (const unsubscribe of off) unsubscribe();
    sheet.remove();
  });
}

// source/plugin.js
var id = "hermes-codex-visual";
var marker = `data-${id}`;
var themeName = "codex-workspace";
var active = `:root[${marker}][data-hermes-theme="${themeName}"]`;
var sidebar = `${active} [data-slot="sidebar"][data-tour="sessions-sidebar"]`;
var chat = `${active} [data-chat-surface]`;
var dock = `${chat} [data-slot="composer-dock"]`;
var composerSurface = `${dock} [data-slot="composer-surface"]`;
var docked = `${dock}:not([data-popped-out])`;
var light = {
  rail: "#f2f2f2",
  sidebar: "#f6f6f6",
  chat: "#ffffff",
  panel: "#fafafa",
  summary: "#f5f5f5",
  menu: "#ffffff",
  bubble: "#ededed",
  composer: "#f5f5f5",
  hover: "#eeeeee",
  selected: "#e5e5e5",
  stroke: "#d5d5d5",
  text: "#202020",
  muted: "#5e5e5e",
  focus: "#656565",
  action: "#242424",
  ink: "#ffffff",
  unread: "#0766cb",
  error: "#aa2626",
  errorInk: "#ffffff"
};
var dark = {
  rail: "#121212",
  sidebar: "#161616",
  chat: "#181818",
  panel: "#202020",
  summary: "#222222",
  menu: "#2d2d2d",
  bubble: "#222222",
  composer: "#363636",
  hover: "#252525",
  selected: "#292929",
  stroke: "#393939",
  text: "#e8e8e8",
  muted: "#a9a9a9",
  focus: "#a6a6a6",
  action: "#e8e8e8",
  ink: "#181818",
  unread: "#339cf5",
  error: "#f28080",
  errorInk: "#210909"
};
function themeColors(palette) {
  return {
    background: palette.chat,
    foreground: palette.text,
    card: palette.panel,
    cardForeground: palette.text,
    muted: palette.hover,
    mutedForeground: palette.muted,
    popover: palette.menu,
    popoverForeground: palette.text,
    primary: palette.action,
    primaryForeground: palette.ink,
    secondary: palette.selected,
    secondaryForeground: palette.text,
    accent: palette.selected,
    accentForeground: palette.text,
    border: palette.stroke,
    input: palette.stroke,
    ring: palette.focus,
    midground: palette.focus,
    midgroundForeground: palette.ink,
    composerRing: palette.focus,
    destructive: palette.error,
    destructiveForeground: palette.errorInk,
    sidebarBackground: palette.sidebar,
    sidebarBorder: palette.stroke,
    userBubble: palette.bubble,
    userBubbleBorder: palette.bubble
  };
}
var theme = {
  name: themeName,
  label: "Codex",
  description: "\u0421\u0432\u0435\u0442\u043B\u043E\u0435 \u0438 \u0442\u0451\u043C\u043D\u043E\u0435 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435 Codex",
  colors: themeColors(light),
  darkColors: themeColors(dark)
};
function paletteVariables({ error, errorInk, ...colors }) {
  return Object.entries(colors).map(([name, color]) => `--hcv-${name}: ${color};`).join("\n    ");
}
var newChatLabel = '[data-tour="sidebar-nav-new-session"]';
var chevron = "svg.tabler-icon-chevron-down";
var sidebarMenuButton = `${sidebar} [data-sidebar="menu-button"]`;
var sidebarNav = `${sidebarMenuButton}:has(> [data-tour^="sidebar-nav-"])`;
var navButton = (name) => `${sidebarMenuButton}:has(> [data-tour="sidebar-nav-${name}"])`;
var localizedNewChat = `${navButton("new-session")}:is(:lang(ru), :lang(en))`;
var titleButton = `${active} [data-titlebar-cluster] button[data-size="icon-titlebar"]`;
var foldOnly = `${composerSurface} button:has(> ${chevron}):not(:has(> :not(${chevron})))`;
var rowBody = 'button[data-slot="row-button"]';
var projectChatRow = `${sidebar} [data-sessions-mode] .row-hover:has(> ${rowBody} .hover-marquee-inner)`;
var runningDot = '[role="status"]:is([class~="bg-(--ui-accent)"], [class~="border-(--ui-accent)"])';
var unreadDot = '[role="status"][class~="bg-(--ui-success)"]';
var trailingDot = `:is(${runningDot}, ${unreadDot})`;
var busyRowState = `:is(:has(> ${rowBody} ${runningDot}), [data-working="true"]:has(> .arc-row))`;
var unreadRowState = `:has(> ${rowBody} ${unreadDot})`;
var activeProjectChatRow = `${projectChatRow}:is(${busyRowState}, ${unreadRowState})`;
var sidebarStatus = `${sidebar} [data-hcv-project-status]:not([hidden])`;
var sidebarWorking = `${sidebar} [data-hcv-project-status="working"]:not([hidden])`;
var workingChatIcon = `${projectChatRow}${busyRowState}::after`;
var changedFiles2 = `${chat} [data-slot="aui_changed-files"]`;
var fileSummary = `${changedFiles2}[data-hcv-file-card]`;
var assistantRoot = `${chat} [data-slot="aui_assistant-message-root"]`;
var elapsedBar = `${chat} [data-hcv-turn-line]`;
var liveTurn = `${chat} :is([data-slot="aui_response-loading"], [data-slot="aui_turn-activity"][data-state="active"], [data-hcv-live-turn])`;
var thinkingLabel = `${liveTurn} > [data-hcv-thinking]`;
var thinkingSweep = `${thinkingLabel} > [data-hcv-thinking-sweep]`;
var arrow = codexMask("right");
var glyphs3 = [
  [navButton("new-session"), ".codicon-robot", "newChat"],
  [navButton("capabilities"), ".codicon-symbol-misc", "plugins"],
  [navButton("messaging"), ".codicon-comment", "messages"],
  [navButton("artifacts"), ".codicon-files", "artifacts"],
  [navButton("cron"), ".codicon-watch", "schedule"],
  [titleButton, ".codicon-layout-sidebar-left", "sidebar"],
  [titleButton, ".codicon-layout-sidebar-right", "sidebarRight", true],
  [foldOnly, chevron, "sliders"],
  [`${composerSurface} button`, ":is(.codicon-mic, svg.tabler-icon-microphone)", "mic"],
  [`${composerSurface} button[type="submit"]`, ".codicon-arrow-up", "send"]
];
function iconRules() {
  return glyphs3.map(([button2, nativeIcon, icon8, flip]) => {
    const selector = `${button2}:has(> ${nativeIcon})`;
    return `
  ${selector} > ${nativeIcon} { display: none; }
  ${selector}::before {
    content: '';
    display: block;
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    background: currentColor;
    mask: ${codexMask(icon8)} center / contain no-repeat;
    ${flip ? "scale: -1 1;" : ""}
    pointer-events: none;
  }`;
  }).join("\n");
}
var styles5 = `
@media (forced-colors: none) {
  ${active} {
    ${paletteVariables(light)}
    --hcv-ui-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --ui-bg-chrome: var(--hcv-rail);
    --ui-bg-sidebar: var(--hcv-sidebar);
    --ui-bg-editor: var(--hcv-chat);
    --ui-bg-elevated: var(--hcv-menu);
    --ui-bg-card: var(--hcv-panel);
    --ui-bg-input: var(--hcv-composer);
    --ui-surface-background: var(--hcv-chat);
    --ui-sidebar-surface-background: var(--hcv-sidebar);
    --ui-chat-surface-background: var(--hcv-chat);
    --ui-widget-surface-background: var(--hcv-panel);
    --ui-chat-bubble-background: var(--hcv-bubble);
    --ui-row-hover-background: var(--hcv-hover);
    --ui-row-active-background: var(--hcv-selected);
    --ui-row-open-background: var(--hcv-hover);
    --ui-control-hover-background: var(--hcv-hover);
    --ui-control-active-background: var(--hcv-selected);
    --ui-text-primary: var(--hcv-text);
    --ui-text-secondary: var(--hcv-muted);
    --ui-text-tertiary: var(--hcv-muted);
    --ui-accent: var(--hcv-focus);
    --ui-accent-secondary: var(--hcv-action);
    --ui-stroke-secondary: var(--hcv-stroke);
    --ui-stroke-tertiary: var(--hcv-stroke);
    --ui-selection-background: color-mix(in srgb, var(--hcv-text) 25%, transparent);
    --dt-background: var(--hcv-rail);
    --dt-card: var(--hcv-panel);
    --dt-popover: var(--hcv-menu);
    --dt-user-bubble: var(--hcv-bubble);
    --sidebar-edge-border: var(--hcv-stroke);
    --chrome-action-hover: var(--hcv-hover);
    --pane-tab-active-bg: var(--hcv-selected);
    --pane-tab-active-accent: transparent;
  }

  ${active}[data-hermes-mode="dark"] {
    ${paletteVariables(dark)}
  }

  ${active} :is(input, textarea)::placeholder {
    color: var(--hcv-muted);
    opacity: 1;
  }

  ${active} :is([data-titlebar-cluster], [data-hcv-sidebar-shell], [data-chat-surface]) {
    font-family: var(--hcv-ui-font);
  }

  ${active} :is([data-sidebar="menu-button"], [data-slot="pane-tab"], [data-slot="dropdown-menu-item"], [data-slot="dropdown-menu-sub-trigger"], [data-slot="dropdown-menu-radio-item"], [data-slot="dropdown-menu-checkbox-item"], [data-tour="overlay-nav"] button, [data-titlebar-cluster] [data-size="icon-titlebar"]),
  ${sidebar} .row-hover {
    border-radius: 8px;
  }

  /* Codex NavItem uses the same ghost fill for hover and the selected row. */
  ${sidebarNav} {
    --ui-control-hover-background: var(--hcv-selected);
    border: 0;
    border-radius: 10px;
  }

  @supports (corner-shape: superellipse(1.5)) {
    ${sidebarNav} { border-radius: 12.5px; corner-shape: superellipse(1.5); }
  }

  ${sidebarNav}:focus-visible {
    outline: 2px solid light-dark(#339cff, rgb(51 156 255 / 70%));
    outline-offset: -2px;
    box-shadow: none;
  }

  ${active} [data-slot="pane-tab"]:hover {
    background-color: var(--hcv-hover);
  }

  ${active} [data-slot="pane-tab"][data-active="true"] {
    background-color: var(--hcv-selected);
  }

  ${localizedNewChat} > ${newChatLabel} { display: none; }
  ${navButton("new-session")} > [data-slot="kbd-group"] { display: none; }
  ${navButton("new-session")}:lang(ru)::after { content: '\u041D\u043E\u0432\u044B\u0439 \u0447\u0430\u0442'; }
  ${navButton("new-session")}:lang(en)::after { content: 'New chat'; }
  ${localizedNewChat}::after { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }

  ${projectChatRow} > ${rowBody} span[aria-hidden="true"][class~="size-1"][class~="rounded-full"] {
    opacity: 0;
  }
  ${projectChatRow} [data-row-actions] span:has(> time[datetime]) { display: none; }
  ${projectChatRow} [data-row-actions]:has(time[datetime]) > button[aria-haspopup="menu"] { position: static; }
  /* Keep native labels available to assistive technology. Paint the two
     relocated statuses on the right without moving any click targets. */
  ${activeProjectChatRow} { padding-inline-end: 23px; }
  ${activeProjectChatRow} > ${rowBody} ${trailingDot} { opacity: 0; }
  ${projectChatRow}${busyRowState} > .arc-row { display: none; }
  ${activeProjectChatRow}::after {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-end: 7px;
    translate: 0 -50%;
    box-sizing: border-box;
    inline-size: 10px;
    block-size: 10px;
    border-radius: 50%;
    content: '';
    pointer-events: none;
  }
  ${sidebarStatus} {
    display: grid; place-items: center; flex: none;
    inline-size: 20px; block-size: 20px; pointer-events: none;
  }
  ${sidebarWorking}::before { content: ''; }
  ${workingChatIcon}, ${sidebarWorking}::before {
    inline-size: 14px; block-size: 14px;
    background: color-mix(in srgb, var(--hcv-text) 70%, transparent);
    mask: ${codexMask("sidebarWorking")} center / contain no-repeat;
    animation: hcv-sidebar-spin 2s steps(60, end) infinite;
  }
  ${workingChatIcon} { inset-inline-end: 8px; }
  ${sidebar} [data-hcv-project-status="unread"]:not([hidden])::before {
    content: ''; inline-size: 7px; block-size: 7px; border-radius: 50%; background: var(--hcv-unread);
  }
  ${projectChatRow}${unreadRowState}:not(${busyRowState})::after {
    background: var(--hcv-unread);
    scale: .75;
  }
  @keyframes hcv-sidebar-spin { to { rotate: 1turn; } }
  @media (prefers-reduced-motion: reduce) {
    ${workingChatIcon}, ${sidebarWorking}::before { animation: none; }
  }

  ${chat} {
    /* Codex desktop's 48rem thread body has a 16px inset on each side. */
    --composer-width: 736px;
    --message-text-indent: 0px;
    --conversation-text-font-size: 13px;
    --conversation-tool-font-size: 12px;
    --conversation-line-height: 21px;
    --conversation-turn-gap: 18px;
    --scaffold-block-gap: 9px;
    --paragraph-gap: 10px;
  }

  /* Match the dock's own 16px inset without touching its scroll clearance. */
  ${chat} [data-slot="aui_thread-content"] {
    max-inline-size: calc(var(--composer-width) + 32px);
    padding-inline: 16px;
  }

  ${elapsedBar} {
    inline-size: 100%;
    display: flex;
    align-items: center;
    gap: 5px;
    min-block-size: 27px;
    margin-block: 2px 5px;
    padding: 1px 0 4px;
    border-block-end: 1px solid color-mix(in srgb, var(--hcv-muted) 18%, transparent);
    color: var(--hcv-muted);
    font-size: 13px;
    line-height: 1.4;
    text-align: start;
    font-variant-numeric: tabular-nums;
  }
  ${chat} button[data-hcv-turn-line] { cursor: pointer; }
  ${chat} button[data-hcv-turn-line]:hover { color: var(--hcv-text); }
  ${chat} :is(button[data-hcv-turn-line], [data-hcv-files-more]):focus-visible {
    outline: 1px solid var(--hcv-focus);
    outline-offset: -2px;
  }
  ${chat} [data-hcv-turn-folded] [data-hcv-turn-step],
  ${chat} [data-hcv-turn-summary] [data-slot="aui_turn-duration"] { display: none !important; }
  ${chat} :is(button[data-hcv-turn-line], [data-hcv-files-more])::after {
    content: '';
    inline-size: 12px;
    block-size: 12px;
    flex: none;
    background: currentColor;
    mask: ${arrow} center / contain no-repeat;
    transition: transform 150ms cubic-bezier(.23, 1, .32, 1);
  }
  ${chat} :is(button[data-hcv-turn-line], [data-hcv-files-more])[aria-expanded="true"]::after {
    transform: rotate(90deg);
  }

  ${liveTurn} {
    display: flex;
    align-items: center;
    gap: 6px;
    min-block-size: 18px;
    margin-block-start: 9px;
    color: var(--hcv-muted);
    font-variant-numeric: tabular-nums;
  }
  ${liveTurn} > .dither { display: none; }
  ${thinkingLabel} {
    position: relative;
    display: inline-block;
    flex: none;
    overflow: hidden;
    white-space: nowrap;
    user-select: none;
    font-size: var(--conversation-text-font-size);
    line-height: calc(var(--conversation-text-font-size) + 8px);
    color: color-mix(in srgb, var(--hcv-text) 38.5%, transparent);
  }
  ${thinkingSweep} {
    position: absolute; inset: 0 auto 0 0; inline-size: 100%; overflow: hidden; pointer-events: none;
    transform: translateX(-50%);
    mask-image: linear-gradient(90deg, transparent 0%, black 20% 30%, transparent 50% 100%);
  }
  ${thinkingSweep}::before {
    content: attr(data-hcv-thinking-sweep);
    display: block; inline-size: 100%; overflow: hidden;
    color: #ffffffbf;
    transform: translateX(50%);
  }
  /* Codex's first sweep waits 600 ms, then runs for one second every four. */
  @media (prefers-reduced-motion: no-preference) {
    ${thinkingSweep} { animation: hcv-thinking-sweep 4s .6s infinite; }
    ${thinkingSweep}::before { animation: hcv-thinking-highlight 4s .6s infinite; }
  }
  @keyframes hcv-thinking-sweep {
    0% { transform: translateX(-50%); animation-timing-function: steps(48, end); }
    25%, 100% { transform: translateX(125%); }
  }
  @keyframes hcv-thinking-highlight {
    0% { transform: translateX(50%); animation-timing-function: steps(48, end); }
    25%, 100% { transform: translateX(-125%); }
  }
  ${liveTurn} > :is([data-hcv-live-time], [aria-hidden="true"]:not(.dither, [data-hcv-thinking])) {
    color: var(--hcv-muted);
    font-size: 10px;
    line-height: 1.2;
  }
  @media (prefers-reduced-motion: reduce) {
    ${chat} :is(button[data-hcv-turn-line], [data-hcv-files-more])::after { transition: none; }
  }

  ${changedFiles2} {
    border: 1px solid var(--hcv-stroke);
    border-radius: 10px;
    background: color-mix(in srgb, var(--hcv-summary) 45%, var(--hcv-chat));
    margin-block-start: 14px;
    padding: 0;
    font-size: 13px;
  }
  ${changedFiles2} > div:first-child {
    min-block-size: 58px;
    flex-wrap: wrap;
    column-gap: 10px;
    border-block-end: 1px solid var(--hcv-stroke);
    border-start-start-radius: 9px;
    border-start-end-radius: 9px;
    background: var(--hcv-summary);
    padding: 10px;
    font-weight: 600;
  }
  ${changedFiles2} > div:first-child::before {
    content: '';
    flex: none;
    inline-size: 36px;
    block-size: 36px;
    border-radius: 9px;
    background: var(--hcv-chat);
    background-image: ${codexMask("changes", "#5e5e5e")};
    background-size: 18px 18px;
    background-repeat: no-repeat;
    background-position: center;
  }
  ${changedFiles2} > div:first-child > button {
    border: 1px solid var(--hcv-stroke);
    border-radius: 8px;
    background: var(--hcv-hover);
    padding: 4px 8px 5px;
    color: var(--hcv-text);
    font-weight: 400;
  }
  ${changedFiles2} > div:first-child > button:hover { background: var(--hcv-selected); }
  ${fileSummary} [data-hcv-file-native-title] { display: none; }
  ${fileSummary} [data-hcv-files-heading] { display: grid; flex: 1; min-inline-size: 0; gap: 2px; }
  ${fileSummary} [data-hcv-files-totals] {
    display: flex;
    gap: 3px;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.25;
    font-variant-numeric: tabular-nums;
  }
  ${fileSummary} [data-hcv-files-totals]:not(:has(> :not(:empty))) { display: none; }
  ${fileSummary} [data-hcv-files-added] { color: var(--ui-green); }
  ${fileSummary} [data-hcv-files-removed] { color: var(--ui-red); }
  ${fileSummary} [data-hcv-file-review] { font-size: 0; }
  ${fileSummary} [data-hcv-file-review]::after { content: attr(data-hcv-file-review); font-size: 12px; }
  ${fileSummary} > div:first-child > [data-hcv-files-checkpoint] {
    display: flex;
    align-items: center;
    gap: 4px;
    border-color: transparent;
    background: transparent;
    font-size: 12px;
  }
  ${fileSummary} [data-hcv-files-checkpoint]::after {
    content: '';
    inline-size: 13px;
    block-size: 13px;
    background: currentColor;
    mask: ${codexMask("checkpoint")} center / contain no-repeat;
  }
  ${changedFiles2} > div:nth-child(2) { margin: 0; padding: 0; }
  ${changedFiles2} > div:nth-child(2) > button { min-block-size: 32px; border-radius: 0; padding: 4px 10px; }
  ${fileSummary}[data-hcv-files-foldable]:not([data-hcv-files-open]) > div:nth-child(2) > button:nth-of-type(n + 4) { display: none; }
  ${fileSummary} > div:nth-child(2) { max-block-size: min(60vh, 384px) !important; }
  ${fileSummary} [data-hcv-files-more] {
    display: flex;
    inline-size: 100%;
    min-block-size: 32px;
    align-items: center;
    gap: 6px;
    border-block-start: 1px solid color-mix(in srgb, var(--hcv-stroke) 65%, transparent);
    border-end-start-radius: 9px;
    border-end-end-radius: 9px;
    padding: 4px 10px;
    text-align: start;
    background: var(--hcv-summary);
    cursor: pointer;
  }
  ${fileSummary} [data-hcv-files-more]:hover { background: var(--hcv-hover); }
  ${assistantRoot}:has(> [data-slot="aui_changed-files"]) > :has([data-slot="aui_msg-actions"]) { order: 1; }
  ${assistantRoot}:has(> [data-slot="aui_changed-files"]) [data-slot="aui_msg-actions"] { margin-inline-end: auto; }

  ${chat} [data-slot="aui_user-bubble-actions"] {
    inline-size: fit-content;
    min-inline-size: min(92px, 100%);
    max-inline-size: 70%;
    margin-inline-start: auto;
  }

  ${chat} [data-slot="aui_user-bubble-actions"] .composer-human-message {
    border-color: transparent;
    border-radius: 15px;
    padding-block: 9px;
  }

  ${docked} [data-slot="composer-root"] {
    --composer-fill: var(--hcv-composer);
    border-radius: 22px;
  }

  ${composerSurface} button > ${chevron},
  ${composerSurface} [data-slot="fan-menu-anchor"] > .codicon-chevron-up {
    display: none;
  }

  ${composerSurface} button:has(> ${chevron}) {
    border-radius: 8px;
  }

  ${composerSurface} button:has(> ${chevron}):not(:disabled):hover {
    background-color: var(--hcv-selected);
  }

  ${composerSurface} button[type="submit"] {
    border-radius: 50%;
  }

  ${composerSurface} button[type="submit"]:not(:disabled) {
    background-color: var(--hcv-action);
    color: var(--hcv-ink);
  }

  ${composerSurface} button[type="submit"]:not(:disabled):hover {
    background-color: color-mix(in srgb, var(--hcv-action) 85%, var(--hcv-ink));
  }

  ${iconRules()}
}
`;
var plugin_default = {
  id,
  name: "Hermes Codex Visual",
  description: "An independent Codex-style workspace theme for Hermes Desktop.",
  defaultEnabled: false,
  register(ctx) {
    ctx.register({ id: "theme", area: THEMES_AREA, data: theme });
    const root = document.documentElement;
    const sheet = document.createElement("style");
    sheet.setAttribute(marker, "");
    sheet.textContent = styles5;
    ctx.onDispose(() => {
      sheet.remove();
      if (!document.head.querySelector(`style[${marker}]`)) {
        root.removeAttribute(marker);
      }
    });
    document.head.append(sheet);
    root.setAttribute(marker, "");
    registerWorkspaceChrome(ctx, themeName);
    const roster = registerSubagents(ctx, active);
    const localEnvironment = registerLocalEnvironment(ctx, active);
    registerWorkspaceCard(ctx, themeName, roster, localEnvironment);
    registerTurnExperience(ctx, active);
    registerChatDisplay(ctx, active);
    registerChatResources(ctx, active);
    registerInterface(ctx, active);
    registerSettingsStyle(ctx, active);
    registerRemainingSurfaces(ctx, active);
    registerShellSurfaces(ctx, active);
    registerSessionTabs(ctx, active);
    registerContextMeter(ctx, active);
    registerComposer(ctx, active);
    registerDraftSetup(ctx, active, localEnvironment);
    registerDictation(ctx, active);
  }
};
export {
  plugin_default as default
};
