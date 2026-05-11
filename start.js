// Launcher: clears ELECTRON_RUN_AS_NODE so the Electron runtime starts properly,
// then spawns electron with this project as the entry point.
const { spawn } = require('child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [__dirname], {
  stdio: 'inherit',
  env,
  windowsHide: false,
});

child.on('close', (code) => process.exit(code ?? 0));
