const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = path.join(__dirname, '..')
const svg = path.join(root, 'src', 'renderer', 'public', 'icon.svg')

const VARIANTS = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png']
]

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    transparent: true,
    webPreferences: { offscreen: true }
  })
  await win.loadFile(svg)
  await new Promise((r) => setTimeout(r, 400))
  const image = await win.capturePage()
  const png = image.toPNG()
  fs.writeFileSync(path.join(root, 'resources', 'icon.png'), png)

  const work = path.join(root, 'resources', '.icon-build')
  fs.rmSync(work, { recursive: true, force: true })
  fs.mkdirSync(work, { recursive: true })
  const master = path.join(work, 'master.png')
  fs.writeFileSync(master, png)

  const iconset = path.join(work, 'icon.iconset')
  fs.mkdirSync(iconset, { recursive: true })
  for (const [size, name] of VARIANTS) {
    execFileSync('sips', ['-z', String(size), String(size), master, '--out', path.join(iconset, name)], {
      stdio: 'ignore'
    })
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'resources', 'icon.icns')])
  fs.rmSync(work, { recursive: true, force: true })

  console.log('resources/icon.png + icon.icns generated (transparent)')
  app.exit(0)
})
