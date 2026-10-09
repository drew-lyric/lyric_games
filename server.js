'use strict';
// Shared arcade host. Biodefenses still owns the authoritative LAN simulation.
const os = require('node:os');
const createLanServer = require('./lyric_biodefenses/server.js').createLanServer;

function createGamesServer(options) {
  return createLanServer(Object.assign({}, options || {}, {
    staticRoot: __dirname,
    staticMaps: [
      { prefix: '/', directory: '.', files: ['index.html', 'launcher.css', 'launcher.js'], directories: [] },
      { prefix: '/lyric_biodefenses/', directory: 'lyric_biodefenses', files: ['index.html', 'styles.css', 'trivia-review.html'], directories: ['js', 'assets'] },
      { prefix: '/lyric_galaga/', directory: 'lyric_galaga', files: ['index.html', 'styles.css'], directories: ['js', 'assets'] },
      { prefix: '/lyric_sterilesolve/', directory: 'lyric_sterilesolve', files: ['index.html', 'styles.css'], directories: ['js', 'assets'] },
      { prefix: '/', directory: 'lyric_biodefenses', files: ['styles.css', 'trivia-review.html'], directories: ['js', 'assets'] }
    ]
  }));
}
module.exports = { createGamesServer: createGamesServer };

if (require.main === module) {
  const args = process.argv.slice(2);
  let port = Number(process.env.PORT || 3000);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--port' && args[index + 1] !== undefined) port = Number(args[++index]);
    else { console.error('Usage: node server.js [--port 3000]'); process.exit(1); }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('Port must be between 1 and 65535.'); process.exit(1); }
  const application = createGamesServer({ port: port, onError: function (error) { console.error(error.message); } });
  application.start().then(function () {
    console.log('Lyric Games is running, including Biodefenses LAN play.');
    console.log('This computer: http://localhost:' + port);
    for (const interfaces of Object.values(os.networkInterfaces())) {
      for (const address of interfaces || []) if (address.family === 'IPv4' && !address.internal) console.log('LAN address:   http://' + address.address + ':' + port);
    }
    console.log('Both players open the same LAN address, choose Biodefenses, then create or join a room.');
    console.log('Press Ctrl+C to stop.');
  }).catch(function (error) { console.error('Cannot start Lyric Games: ' + error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, function () { application.close().then(function () { process.exit(0); }); });
}
