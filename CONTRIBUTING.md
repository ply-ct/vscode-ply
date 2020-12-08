## Dev Setup (temp for flowbee branch)

1. Install VSCode ESLint plugin

2. Build and link flowbee repository (master branch):
   ```
   git clone https://github.com/donaldoakes/flowbee.git
   cd flowbee
   npm install
   npm run build
   npm link
   ```

3. Build and link ply (flowbee branch):
   ```
   git clone https://github.com/ply-ct/ply.git
   cd ply
   git checkout flowbee
   npm install
   npm link flowbee
   npm run build
   npm link
   ```

4. Build ply-vscode (flowbee branch)
   ```
   git clone https://github.com/ply-ct/vscode-ply.git
   cd vscode-ply
   git checkout flowbee
   cd vscode-ply
   npm install
   npm link flowbee
   npm link ply-ct
   npm run build
   ```
