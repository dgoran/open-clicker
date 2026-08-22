# Creating Releases

This guide explains how to create a new release of the Open Clicker Show Machine Windows app.

## Automated Release Process

The Windows executable is automatically built and uploaded to GitHub Releases when you create a version tag.

### Step-by-Step Release

1. **Ensure main branch is ready**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Update version in package.json**
   ```bash
   cd show-machine-app
   # Edit package.json: change "version": "1.0.0" to "1.1.0" (or desired version)
   ```

3. **Commit version bump**
   ```bash
   git add show-machine-app/package.json
   git commit -m "Bump version to 1.1.0"
   git push origin main
   ```

4. **Create and push version tag**
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

5. **Wait for GitHub Actions**
   - Go to: https://github.com/dgoran/open-clicker/actions
   - Watch the "Build Windows Show Machine App" workflow run
   - It will build on a Windows runner (takes ~5-10 minutes)

6. **Verify the release**
   - Go to: https://github.com/dgoran/open-clicker/releases
   - Your release should appear with two attached executables:
     - `Open Clicker Show Machine-1.1.0-portable.exe`
     - `Open Clicker Show Machine Setup 1.1.0.exe`

7. **Test the executable**
   - Download the portable .exe
   - Test on a clean Windows machine
   - Verify it connects and injects keys correctly

8. **Edit release notes** (optional)
   - GitHub auto-generates notes from commits
   - You can edit to add highlights, screenshots, or warnings

## Manual Release (If Needed)

If GitHub Actions fails or you need to build locally:

### On Windows

1. **Build locally**
   ```cmd
   cd show-machine-app
   PowerShell -ExecutionPolicy Bypass -File build.ps1
   ```

2. **Find executables**
   ```
   show-machine-app/dist/Open Clicker Show Machine-1.1.0-portable.exe
   show-machine-app/dist/Open Clicker Show Machine Setup 1.1.0.exe
   ```

3. **Create release manually on GitHub**
   - Go to: https://github.com/dgoran/open-clicker/releases
   - Click "Draft a new release"
   - Choose the tag (e.g., `v1.1.0`)
   - Write release notes
   - Upload the two .exe files
   - Publish release

## Release Checklist

Before creating a release:

- [ ] All tests pass
- [ ] README is up to date
- [ ] Version number incremented in `show-machine-app/package.json`
- [ ] Changes documented (prepare release notes)
- [ ] Breaking changes clearly noted

After creating a release:

- [ ] Download and test the portable .exe on Windows
- [ ] Download and test the installer on Windows
- [ ] Verify executables are the correct size (~150-200 MB)
- [ ] Verify no console errors on launch
- [ ] Test connecting to a real session
- [ ] Test keyboard injection works

## Version Numbering

Use [Semantic Versioning](https://semver.org/):

- **Major** (v2.0.0): Breaking changes, major features
- **Minor** (v1.1.0): New features, backward compatible
- **Patch** (v1.0.1): Bug fixes, small improvements

Examples:
- Add GUI settings panel: `v1.1.0` (minor)
- Fix keyboard injection bug: `v1.0.1` (patch)
- Require new server protocol: `v2.0.0` (major)

## Release Notes Template

```markdown
## What's New

- Feature 1
- Feature 2
- Bug fix

## Download

- **Portable**: No installation required, just run it
- **Installer**: Traditional setup with Start Menu shortcut

## Requirements

- Windows 10 or 11
- Open Clicker server running

## Known Issues

- Windows SmartScreen will warn (unsigned exe) - click "More info" → "Run anyway"

## Upgrade Notes

- No breaking changes, just download and run the new version
- Your settings are stored in [location] and will be preserved
```

## Troubleshooting Releases

### GitHub Actions Fails

Check the workflow logs:
1. Go to Actions tab
2. Click the failed workflow run
3. Check which step failed
4. Common issues:
   - `npm ci` fails: `package-lock.json` is corrupted or out of sync
   - `npm run build` fails: electron-builder error, check logs
   - Upload fails: Check glob patterns in workflow

### Wrong Version in Executable

Make sure you:
1. Updated `package.json` version before tagging
2. Committed the version change
3. Pushed the commit before creating the tag

### Executable Won't Run

- Test on multiple Windows machines (10 and 11)
- Check Windows Event Viewer for crash details
- Ensure robotjs compiled correctly (check build logs)
- Verify file size is reasonable (~150-200 MB)

## Rollback

If a release is broken:

1. **Mark release as pre-release**
   - Edit the release on GitHub
   - Check "This is a pre-release"
   - Add warning to description

2. **Create hotfix**
   - Fix the bug
   - Create a new patch version (e.g., `v1.1.1`)
   - Follow normal release process

3. **Delete bad release** (if severe)
   - Only if completely broken
   - Delete the release on GitHub
   - Delete the tag locally and remotely:
     ```bash
     git tag -d v1.1.0
     git push origin :refs/tags/v1.1.0
     ```

## Support

If you need help with releases:
- Open an issue: https://github.com/dgoran/open-clicker/issues
- Check Actions logs for build failures
- Review `BUILD_WINDOWS.md` for build troubleshooting
