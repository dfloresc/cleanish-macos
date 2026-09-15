# Cleanish

Cleanish is a free, open-source disk cleaner and space inspector for macOS. It shows what is using space on your Mac and helps you remove caches, logs, leftovers of uninstalled apps and large files, always with a preview first and sending items to the Trash by default.

Built with Electron, React, TypeScript and Tailwind CSS. Available in English and Spanish.

## Features

- **Dashboard**: disk usage and a size breakdown of your home folder.
- **Smart Scan**: application caches, logs and leftovers in a single pass.
- **Applications**: uninstall apps together with the associated data you choose.
- **System Junk**: application caches, user logs, the Trash and optional developer caches (npm, pip, Homebrew, Xcode…).
- **Large Files**: find big files in a folder, optionally including its subfolders.
- **Space Explorer**: browse folders sorted by size and delete what you select.
- **Leftovers**: possible leftovers of apps that are no longer installed.

## Safety

- Nothing is selected by default, and every cleanup shows the exact list of items before anything is removed.
- Items are moved to the Trash. Permanent deletion is disabled by default. When enabled in Settings, it still has to be chosen and confirmed for each operation, and it is required to remove items that are already in the Trash.
- macOS components, credentials (`~/.ssh`, keychains…), top-level folders such as `~/Documents` or `~/Library`, and the contents of app bundles are protected. Symbolic links are never followed.
- Items that change between the preview and the cleanup are skipped.

## Requirements

- macOS
- [Node.js](https://nodejs.org) 20.19+ or 22.12+ (includes npm)

## Run from source

```bash
git clone https://github.com/dfloresc/cleanish-macos.git
cd cleanish-macos
npm install
npm run dev
```

`npm run dev` starts the app with hot reload. To run a production build without packaging it:

```bash
npm run build
npm start
```

## Build the macOS app

```bash
npm run dist
```

This type-checks the project, compiles it and packages it with electron-builder for the architecture of your Mac. The output is written to `dist/`:

- `dist/cleanish-<version>-<arch>.dmg`
- `dist/cleanish-<version>-<arch>.zip`
- `dist/mac-<arch>/Cleanish.app`

Open the DMG and drag **Cleanish** to **Applications**. To build for another architecture, pass the electron-builder flag, for example `npm run dist -- --x64` or `npm run dist -- --universal`.

The app is not code-signed or notarized. A build made on your own Mac opens normally. If you copy it to another Mac, macOS blocks the first launch; allow it in **System Settings → Privacy &amp; Security → Open Anyway**.

## Permissions

Some locations, such as the data containers of other apps, can only be read with **Full Disk Access**. Cleanish works without it and shows a banner when it is missing. You can grant it in **System Settings → Privacy &amp; Security → Full Disk Access**.

## Commands


| Command                 | Description                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `npm run dev`           | Start the app in development mode with hot reload                                             |
| `npm run build`         | Compile the main, preload and renderer bundles into `out/`                                    |
| `npm start`             | Run the compiled bundles from `out/`                                                          |
| `npm run typecheck`     | Type-check the main process and the renderer                                                  |
| `npm test`              | Run the unit tests inside a temporary home folder                                             |
| `npm run dist`          | Type-check, build and package the `.dmg` and `.zip`                                           |
| `npm run generate-icon` | Regenerate `resources/icon.png` and `resources/icon.icns` from `src/renderer/public/icon.svg` |


## License

[MIT](LICENSE) © Daniel Flores Castillo