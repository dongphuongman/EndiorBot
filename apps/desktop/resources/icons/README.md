# EndiorBot Icons

This directory should contain the application icons in various formats:

## Required Files

| File | Size | Platform | Purpose |
|------|------|----------|---------|
| `icon.icns` | Various | macOS | App icon |
| `icon.ico` | 256x256 | Windows | App icon |
| `icon.png` | 512x512 | Linux | App icon |
| `tray.png` | 24x24 | Linux | System tray |
| `tray.ico` | 24x24 | Windows | System tray |
| `tray-Template.png` | 24x24 | macOS | System tray (template for dark/light mode) |

## Generation

Use a tool like `electron-icon-maker` or create manually:

```bash
# Install icon maker
npm install -g electron-icon-maker

# Generate from a 1024x1024 PNG source
electron-icon-maker --input=source-icon.png --output=./
```

## Placeholder

Until icons are created, the app will use Electron's default icons.
