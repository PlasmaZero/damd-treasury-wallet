# Put this code into your existing GitHub repository (Windows)

Work in a fresh clone to keep the previous version recoverable. Do not delete the old
folder or the existing GitHub repository.

## 1. Clone and create a feature branch

Command Prompt:

```bat
cd /d "%USERPROFILE%\OneDrive\Desktop"
git clone https://github.com/PlasmaZero/damd-treasury-wallet.git damd-wallet-mvp
cd damd-wallet-mvp
git switch -c feature/full-treasury-wallet
```

## 2. Replace the project files in this new branch

Extract the downloaded ZIP. It contains a `damd-treasury-wallet` folder.

In File Explorer, open your new `damd-wallet-mvp` clone. Keep its `.git` folder.
Remove the old project files **inside this fresh clone**, then copy the contents
of the extracted `damd-treasury-wallet` folder into it. Copy the CONTENTS, so
`package.json` is directly inside `damd-wallet-mvp`, not one folder deeper.
Include `.github`, `.gitignore`, `.gitattributes`, and `.env.example`.

Do not copy `node_modules`, `.env`, or a different `.git` folder. The ZIP contains none
of these. Keeping old `src/app.js` / `src/app.jsx` / `src/walletService.js` alongside
the replacement can leave obsolete code and lint failures; replace the folders fully.

## 3. Check the replacement

```bat
npm ci
npm run lint
npm test
npm run build
git status
git diff --stat
```

Run the local demo from README before merging. For GitHub, keep deployment files as
placeholders unless you intentionally want to publish your current test-chain addresses.
No private keys go into the repository.

## 4. Commit and push the branch

```bat
git add -A
git commit -m "Implement full treasury wallet MVP"
git push -u origin feature/full-treasury-wallet
```

Open GitHub and create a pull request from this branch into `main`. Ask a teammate
to review it and confirm Actions is green before merging. Do not force-push over main.

If Git says `nothing to commit`, verify you copied the new files into THIS clone.
Opening a file in Notepad without saving a change does not create a Git change.
