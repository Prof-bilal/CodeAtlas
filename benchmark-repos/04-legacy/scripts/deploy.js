// Deploy script - OLD
// @ts-nocheck

const { execSync } = require('child_process');

function deploy() {
  console.log('Deploying...');
  execSync('git pull');
  execSync('npm install');
  execSync('npm run build');
  execSync('npm run migrate');
  execSync('pm2 restart all');
  console.log('Deployed');
}

deploy();
