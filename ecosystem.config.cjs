module.exports = {
  apps: [{
    name: 'claude-pet',
    cwd: __dirname,
    script: require('electron'),
    args: ['.'],
    interpreter: 'none',
    restart_delay: 1000,
  }],
};
